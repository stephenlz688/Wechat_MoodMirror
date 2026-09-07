/**
 * index.js —— 3D 换装模特页面
 *  - 初始化 WebGL 画布与 three.js 场景
 *  - 加载 GLB 写实人体模型
 *  - 触摸交互：仅水平旋转、双指缩放
 *  - 性别切换：切换男/女模型
 *  - 衣服：上传图片 → 纹理上身 / 脱下
 */
import { createScopedThreejs } from 'threejs-miniprogram'
import { Mannequin, GENDER_MALE, GENDER_FEMALE } from '../../utils/model'

// 模型 CDN 地址（模型不打入小程序包，从网络下载后缓存到本地）
const MODEL_URLS = {
  male: 'https://cdn.jsdelivr.net/gh/stephenlz688/Wechat_MoodMirror@main/models/Xbot.glb',
  female: 'https://cdn.jsdelivr.net/gh/stephenlz688/Wechat_MoodMirror@main/models/Xbot.glb' // TODO: 替换为女性模型
}

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
        renderer.setClearColor(0x000000, 0)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 30)
        camera.position.set(0, 0.95, 2.8)
        camera.lookAt(0, 0.85, 0)

        // 灯光
        scene.add(new THREE.AmbientLight(0xffffff, 0.65))
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9)
        keyLight.position.set(2.5, 4, 3.5)
        scene.add(keyLight)
        const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3)
        fillLight.position.set(-3, 1.5, -2.5)
        scene.add(fillLight)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a44, 0.5))

        // 模特
        const mannequin = new Mannequin(THREE, scene)
        mannequin.group.rotation.y = 0.3

        // 加载模型（开发者工具中文件已在本地；真机如需分包下载可在此处加 wx.loadSubpackage）
        this._loadModel(mannequin, MODEL_URLS.male)

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
  // 加载模型（小程序环境：读取本地文件 → ArrayBuffer → GLTFLoader.parse）
  // -------------------------------------------------------------------------
  _loadModel(mannequin, url) {
    const fs = wx.getFileSystemManager()
    const gender = this.data.gender
    const cachePath = `${wx.env.USER_DATA_PATH}/model-${gender}.glb`

    // 1. 尝试读取本地缓存
    fs.readFile({
      filePath: cachePath,
      success: (res) => {
        console.log('[index] 使用本地缓存模型:', cachePath)
        mannequin.loadFromBuffer(res.data, () => {
          this.setData({ ready: true })
        })
      },
      fail: () => {
        // 2. 本地没有，从网络下载
        console.log('[index] 从网络下载模型:', url)
        wx.showLoading({ title: '加载模型...', mask: true })
        wx.downloadFile({
          url,
          success: (res) => {
            if (res.statusCode !== 200) {
              wx.hideLoading()
              wx.showToast({ title: '模型下载失败', icon: 'none' })
              return
            }
            // 3. 下载成功，保存到本地缓存
            fs.saveFile({
              tempFilePath: res.tempFilePath,
              filePath: cachePath,
              success: () => {
                fs.readFile({
                  filePath: cachePath,
                  success: (r) => {
                    wx.hideLoading()
                    mannequin.loadFromBuffer(r.data, () => {
                      this.setData({ ready: true })
                    })
                  },
                  fail: (err) => {
                    wx.hideLoading()
                    console.error('[index] 读取缓存模型失败:', err)
                    wx.showToast({ title: '模型加载失败', icon: 'none' })
                  }
                })
              },
              fail: () => {
                // 保存失败，直接读临时文件
                fs.readFile({
                  filePath: res.tempFilePath,
                  success: (r) => {
                    wx.hideLoading()
                    mannequin.loadFromBuffer(r.data, () => {
                      this.setData({ ready: true })
                    })
                  },
                  fail: (err) => {
                    wx.hideLoading()
                    console.error('[index] 读取临时模型失败:', err)
                    wx.showToast({ title: '模型加载失败', icon: 'none' })
                  }
                })
              }
            })
          },
          fail: (err) => {
            wx.hideLoading()
            console.error('[index] 模型下载失败:', err)
            wx.showToast({ title: '模型下载失败，请检查网络', icon: 'none' })
          }
        })
      }
    })
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
      // 仅水平旋转
      const dx = ts[0].clientX - this._touch.lastX
      this._touch.lastX = ts[0].clientX
      this._touch.lastY = ts[0].clientY
      this.mannequin.group.rotation.y += dx * 0.008
    } else if (ts.length === 2) {
      // 双指缩放
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
    this.mannequin.setGender(g, MODEL_URLS[g], () => {
      // 模型加载完成
    })
    this.setData({ gender: g })
  },

  // -------------------------------------------------------------------------
  // 衣服
  // -------------------------------------------------------------------------
  onChooseCloth() {
    if (!this.mannequin || !this.mannequin.loaded) return
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
