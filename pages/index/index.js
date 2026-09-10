/**
 * index.js —— 衣镜 · 3D 试衣页面
 *  - 加载混元3D 生成的仿真男女 GLB 模型（three.js r108 + GLTFLoader）
 *  - 默认白 T 恤 + 黑裤子；触摸仅水平旋转、双指缩放
 *  - 性别切换实时切换；上传衣服图片叠加到 T 恤区域
 */
import { createScopedThreejs } from 'threejs-miniprogram'
import { registerGLTFLoader } from '../../utils/gltf-loader'
import { HumanModel } from '../../utils/human-model'
import { CONFIG } from '../../utils/config'

Page({
  data: {
    gender: 'male',
    clothed: false,
    ready: false,
    loading: true,
    loadingText: '正在加载 3D 模特…',
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
        registerGLTFLoader(THREE) // 挂载 THREE.GLTFLoader

        const gl = canvas.getContext('webgl')
        const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true })
        renderer.setPixelRatio(dpr)
        // 第三参 false：不更新 canvas.style（避免微信 this._getData 渲染层错误）
        renderer.setSize(width, height, false)
        renderer.outputEncoding = THREE.sRGBEncoding
        renderer.setClearColor(0x000000, 0)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 30)
        camera.position.set(0, 0.85, 3.7)
        camera.lookAt(0, 0.8, 0)

        // 灯光
        scene.add(new THREE.AmbientLight(0xffffff, 0.78))
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0)
        keyLight.position.set(2.5, 4, 3.5)
        scene.add(keyLight)
        const fillLight = new THREE.DirectionalLight(0xbfd0ff, 0.35)
        fillLight.position.set(-3, 1.5, -2.5)
        scene.add(fillLight)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a44, 0.55))

        // 小程序离屏 2d 画布，用于读取模型纹理像素、识别白色 T 恤
        const readImagePixels = (image) => {
          const w = image.width || 1024
          const h = image.height || 1024
          const off = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
          const ctx = off.getContext('2d')
          ctx.drawImage(image, 0, 0, w, h)
          const imgData = ctx.getImageData(0, 0, w, h)
          return { width: w, height: h, data: imgData.data }
        }

        const human = new HumanModel(THREE, scene, {
          targetHeight: CONFIG.TARGET_HEIGHT,
          readImagePixels
        })
        human.group.rotation.y = 0.25

        this.canvas = canvas
        this.renderer = renderer
        this.camera = camera
        this.scene = scene
        this.THREE = THREE
        this.human = human
        this._touch = { lastX: 0, pinchDist: 0 }

        // 先加载当前性别，就绪即显示；另一性别后台加载，切换无感
        this._loadGender(this.data.gender, true).then(() => {
          const other = this.data.gender === 'male' ? 'female' : 'male'
          this._loadGender(other, false).catch(() => {})
        })

        // 渲染循环
        const loop = () => {
          human.update()
          camera.lookAt(0, 0.8, 0)
          renderer.render(scene, camera)
          if (canvas.requestAnimationFrame) canvas.requestAnimationFrame(loop)
          else setTimeout(loop, 16)
        }
        loop()
      })
      .exec()
  },

  // 下载并加载某个性别的 GLB
  _loadGender(gender, isPrimary) {
    if (isPrimary) this.setData({ loading: true, loadingText: `正在加载${gender === 'male' ? '男性' : '女性'}模特…` })
    const url = `${CONFIG.MODEL_BASE_URL}/${gender}.glb`
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode !== 200) {
            reject(new Error('HTTP ' + res.statusCode))
            return
          }
          wx.getFileSystemManager().readFile({
            filePath: res.tempFilePath,
            success: (r) => {
              this.human.addGender(gender, r.data, this._parseBuffer()).then((model) => {
                if (isPrimary) {
                  this.setData({ loading: false, ready: true })
                }
                resolve(model)
              }).catch((err) => {
                if (isPrimary) {
                  this.setData({ loadingText: '模型解析失败：' + (err && err.message || err) })
                }
                reject(err)
              })
            },
            fail: reject
          })
        },
        fail: (err) => {
          if (isPrimary) {
            this.setData({
              loadingText: '模型下载失败，请确认已启动本地模型服务（node preview/server.js）并勾选「不校验合法域名」'
            })
          }
          reject(err)
        }
      })
    })
  },

  _parseBuffer() {
    const loader = new this.THREE.GLTFLoader()
    return (buffer) => new Promise((resolve, reject) => {
      loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject)
    })
  },

  // -------------------------------------------------------------------------
  // 触摸交互（仅水平旋转 + 双指缩放）
  // -------------------------------------------------------------------------
  onTouchStart(e) {
    this._touch.lastX = e.touches[0].clientX
    this._touch.pinchDist = 0
  },

  onTouchMove(e) {
    if (!this.human) return
    const ts = e.touches
    if (ts.length === 1) {
      const dx = ts[0].clientX - this._touch.lastX
      this._touch.lastX = ts[0].clientX
      this.human.group.rotation.y += dx * 0.008
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
    if (g === this.data.gender || !this.human) return
    if (this.human.loaded[g]) {
      this.human.setGender(g)
      this.setData({ gender: g })
    } else {
      // 另一性别尚未加载完，现场加载
      wx.showLoading({ title: '切换中…', mask: true })
      this._loadGender(g, false).then(() => {
        this.human.setGender(g)
        this.setData({ gender: g })
        wx.hideLoading()
      }).catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '模型未就绪', icon: 'none' })
      })
    }
  },

  // -------------------------------------------------------------------------
  // 衣服：选择图片 → 叠加到 T 恤
  // -------------------------------------------------------------------------
  onChooseCloth() {
    if (!this.human || !this.data.ready) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath
        const T = this.THREE
        const loader = new T.TextureLoader()
        loader.load(
          path,
          (texture) => {
            texture.encoding = T.sRGBEncoding
            texture.wrapS = T.RepeatWrapping
            texture.wrapT = T.RepeatWrapping
            this.human.setCloth(texture)
            this.setData({ clothed: true })
          },
          undefined,
          () => wx.showToast({ title: '图片加载失败，请换一张', icon: 'none' })
        )
      }
    })
  },

  onResetCloth() {
    if (!this.human) return
    this.human.clearCloth()
    this.setData({ clothed: false })
  },

  onUnload() {
    if (this.renderer && this.renderer.dispose) this.renderer.dispose()
  }
})
