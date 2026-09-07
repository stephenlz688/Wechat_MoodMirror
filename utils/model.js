/**
 * model.js —— 程序化仿真人体模特（增强版）
 *  - 基于参考人物比例的男/女人体
 *  - 面部五官（眼睛、眉毛、鼻子、嘴巴）
 *  - 真实发型（男性短发刘海 / 女性长发披肩）
 *  - 简单手指、自然肩腰过渡
 *  - 默认白 T 恤 + 黑裤子，支持上传衣服贴图
 *  - 仅水平旋转（外部控制 group.rotation.y）
 */

// ---- 男性体型参数（参考东亚男性，总高约 1.78m）----
const MALE = {
  head: { r: 0.105, scaleY: 1.12, y: 1.60 },
  neck: { rTop: 0.046, rBot: 0.052, h: 0.09, y: 1.45 },
  upperTorso: {
    points: [[0.07, 0.40], [0.16, 0.34], [0.195, 0.24], [0.18, 0.12], [0.165, 0.0]],
    y: 1.08, h: 0.40
  },
  lowerTorso: {
    points: [[0.165, 0.18], [0.15, 0.09], [0.165, 0.0]],
    y: 0.93, h: 0.18
  },
  pelvis: { r: 0.155, scaleY: 0.52, y: 0.84 },
  upperArm: { rTop: 0.052, rBot: 0.042, h: 0.29, x: 0.215, y: 1.21 },
  elbow: { r: 0.047, x: 0.215, y: 1.05 },
  forearm: { rTop: 0.04, rBot: 0.032, h: 0.27, x: 0.215, y: 0.90 },
  hand: { r: 0.04, scaleY: 1.4, x: 0.215, y: 0.75 },
  thigh: { rTop: 0.075, rBot: 0.058, h: 0.38, x: 0.088, y: 0.61 },
  knee: { r: 0.055, x: 0.088, y: 0.42 },
  calf: { rTop: 0.052, rBot: 0.038, h: 0.36, x: 0.088, y: 0.24 },
  foot: { w: 0.072, h: 0.048, d: 0.15, x: 0.088, y: 0.044, z: 0.035 },
  shoulder: { r: 0.068, x: 0.19, y: 1.34 },
  chest: null,
  hair: 'short'
}

// ---- 女性体型参数（参考东亚女性，总高约 1.66m）----
const FEMALE = {
  head: { r: 0.098, scaleY: 1.12, y: 1.56 },
  neck: { rTop: 0.04, rBot: 0.046, h: 0.09, y: 1.41 },
  upperTorso: {
    points: [[0.06, 0.38], [0.13, 0.32], [0.165, 0.22], [0.145, 0.12], [0.125, 0.0]],
    y: 1.07, h: 0.38
  },
  lowerTorso: {
    points: [[0.125, 0.18], [0.135, 0.09], [0.17, 0.0]],
    y: 0.92, h: 0.18
  },
  pelvis: { r: 0.16, scaleY: 0.55, y: 0.82 },
  upperArm: { rTop: 0.045, rBot: 0.037, h: 0.27, x: 0.175, y: 1.17 },
  elbow: { r: 0.041, x: 0.175, y: 1.02 },
  forearm: { rTop: 0.035, rBot: 0.028, h: 0.25, x: 0.175, y: 0.87 },
  hand: { r: 0.035, scaleY: 1.4, x: 0.175, y: 0.73 },
  thigh: { rTop: 0.072, rBot: 0.055, h: 0.37, x: 0.082, y: 0.58 },
  knee: { r: 0.05, x: 0.082, y: 0.40 },
  calf: { rTop: 0.048, rBot: 0.033, h: 0.35, x: 0.082, y: 0.225 },
  foot: { w: 0.065, h: 0.045, d: 0.13, x: 0.082, y: 0.042, z: 0.03 },
  shoulder: { r: 0.058, x: 0.155, y: 1.30 },
  chest: { r: 0.068, x: 0.072, y: 1.24, z: 0.10 },
  hair: 'long'
}

const SKIN_COLOR = 0xe8b88d
const SHIRT_COLOR = 0xffffff
const PANTS_COLOR = 0x1a1a1a
const HAIR_COLOR = 0x1a0f08
const EYE_WHITE = 0xf5f0e8
const PUPIL_COLOR = 0x2a1810
const LIP_COLOR = 0xc4706a

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

  _disposeGroup() {
    while (this.group.children.length > 0) {
      const c = this.group.children[0]
      this.group.remove(c)
      if (c.geometry) c.geometry.dispose()
    }
  }

  _build() {
    this._disposeGroup()
    const T = this.T
    const p = this.gender === 'female' ? FEMALE : MALE

    const skinMat = new T.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.65, metalness: 0.05 })
    this.shirtMat = new T.MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.85, metalness: 0.0 })
    const pantsMat = new T.MeshStandardMaterial({ color: PANTS_COLOR, roughness: 0.8, metalness: 0.05 })
    const hairMat = new T.MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.85, metalness: 0.0 })
    const eyeWhiteMat = new T.MeshStandardMaterial({ color: EYE_WHITE, roughness: 0.3, metalness: 0.0 })
    const pupilMat = new T.MeshStandardMaterial({ color: PUPIL_COLOR, roughness: 0.2, metalness: 0.1 })
    const lipMat = new T.MeshStandardMaterial({ color: LIP_COLOR, roughness: 0.6, metalness: 0.0 })
    const browMat = new T.MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.9, metalness: 0.0 })

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

    // ==================== 头部 ====================
    const head = add(new T.Mesh(new T.SphereGeometry(p.head.r, 32, 24), skinMat))
    head.scale.y = p.head.scaleY
    head.position.y = p.head.y

    // ---- 面部五官 ----
    const hy = p.head.y
    const hr = p.head.r

    // 眼睛（眼白 + 瞳孔）
    for (const side of [-1, 1]) {
      const eyeWhite = add(new T.Mesh(new T.SphereGeometry(0.018, 12, 10), eyeWhiteMat))
      eyeWhite.scale.set(1.3, 0.8, 0.5)
      eyeWhite.position.set(side * 0.035, hy + 0.005, hr * 0.88)

      const pupil = add(new T.Mesh(new T.SphereGeometry(0.008, 10, 8), pupilMat))
      pupil.scale.set(1, 1, 0.4)
      pupil.position.set(side * 0.035, hy + 0.005, hr * 0.92)
    }

    // 眉毛
    for (const side of [-1, 1]) {
      const brow = add(new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, 0.032, 6), browMat))
      brow.rotation.z = side * 0.12
      brow.position.set(side * 0.035, hy + 0.035, hr * 0.85)
    }

    // 鼻子
    const nose = add(new T.Mesh(new T.ConeGeometry(0.014, 0.03, 8), skinMat))
    nose.rotation.x = Math.PI / 2
    nose.position.set(0, hy - 0.01, hr * 0.92)

    // 嘴巴
    const mouth = add(new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, 0.026, 6), lipMat))
    mouth.rotation.z = Math.PI / 2
    mouth.position.set(0, hy - 0.04, hr * 0.87)

    // ---- 头发 ----
    this._buildHair(T, p, hairMat, add)

    // ==================== 脖子 ====================
    const neck = add(new T.Mesh(
      new T.CylinderGeometry(p.neck.rTop, p.neck.rBot, p.neck.h, 16),
      skinMat
    ))
    neck.position.y = p.neck.y

    // ==================== 躯干 ====================
    const upperTorso = add(new T.Mesh(this._lathe(p.upperTorso.points), this.shirtMat))
    upperTorso.position.y = p.upperTorso.y

    const lowerTorso = add(new T.Mesh(this._lathe(p.lowerTorso.points), skinMat))
    lowerTorso.position.y = p.lowerTorso.y

    // 胯部
    const pelvis = add(new T.Mesh(new T.SphereGeometry(p.pelvis.r, 24, 16), pantsMat))
    pelvis.scale.y = p.pelvis.scaleY
    pelvis.position.y = p.pelvis.y

    // 女性胸部
    if (p.chest) {
      for (const side of [-1, 1]) {
        const breast = add(new T.Mesh(
          new T.SphereGeometry(p.chest.r, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
          this.shirtMat
        ))
        breast.position.set(side * p.chest.x, p.chest.y, p.chest.z)
        breast.rotation.x = -0.25
      }
    }

    // ==================== 手臂 ====================
    for (const side of [-1, 1]) {
      // 肩关节
      const shoulder = add(new T.Mesh(new T.SphereGeometry(p.shoulder.r, 16, 12), this.shirtMat))
      shoulder.position.set(side * p.shoulder.x, p.shoulder.y, 0)

      // 上臂（T恤）
      const upperArm = add(new T.Mesh(
        new T.CylinderGeometry(p.upperArm.rTop, p.upperArm.rBot, p.upperArm.h, 16),
        this.shirtMat
      ))
      upperArm.position.set(side * p.upperArm.x, p.upperArm.y, 0)

      // 肘关节
      const elbow = add(new T.Mesh(new T.SphereGeometry(p.elbow.r, 12, 8), skinMat))
      elbow.position.set(side * p.elbow.x, p.elbow.y, 0)

      // 前臂
      const forearm = add(new T.Mesh(
        new T.CylinderGeometry(p.forearm.rTop, p.forearm.rBot, p.forearm.h, 16),
        skinMat
      ))
      forearm.position.set(side * p.forearm.x, p.forearm.y, 0)

      // 手 + 手指
      this._buildHand(T, p, side, skinMat, add)
    }

    // ==================== 腿部 ====================
    for (const side of [-1, 1]) {
      const thigh = add(new T.Mesh(
        new T.CylinderGeometry(p.thigh.rTop, p.thigh.rBot, p.thigh.h, 16),
        pantsMat
      ))
      thigh.position.set(side * p.thigh.x, p.thigh.y, 0)

      const knee = add(new T.Mesh(new T.SphereGeometry(p.knee.r, 12, 8), pantsMat))
      knee.position.set(side * p.knee.x, p.knee.y, 0)

      const calf = add(new T.Mesh(
        new T.CylinderGeometry(p.calf.rTop, p.calf.rBot, p.calf.h, 16),
        pantsMat
      ))
      calf.position.set(side * p.calf.x, p.calf.y, 0)

      // 脚
      const foot = add(new T.Mesh(
        new T.BoxGeometry(p.foot.w, p.foot.h, p.foot.d),
        skinMat
      ))
      foot.position.set(side * p.foot.x, p.foot.y, p.foot.z)
    }
  }

  // ---- 头发构建 ----
  _buildHair(T, p, hairMat, add) {
    const hr = p.head.r
    const hy = p.head.y

    if (p.hair === 'short') {
      // 男性短发：头顶半球
      const hairTop = add(new T.Mesh(
        new T.SphereGeometry(hr * 1.06, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
        hairMat
      ))
      hairTop.scale.y = p.head.scaleY
      hairTop.position.y = hy + hr * 0.06

      // 刘海（整体弧形，覆盖前额）
      const bangs = add(new T.Mesh(
        new T.SphereGeometry(hr * 0.6, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.4),
        hairMat
      ))
      bangs.scale.set(1.2, 0.55, 0.65)
      bangs.position.set(0, hy + hr * 0.45, hr * 0.72)
    } else {
      // 女性长发：头顶发帽
      const hairCap = add(new T.Mesh(
        new T.SphereGeometry(hr * 1.08, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.65),
        hairMat
      ))
      hairCap.scale.set(1.05, p.head.scaleY, 1.15)
      hairCap.position.set(0, hy + hr * 0.04, -hr * 0.05)

      // 两侧垂发（头部侧后方，不遮脸）
      for (const side of [-1, 1]) {
        const sideHair = add(new T.Mesh(
          new T.CylinderGeometry(hr * 0.22, hr * 0.16, 0.30, 12),
          hairMat
        ))
        sideHair.scale.set(0.8, 1, 0.5)
        sideHair.position.set(side * hr * 0.72, hy - 0.13, -hr * 0.28)
      }

      // 前额刘海
      const bangs = add(new T.Mesh(
        new T.SphereGeometry(hr * 0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
        hairMat
      ))
      bangs.scale.set(1.15, 0.5, 0.6)
      bangs.position.set(0, hy + hr * 0.4, hr * 0.7)
    }
  }

  // ---- 手 + 简单手指 ----
  _buildHand(T, p, side, skinMat, add) {
    const hx = side * p.hand.x
    const hy = p.hand.y

    // 手掌
    const palm = add(new T.Mesh(new T.SphereGeometry(p.hand.r, 14, 10), skinMat))
    palm.scale.set(0.8, p.hand.scaleY * 0.8, 0.5)
    palm.position.set(hx, hy, 0)

    // 四根手指
    for (let i = 0; i < 4; i++) {
      const finger = add(new T.Mesh(
        new T.CylinderGeometry(0.006, 0.005, 0.05, 6),
        skinMat
      ))
      finger.position.set(hx + (i - 1.5) * 0.012, hy - 0.045, 0.005)
    }

    // 拇指
    const thumb = add(new T.Mesh(
      new T.CylinderGeometry(0.007, 0.006, 0.04, 6),
      skinMat
    ))
    thumb.position.set(hx + side * 0.025, hy - 0.015, 0.01)
    thumb.rotation.z = side * 0.6
  }

  _lathe(points) {
    const T = this.T
    const pts = points.map(([r, y]) => new T.Vector2(r, y))
    return new T.LatheGeometry(pts, 32)
  }

  setGender(gender) {
    if (gender === this.gender) return
    this.gender = gender
    this._build()
  }

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

  update(dt) {
    const t = Date.now() * 0.001
    const breathe = 1 + Math.sin(t * 1.5) * 0.006
    this.group.children.forEach((c) => {
      if (c.geometry && c.geometry.type === 'LatheGeometry' && c.position.y > 0.9) {
        c.scale.x = breathe
        c.scale.z = breathe
      }
    })
  }

  dispose() {
    this._disposeGroup()
    this.scene.remove(this.group)
  }
}

export const GENDER_MALE = 'male'
export const GENDER_FEMALE = 'female'
