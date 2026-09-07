/**
 * index.js —— 3D 换装模特页面
 *  - 初始化 WebGL 画布与 three.js 场景
 *  - 程序化建模仿真人体（默认白 T 恤 + 黑裤子）
 *  - 触摸交互：仅水平旋转、双指缩放
 *  - 性别切换：男/女体型实时切换
 *  - 衣服：上传图片 → 替换 T 恤纹理 / 恢复白 T 恤
 */
import { createScopedThreejs } from 'threejs-miniprogram'
import { Mannequin } from '../../utils/model'

Page({
  data: {
    gender: 'male',
    clothed: false,
    ready: false,
    statusBarHeight: 24
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: win.statusBarHeight || 24 })
  },

  onReady() {
    wx.createSelectorQuery()
      .select('#gl')
      .node()
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          wx.showToast({ title: '当前环境不支持 WebGL', icon: 'none' })
          return
        }
        this._init3d(res[0].node)
      })
  },

  // -------------------------------------------------------------------------
  // 3D 场景初始化
  // -------------------------------------------------------------------------
  _init3d(canvas) {
    wx.createSelectorQuery()
      .select('.stage')
      .boundingClientRect((rect) => {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const dpr = win.pixelRatio || 2
        const width = rect.width || 300
        const height = rect.height || 400

        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)

        const THREE = createScopedThreejs(canvas)
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
        renderer.setPixelRatio(dpr)
        // 第三个参数 false：不更新 canvas.style（避免触发微信 this._getData 报错）
        renderer.setSize(width, height, false)
        renderer.outputEncoding = THREE.sRGBEncoding
        renderer.setClearColor(0x000000, 0)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 30)
        camera.position.set(0, 0.9, 2.9)
        camera.lookAt(0, 0.85, 0)

        // 灯光
        scene.add(new THREE.AmbientLight(0xffffff, 0.7))
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.95)
        keyLight.position.set(2.5, 4, 3.5)
        scene.add(keyLight)
        const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3)
        fillLight.position.set(-3, 1.5, -2.5)
        scene.add(fillLight)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a44, 0.5))

        // 模特（程序化建模，构造即就绪）
        const mannequin = new Mannequin(THREE, scene)
        mannequin.group.rotation.y = 0.3
        this.setData({ ready: true })

        // 触控状态
        this._touch = { lastX: 0, lastY: 0, pinchDist: 0 }

        // 渲染循环
        let last = Date.now()
        const loop = () => {
          const now = Date.now()
          const dt = Math.min(0.05, (now - last) / 1000)
          last = now
          mannequin.update(dt)
          camera.lookAt(0, 0.85, 0)
          renderer.render(scene, camera)
          if (canvas.requestAnimationFrame) canvas.requestAnimationFrame(loop)
          else setTimeout(loop, 16)
        }
        loop()

        this.canvas = canvas
        this.renderer = renderer
        this.camera = camera
        this.scene = scene
        this.mannequin = mannequin
      })
      .exec()
  },

  // -------------------------------------------------------------------------
  // 触摸交互（仅水平旋转 + 双指缩放）
  // -------------------------------------------------------------------------
  onTouchStart(e) {
    const t = e.touches[0]
    this._touch.lastX = t.clientX
    this._touch.lastY = t.clientY
    this._touch.pinchDist = 0
  },

  onTouchMove(e) {
    if (!this.mannequin) return
    const ts = e.touches
    if (ts.length === 1) {
      const dx = ts[0].clientX - this._touch.lastX
      this._touch.lastX = ts[0].clientX
      this._touch.lastY = ts[0].clientY
      this.mannequin.group.rotation.y += dx * 0.008
    } else if (ts.length === 2) {
      const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY)
      if (this._touch.pinchDist > 0) {
        const dist = this.camera.position.z * (this._touch.pinchDist / d)
        this.camera.position.z = Math.max(1.8, Math.min(4.5, dist))
      }
      this._touch.pinchDist = d
    }
  },

  onTouchEnd() {
    this._touch.pinchDist = 0
  },

  // -------------------------------------------------------------------------
  // 性别切换
  // -------------------------------------------------------------------------
  onSwitchGender(e) {
    const g = e.currentTarget.dataset.gender
    if (g === this.data.gender || !this.mannequin) return
    this.mannequin.setGender(g)
    this.setData({ gender: g })
  },

  // -------------------------------------------------------------------------
  // 衣服
  // -------------------------------------------------------------------------
  onChooseCloth() {
    if (!this.mannequin) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath
        const T = this.mannequin.T
        const loader = new T.TextureLoader()
        loader.load(
          path,
          (texture) => {
            texture.encoding = T.sRGBEncoding
            this.mannequin.setCloth(texture)
            this.setData({ clothed: true })
          },
          undefined,
          () => {
            wx.showToast({ title: '图片加载失败，请换一张', icon: 'none' })
          }
        )
      }
    })
  },

  onResetCloth() {
    if (!this.mannequin) return
    this.mannequin.clearCloth()
    this.setData({ clothed: false })
  },

  onUnload() {
    if (this.renderer && this.renderer.dispose) this.renderer.dispose()
  }
})
