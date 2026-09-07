/**
 * index.js —— 3D 换装模特页面
 *  - 初始化 WebGL 画布与 three.js 场景
 *  - 触摸交互：单指旋转模型、双指缩放
 *  - 性别切换：平滑变形动画
 *  - 衣服：上传图片 → 纹理上身 / 脱下
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
        renderer.setSize(width, height)
        renderer.outputEncoding = THREE.sRGBEncoding
        renderer.setClearColor(0x000000, 0) // 透明背景，使用页面 CSS 渐变

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 30)
        camera.position.set(0, 1.0, 3.1)
        camera.lookAt(0, 0.88, 0)

        // 灯光：环境光 + 主光 + 补光 + 半球光
        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9)
        keyLight.position.set(2.5, 4, 3.5)
        scene.add(keyLight)
        const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3)
        fillLight.position.set(-3, 1.5, -2.5)
        scene.add(fillLight)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a44, 0.5))

        // 模特
        const mannequin = new Mannequin(THREE, scene)
        mannequin.group.rotation.y = 0.5 // 初始转一个角度，更有立体感

        // 触控状态
        this._touch = { lastX: 0, lastY: 0, pinchDist: 0 }

        // 渲染循环
        let last = Date.now()
        const loop = () => {
          const now = Date.now()
          const dt = Math.min(0.05, (now - last) / 1000)
          last = now
          mannequin.update(dt)
          camera.lookAt(0, 0.88, 0)
          renderer.render(scene, camera)
          if (canvas.requestAnimationFrame) canvas.requestAnimationFrame(loop)
          else setTimeout(loop, 16)
        }
        loop()

        // 保存引用
        this.canvas = canvas
        this.renderer = renderer
        this.camera = camera
        this.scene = scene
        this.mannequin = mannequin
        this.setData({ ready: true })
      })
      .exec()
  },

  // -------------------------------------------------------------------------
  // 触摸交互
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
      // 单指旋转
      const dx = ts[0].clientX - this._touch.lastX
      const dy = ts[0].clientY - this._touch.lastY
      this._touch.lastX = ts[0].clientX
      this._touch.lastY = ts[0].clientY
      const g = this.mannequin.group
      g.rotation.y += dx * 0.008
      g.rotation.x = Math.max(-0.5, Math.min(0.5, g.rotation.x + dy * 0.005))
    } else if (ts.length === 2) {
      // 双指缩放
      const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY)
      if (this._touch.pinchDist > 0) {
        const dist = this.camera.position.z * (this._touch.pinchDist / d)
        this.camera.position.z = Math.max(2.0, Math.min(5.0, dist))
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
