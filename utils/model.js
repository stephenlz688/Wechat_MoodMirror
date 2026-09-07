/**
 * model.js —— 程序化仿真人体模特
 *  - 比例协调的男/女人体（头/躯干/四肢/关节平滑过渡）
 *  - 默认身着白 T 恤 + 黑裤子
 *  - 上传衣服图片后替换 T 恤纹理（躯干 + 上臂）
 *  - 仅水平旋转（由外部控制 group.rotation.y）
 */

// 男性体型参数（总高约 1.7m，脚底 y≈0，各部位边界重叠消除间隙）
const MALE = {
  head: { r: 0.10, scaleY: 1.15, y: 1.56 },
  neck: { rTop: 0.048, rBot: 0.052, h: 0.08, y: 1.42 },
  // 上躯干（T恤）：Lathe 点 [半径, 局部Y]，局部Y 0→h
  upperTorso: {
    points: [[0.155, 0.38], [0.195, 0.28], [0.19, 0.16], [0.17, 0.0]],
    y: 1.11, h: 0.38
  },
  // 下躯干（皮肤）：腰到胯
  lowerTorso: {
    points: [[0.17, 0.18], [0.155, 0.09], [0.17, 0.0]],
    y: 0.96, h: 0.18
  },
  pelvis: { r: 0.155, scaleY: 0.55, y: 0.87 },
  upperArm: { rTop: 0.055, rBot: 0.045, h: 0.28, x: 0.21, y: 1.22 },
  elbow: { r: 0.05, x: 0.21, y: 1.07 },
  forearm: { rTop: 0.043, rBot: 0.035, h: 0.26, x: 0.21, y: 0.93 },
  hand: { r: 0.047, scaleY: 1.3, x: 0.21, y: 0.79 },
  thigh: { rTop: 0.078, rBot: 0.062, h: 0.36, x: 0.09, y: 0.60 },
  knee: { r: 0.058, x: 0.09, y: 0.42 },
  calf: { rTop: 0.056, rBot: 0.04, h: 0.34, x: 0.09, y: 0.25 },
  foot: { w: 0.075, h: 0.05, d: 0.14, x: 0.09, y: 0.045, z: 0.03 },
  shoulder: { r: 0.072, x: 0.185, y: 1.36 },
  chest: null
}

// 女性体型参数
const FEMALE = {
  head: { r: 0.10, scaleY: 1.12, y: 1.58 },
  neck: { rTop: 0.043, rBot: 0.048, h: 0.08, y: 1.42 },
  upperTorso: {
    points: [[0.13, 0.38], [0.17, 0.26], [0.15, 0.14], [0.13, 0.0]],
    y: 1.11, h: 0.38
  },
  lowerTorso: {
    points: [[0.13, 0.18], [0.14, 0.09], [0.175, 0.0]],
    y: 0.96, h: 0.18
  },
  pelvis: { r: 0.165, scaleY: 0.55, y: 0.87 },
  upperArm: { rTop: 0.048, rBot: 0.04, h: 0.27, x: 0.175, y: 1.22 },
  elbow: { r: 0.044, x: 0.175, y: 1.07 },
  forearm: { rTop: 0.038, rBot: 0.031, h: 0.25, x: 0.175, y: 0.93 },
  hand: { r: 0.041, scaleY: 1.3, x: 0.175, y: 0.79 },
  thigh: { rTop: 0.078, rBot: 0.06, h: 0.38, x: 0.085, y: 0.62 },
  knee: { r: 0.055, x: 0.085, y: 0.43 },
  calf: { rTop: 0.05, rBot: 0.035, h: 0.38, x: 0.085, y: 0.24 },
  foot: { w: 0.068, h: 0.048, d: 0.13, x: 0.085, y: 0.045, z: 0.03 },
  shoulder: { r: 0.062, x: 0.155, y: 1.36 },
  chest: { r: 0.072, x: 0.08, y: 1.28, z: 0.105 }
}

const SKIN_COLOR = 0xd4a574
const SHIRT_COLOR = 0xffffff
const PANTS_COLOR = 0x1a1a1a
const HAIR_COLOR = 0x2a1a0a

export class Mannequin {
  constructor(THREE, scene) {
    this.T = THREE
    this.scene = scene
    this.gender = 'male'
    this.group = new THREE.Group()
    this.scene.add(this.group)
    this.clothTexture = null
    this.shirtMat = null
    this.loaded = true
    this._build()
  }

  // -----------------------------------------------------------------------
  // 构建人体
  // -----------------------------------------------------------------------
  _build() {
    // 清除旧模型
    while (this.group.children.length > 0) {
      const c = this.group.children[0]
      this.group.remove(c)
      if (c.geometry) c.geometry.dispose()
    }

    const T = this.T
    const p = this.gender === 'female' ? FEMALE : MALE

    // 材质
    const skinMat = new T.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.75, metalness: 0.05 })
    this.shirtMat = new T.MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.85, metalness: 0.0 })
    const pantsMat = new T.MeshStandardMaterial({ color: PANTS_COLOR, roughness: 0.8, metalness: 0.05 })
    const hairMat = new T.MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.9, metalness: 0.0 })

    // 如果之前有衣服纹理，应用到新T恤材质
    if (this.clothTexture) {
      this.shirtMat.map = this.clothTexture
      this.shirtMat.color.setHex(0xffffff)
      this.shirtMat.needsUpdate = true
    }

    const add = (mesh) => {
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      return mesh
    }

    // ---- 头 ----
    const head = add(new T.Mesh(new T.SphereGeometry(p.head.r, 24, 18), skinMat))
    head.scale.y = p.head.scaleY
    head.position.y = p.head.y
    // 头发（头顶半球）
    const hair = add(new T.Mesh(
      new T.SphereGeometry(p.head.r * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat
    ))
    hair.scale.y = p.head.scaleY
    hair.position.y = p.head.y + p.head.r * 0.15
    // 鼻子
    const nose = add(new T.Mesh(new T.ConeGeometry(0.018, 0.04, 8), skinMat))
    nose.rotation.x = Math.PI / 2
    nose.position.set(0, p.head.y - 0.01, p.head.r * 0.95)

    // ---- 脖子 ----
    const neck = add(new T.Mesh(
      new T.CylinderGeometry(p.neck.rTop, p.neck.rBot, p.neck.h, 12),
      skinMat
    ))
    neck.position.y = p.neck.y

    // ---- 上躯干（T恤）----
    const upperTorso = add(new T.Mesh(
      this._lathe(p.upperTorso.points),
      this.shirtMat
    ))
    upperTorso.position.y = p.upperTorso.y

    // ---- 下躯干（皮肤）----
    const lowerTorso = add(new T.Mesh(
      this._lathe(p.lowerTorso.points),
      skinMat
    ))
    lowerTorso.position.y = p.lowerTorso.y

    // ---- 胯部 ----
    const pelvis = add(new T.Mesh(new T.SphereGeometry(p.pelvis.r, 20, 12), pantsMat))
    pelvis.scale.y = p.pelvis.scaleY
    pelvis.position.y = p.pelvis.y

    // ---- 女性胸部 ----
    if (p.chest) {
      for (const side of [-1, 1]) {
        const breast = add(new T.Mesh(
          new T.SphereGeometry(p.chest.r, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
          this.shirtMat
        ))
        breast.position.set(side * p.chest.x, p.chest.y, p.chest.z)
        breast.rotation.x = -0.3
      }
    }

    // ---- 肩关节球（T恤）----
    for (const side of [-1, 1]) {
      const shoulder = add(new T.Mesh(new T.SphereGeometry(p.shoulder.r, 16, 12), this.shirtMat))
      shoulder.position.set(side * p.shoulder.x, p.shoulder.y, 0)
    }

    // ---- 上臂（T恤）----
    for (const side of [-1, 1]) {
      const arm = add(new T.Mesh(
        new T.CylinderGeometry(p.upperArm.rTop, p.upperArm.rBot, p.upperArm.h, 12),
        this.shirtMat
      ))
      arm.position.set(side * p.upperArm.x, p.upperArm.y, 0)
    }

    // ---- 肘关节（皮肤）----
    for (const side of [-1, 1]) {
      const elbow = add(new T.Mesh(new T.SphereGeometry(p.elbow.r, 12, 8), skinMat))
      elbow.position.set(side * p.elbow.x, p.elbow.y, 0)
    }

    // ---- 前臂（皮肤）----
    for (const side of [-1, 1]) {
      const forearm = add(new T.Mesh(
        new T.CylinderGeometry(p.forearm.rTop, p.forearm.rBot, p.forearm.h, 12),
        skinMat
      ))
      forearm.position.set(side * p.forearm.x, p.forearm.y, 0)
    }

    // ---- 手（皮肤）----
    for (const side of [-1, 1]) {
      const hand = add(new T.Mesh(new T.SphereGeometry(p.hand.r, 12, 8), skinMat))
      hand.scale.y = p.hand.scaleY
      hand.position.set(side * p.hand.x, p.hand.y, 0)
    }

    // ---- 大腿（裤子）----
    for (const side of [-1, 1]) {
      const thigh = add(new T.Mesh(
        new T.CylinderGeometry(p.thigh.rTop, p.thigh.rBot, p.thigh.h, 12),
        pantsMat
      ))
      thigh.position.set(side * p.thigh.x, p.thigh.y, 0)
    }

    // ---- 膝关节（裤子）----
    for (const side of [-1, 1]) {
      const knee = add(new T.Mesh(new T.SphereGeometry(p.knee.r, 12, 8), pantsMat))
      knee.position.set(side * p.knee.x, p.knee.y, 0)
    }

    // ---- 小腿（裤子）----
    for (const side of [-1, 1]) {
      const calf = add(new T.Mesh(
        new T.CylinderGeometry(p.calf.rTop, p.calf.rBot, p.calf.h, 12),
        pantsMat
      ))
      calf.position.set(side * p.calf.x, p.calf.y, 0)
    }

    // ---- 脚（皮肤）----
    for (const side of [-1, 1]) {
      const foot = add(new T.Mesh(
        new T.BoxGeometry(p.foot.w, p.foot.h, p.foot.d),
        skinMat
      ))
      foot.position.set(side * p.foot.x, p.foot.y, p.foot.z)
    }
  }

  // 创建 LatheGeometry（从 [半径, Y] 点数组）
  _lathe(points) {
    const T = this.T
    const pts = points.map(([r, y]) => new T.Vector2(r, y))
    return new T.LatheGeometry(pts, 24)
  }

  // -----------------------------------------------------------------------
  // 性别切换
  // -----------------------------------------------------------------------
  setGender(gender) {
    if (gender === this.gender) return
    this.gender = gender
    this._build()
  }

  // -----------------------------------------------------------------------
  // 衣服贴图
  // -----------------------------------------------------------------------
  setCloth(texture) {
    this.clothTexture = texture
    if (this.shirtMat) {
      this.shirtMat.map = texture
      this.shirtMat.color.setHex(0xffffff)
      this.shirtMat.needsUpdate = true
    }
  }

  clearCloth() {
    this.clothTexture = null
    if (this.shirtMat) {
      this.shirtMat.map = null
      this.shirtMat.color.setHex(SHIRT_COLOR)
      this.shirtMat.needsUpdate = true
    }
  }

  get clothed() {
    return this.clothTexture !== null
  }

  // -----------------------------------------------------------------------
  // 每帧更新（可加呼吸微动）
  // -----------------------------------------------------------------------
  update(dt) {
    // 轻微呼吸：胸腔缩放
    const t = Date.now() * 0.001
    const breathe = 1 + Math.sin(t * 1.5) * 0.008
    this.group.children.forEach((c) => {
      if (c.geometry && c.geometry.type === 'LatheGeometry' && c.position.y > 0.9) {
        c.scale.x = breathe
        c.scale.z = breathe
      }
    })
  }

  dispose() {
    while (this.group.children.length > 0) {
      const c = this.group.children[0]
      this.group.remove(c)
      if (c.geometry) c.geometry.dispose()
    }
    this.scene.remove(this.group)
  }
}

export const GENDER_MALE = 'male'
export const GENDER_FEMALE = 'female'
