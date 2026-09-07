/**
 * model.js —— 3D 写实模特（GLB 模型加载 + 衣服贴图层）
 *
 * 功能：
 *  1. 加载 GLB 格式的写实人体模型（男/女），自动归一化到合适尺寸
 *  2. 独立的衣服贴图层（躯干 + 袖子），不依赖底层模型 UV
 *  3. 性别切换 = 切换男/女模型
 *  4. 上传衣服图片 → 纹理贴到衣服层
 *
 * 模型来源：支持任意标准人体 GLB 模型（如 Ready Player Me、Mixamo 等）。
 */

import { registerGLTFLoader } from './gltf-loader.js'

export const GENDER_MALE = 'male'
export const GENDER_FEMALE = 'female'

export class Mannequin {
  /**
   * @param {object} THREE - createScopedThreejs(canvas) 返回的 three 作用域
   * @param {object} scene
   */
  constructor(THREE, scene) {
    this.T = THREE
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    // 注册 GLTFLoader 到当前 THREE 作用域
    registerGLTFLoader(THREE)

    // 状态
    this.model = null
    this.loaded = false
    this.gender = GENDER_MALE
    this.clothGroup = null
    this.clothMeshes = []
    this.clothMat = null

    // 衣服层默认材质（未穿衣时的木偶色占位，默认隐藏）
    this.clothBaseMat = new THREE.MeshStandardMaterial({
      color: 0xd9d1c0, roughness: 0.85, metalness: 0.05
    })
  }

  // -------------------------------------------------------------------------
  // 模型加载（浏览器环境：直接传 URL）
  // -------------------------------------------------------------------------
  loadModel(url, onLoad) {
    const loader = new this.T.GLTFLoader()
    loader.load(
      url,
      (gltf) => this._onModelLoaded(gltf, onLoad),
      undefined,
      (err) => {
        console.error('[Mannequin] 模型加载失败:', url, err)
      }
    )
  }

  /**
   * 从 ArrayBuffer 加载（小程序环境：wx.getFileSystemManager().readFile 后调用）
   * @param {ArrayBuffer} buffer
   * @param {Function} onLoad
   */
  loadFromBuffer(buffer, onLoad) {
    const loader = new this.T.GLTFLoader()
    loader.parse(
      buffer,
      '',
      (gltf) => this._onModelLoaded(gltf, onLoad),
      (err) => {
        console.error('[Mannequin] 模型解析失败:', err)
      }
    )
  }

  _onModelLoaded(gltf, onLoad) {
    const T = this.T

    // 移除旧模型
    if (this.model) {
      this.group.remove(this.model)
      this.model.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry.dispose()
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
            else obj.material.dispose()
          }
        }
      })
    }

    this.model = gltf.scene
    this.group.add(this.model)

    // 归一化：缩放到总高 1.7，脚底对齐 y=0，居中 x/z
    const box = new T.Box3().setFromObject(this.model)
    const size = new T.Vector3()
    const center = new T.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const scale = 1.7 / size.y
    this.model.scale.setScalar(scale)
    this.model.position.x = -center.x * scale
    this.model.position.y = -box.min.y * scale
    this.model.position.z = -center.z * scale

    // 开启阴影 + 关闭视锥剔除 + 统一皮肤色材质
    // （部分 GLB 模型原始材质为全黑或全金属，在无环境贴图时不可见）
    const skinMat = new T.MeshStandardMaterial({
      color: 0xd4a574,
      metalness: 0.1,
      roughness: 0.7
    })
    this.model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
        obj.frustumCulled = false
        obj.material = skinMat
      }
    })

    // 创建衣服贴图层
    this._createClothLayer()

    this.loaded = true
    if (onLoad) onLoad()
  }

  // -------------------------------------------------------------------------
  // 衣服贴图层（独立于底层模型，按标准人体比例定位）
  // 模型归一化后：总高 1.7，脚底 y=0，头顶 y=1.7
  // -------------------------------------------------------------------------
  _createClothLayer() {
    const T = this.T

    // 移除旧衣服层
    if (this.clothGroup) {
      this.group.remove(this.clothGroup)
    }

    this.clothGroup = new T.Group()
    this.clothMeshes = []

    // ---- 躯干（上衣主体）----
    const torso = new T.Mesh(
      new T.CylinderGeometry(0.215, 0.175, 0.56, 24),
      this.clothBaseMat
    )
    torso.position.set(0, 1.06, 0)
    this.clothGroup.add(torso)
    this.clothMeshes.push(torso)

    // ---- 袖子（左右上臂）----
    ;[-1, 1].forEach((side) => {
      const sleeve = new T.Mesh(
        new T.CylinderGeometry(0.072, 0.06, 0.34, 16),
        this.clothBaseMat
      )
      sleeve.position.set(side * 0.245, 1.02, 0)
      sleeve.rotation.z = -side * 0.12
      this.clothGroup.add(sleeve)
      this.clothMeshes.push(sleeve)
    })

    // 默认隐藏衣服层（未穿衣状态）
    this.clothGroup.visible = false
    this.group.add(this.clothGroup)
  }

  // -------------------------------------------------------------------------
  // 性别切换
  // -------------------------------------------------------------------------
  setGender(gender, modelUrl, onLoad) {
    if (gender !== GENDER_MALE && gender !== GENDER_FEMALE) return
    this.gender = gender
    if (modelUrl) {
      this.loaded = false
      this.loadModel(modelUrl, onLoad)
    }
  }

  // -------------------------------------------------------------------------
  // 衣服贴图
  // -------------------------------------------------------------------------
  /**
   * @param {object} texture - THREE.Texture（调用方负责设置 encoding）
   */
  setCloth(texture) {
    const T = this.T
    if (!this.clothMat) {
      this.clothMat = new T.MeshStandardMaterial({
        map: texture, roughness: 0.85, metalness: 0.05
      })
    } else {
      this.clothMat.map = texture
      this.clothMat.needsUpdate = true
    }
    for (let i = 0; i < this.clothMeshes.length; i++) {
      this.clothMeshes[i].material = this.clothMat
    }
    if (this.clothGroup) this.clothGroup.visible = true
  }

  clearCloth() {
    if (this.clothGroup) this.clothGroup.visible = false
    if (this.clothMat) {
      this.clothMat.dispose()
      this.clothMat = null
    }
    for (let i = 0; i < this.clothMeshes.length; i++) {
      this.clothMeshes[i].material = this.clothBaseMat
    }
  }

  // -------------------------------------------------------------------------
  // 每帧更新（预留：可加 idle 动画、呼吸等）
  // -------------------------------------------------------------------------
  update(dt) {
    // 静态模特，暂无动画
  }
}
