/**
 * model.js —— 3D 木偶模特
 *
 * 功能：
 *  1. 参数化构建人体木偶（头部 / 躯干 / 四肢 / 关节球），默认木偶色（未上漆木色）
 *  2. 性别实时切换：所有体型参数逐帧插值，平滑"变形"（肩宽、腰臀比、胸部、脸型等）
 *  3. 衣服贴图：把用户上传的图片作为纹理穿到躯干 + 上臂（袖子）
 *
 * 实现：每个部位持有一个 rebuild() 闭包，从当前参数 this.p 重建几何体与位置，
 *       因此性别切换只需插值参数，男女体型差异真实可见且过渡平滑。
 */

export const GENDER_MALE = 'male'
export const GENDER_FEMALE = 'female'

// ---------------------------------------------------------------------------
// 体型参数（单位：米）。所有部位由参数驱动，性别切换 = 参数插值。
//   shoulder / waist / hipW -> 上躯干顶(肩) / 上躯干底(腰) / 下躯干底(臀) 半径
//   chestR                  -> 胸部半球半径（女性明显，男性≈0）
//   headR / chinR / noseR   -> 头、下巴、鼻子
//   armX / legX             -> 手臂 / 腿 距中线的距离
// ---------------------------------------------------------------------------
const PARAMS = {
  male: {
    // ---- 躯干 ----
    torsoUpperH: 0.25, torsoUpperY: 1.175, shoulder: 0.205, waist: 0.165,
    torsoLowerH: 0.19, torsoLowerY: 0.955, hipW: 0.178,
    chestR: 0.005, chestY: 1.095, chestZ: 0.19,
    // ---- 颈 / 头 / 脸 ----
    neckR: 0.045, neckH: 0.09, neckY: 1.335,
    headR: 0.145, headY: 1.50,
    chinR: 0.003, noseR: 0.02, eyeY: 1.535, eyeZ: 0.128,
    // ---- 肩 / 手臂 ----
    shoulderR: 0.062, armX: 0.215, armY: 1.285,
    armTop: 0.058, armBot: 0.05, armH: 0.28,
    elbowR: 0.042,
    foreTop: 0.05, foreBot: 0.038, foreH: 0.24,
    handR: 0.042,
    // ---- 髋 / 腿 ----
    hipR: 0.062, legX: 0.088, hipY: 0.86,
    thighTop: 0.085, thighBot: 0.058, thighH: 0.42,
    kneeR: 0.052,
    calfTop: 0.058, calfBot: 0.038, calfH: 0.34,
    footW: 0.11, footH: 0.08, footD: 0.26
  },

  female: {
    // ---- 躯干（肩窄、腰细、臀宽）----
    torsoUpperH: 0.23, torsoUpperY: 1.155, shoulder: 0.16, waist: 0.132,
    torsoLowerH: 0.18, torsoLowerY: 0.945, hipW: 0.198,
    chestR: 0.075, chestY: 1.10, chestZ: 0.165,
    // ---- 颈 / 头 / 脸（头略小、下巴尖、鼻小巧）----
    neckR: 0.038, neckH: 0.08, neckY: 1.32,
    headR: 0.128, headY: 1.475,
    chinR: 0.034, noseR: 0.016, eyeY: 1.505, eyeZ: 0.112,
    // ---- 肩 / 手臂 ----
    shoulderR: 0.052, armX: 0.185, armY: 1.265,
    armTop: 0.046, armBot: 0.04, armH: 0.26,
    elbowR: 0.035,
    foreTop: 0.04, foreBot: 0.03, foreH: 0.22,
    handR: 0.035,
    // ---- 髋 / 腿 ----
    hipR: 0.068, legX: 0.098, hipY: 0.86,
    thighTop: 0.082, thighBot: 0.055, thighH: 0.40,
    kneeR: 0.048,
    calfTop: 0.055, calfBot: 0.036, calfH: 0.36,
    footW: 0.095, footH: 0.07, footD: 0.23
  }
}

const COLOR_BODY = 0xd9d1c0   // 木偶主色（未上漆木色）
const COLOR_JOINT = 0xc0b6a0  // 关节球（略深，增强木偶感）
const COLOR_EYE = 0x23232b    // 眼睛

// 每帧指数趋近系数（帧率无关，约 60fps 收敛速度）
const LERP_K = 1 - Math.pow(0.001, 1 / 60)

export class Mannequin {
  /**
   * @param {object} THREE - createScopedThreejs(canvas) 返回的 three 作用域
   * @param {object} scene
   */
  constructor(THREE, scene) {
    this.T = THREE
    this.group = new THREE.Group()
    scene.add(this.group)

    // 当前参数 / 目标参数
    this.p = Object.assign({}, PARAMS.male)
    this.target = Object.assign({}, PARAMS.male)
    this.gender = GENDER_MALE
    this.animating = false

    // 材质
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: COLOR_BODY, roughness: 0.88, metalness: 0.0
    })
    this.jointMat = new THREE.MeshStandardMaterial({
      color: COLOR_JOINT, roughness: 0.8, metalness: 0.0
    })
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: COLOR_EYE, roughness: 0.35, metalness: 0.1
    })
    this.clothMat = null

    // 部位集合：{ mesh, rebuild() }
    this.parts = []
    // 可穿衣服的部位（躯干 + 上臂）
    this.clothParts = []

    this._build()
  }

  // -------------------------------------------------------------------------
  // 构建（每个部位登记一个 rebuild 闭包）
  // -------------------------------------------------------------------------
  _build() {
    const T = this.T
    const parts = this.parts
    const P = () => this.p

    // ---- 工具：注册一个部位 ----
    const reg = (mesh, rebuild, clothable) => {
      parts.push({ mesh, rebuild })
      if (clothable) this.clothParts.push(mesh)
      this.group.add(mesh)
    }

    // ---- 躯干（可穿衣服）----
    const torsoUpper = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 24), this.bodyMat)
    reg(torsoUpper, () => {
      const p = P()
      torsoUpper.geometry.dispose()
      torsoUpper.geometry = new T.CylinderGeometry(p.shoulder, p.waist, p.torsoUpperH, 24)
      torsoUpper.position.set(0, p.torsoUpperY, 0)
    }, true)

    const torsoLower = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 24), this.bodyMat)
    reg(torsoLower, () => {
      const p = P()
      torsoLower.geometry.dispose()
      torsoLower.geometry = new T.CylinderGeometry(p.waist, p.hipW, p.torsoLowerH, 24)
      torsoLower.position.set(0, p.torsoLowerY, 0)
    }, true)

    // ---- 胸部（性别特征：女性两个半球，男性≈0）----
    ;[-1, 1].forEach((side) => {
      const chest = new T.Mesh(new T.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.bodyMat)
      chest.geometry.rotateX(Math.PI / 2) // 平底朝身体、凸起朝前
      reg(chest, () => {
        const p = P()
        chest.geometry.dispose()
        const g = new T.SphereGeometry(p.chestR, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)
        g.rotateX(Math.PI / 2)
        chest.geometry = g
        chest.position.set(side * p.chestR * 0.8, p.chestY, p.chestZ)
      })
    })

    // ---- 颈 / 头 ----
    const neck = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 20), this.bodyMat)
    reg(neck, () => {
      const p = P()
      neck.geometry.dispose()
      neck.geometry = new T.CylinderGeometry(p.neckR, p.neckR, p.neckH, 20)
      neck.position.set(0, p.neckY, 0)
    })

    const head = new T.Mesh(new T.SphereGeometry(1, 28, 20), this.bodyMat)
    reg(head, () => {
      const p = P()
      head.geometry.dispose()
      head.geometry = new T.SphereGeometry(p.headR, 28, 20)
      head.position.set(0, p.headY, 0)
    })

    // 下巴（女性更尖小）
    const chin = new T.Mesh(new T.SphereGeometry(1, 16, 12), this.bodyMat)
    reg(chin, () => {
      const p = P()
      chin.geometry.dispose()
      chin.geometry = new T.SphereGeometry(Math.max(0.001, p.chinR), 16, 12)
      chin.position.set(0, p.headY - p.headR * 0.72, p.headR * 0.92)
    })

    // 鼻子
    const nose = new T.Mesh(new T.SphereGeometry(1, 12, 10), this.bodyMat)
    reg(nose, () => {
      const p = P()
      nose.geometry.dispose()
      nose.geometry = new T.SphereGeometry(Math.max(0.001, p.noseR), 12, 10)
      nose.position.set(0, p.headY - 0.02, p.headR * 1.02)
    })

    // 眼睛
    ;[-1, 1].forEach((side) => {
      const eye = new T.Mesh(new T.SphereGeometry(1, 12, 10), this.eyeMat)
      reg(eye, () => {
        const p = P()
        eye.geometry.dispose()
        eye.geometry = new T.SphereGeometry(0.016, 12, 10)
        eye.position.set(side * 0.052, p.eyeY, p.headR * 0.9)
      })
    })

    // ---- 手臂（左右）----
    ;[-1, 1].forEach((side) => {
      const g = new T.Group()
      this.group.add(g)

      const shoulder = new T.Mesh(new T.SphereGeometry(1, 18, 12), this.jointMat)
      g.add(shoulder)
      parts.push({
        mesh: shoulder,
        rebuild: () => {
          const p = P()
          shoulder.geometry.dispose()
          shoulder.geometry = new T.SphereGeometry(p.shoulderR, 18, 12)
          shoulder.position.set(0, 0, 0)
          g.position.set(side * p.armX, p.armY, 0)
          g.rotation.z = -side * 0.055
        }
      })

      const upperArm = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 20), this.bodyMat)
      g.add(upperArm)
      parts.push({
        mesh: upperArm,
        rebuild: () => {
          const p = P()
          upperArm.geometry.dispose()
          upperArm.geometry = new T.CylinderGeometry(p.armTop, p.armBot, p.armH, 20)
          upperArm.position.set(0, -p.armH / 2, 0)
        }
      })
      this.clothParts.push(upperArm)

      const elbow = new T.Mesh(new T.SphereGeometry(1, 16, 10), this.jointMat)
      g.add(elbow)
      parts.push({
        mesh: elbow,
        rebuild: () => {
          const p = P()
          elbow.geometry.dispose()
          elbow.geometry = new T.SphereGeometry(p.elbowR, 16, 10)
          elbow.position.set(0, -p.armH, 0)
        }
      })

      const forearm = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 20), this.bodyMat)
      g.add(forearm)
      parts.push({
        mesh: forearm,
        rebuild: () => {
          const p = P()
          forearm.geometry.dispose()
          forearm.geometry = new T.CylinderGeometry(p.foreTop, p.foreBot, p.foreH, 20)
          forearm.position.set(0, -p.armH - p.foreH / 2, 0)
        }
      })

      const hand = new T.Mesh(new T.SphereGeometry(1, 16, 10), this.bodyMat)
      g.add(hand)
      parts.push({
        mesh: hand,
        rebuild: () => {
          const p = P()
          hand.geometry.dispose()
          hand.geometry = new T.SphereGeometry(p.handR, 16, 10)
          hand.position.set(0, -p.armH - p.foreH - p.handR, 0)
        }
      })
    })

    // ---- 腿（左右）----
    ;[-1, 1].forEach((side) => {
      const g = new T.Group()
      this.group.add(g)

      const hip = new T.Mesh(new T.SphereGeometry(1, 18, 12), this.jointMat)
      g.add(hip)
      parts.push({
        mesh: hip,
        rebuild: () => {
          const p = P()
          hip.geometry.dispose()
          hip.geometry = new T.SphereGeometry(p.hipR, 18, 12)
          hip.position.set(0, 0, 0)
          g.position.set(side * p.legX, p.hipY, 0)
        }
      })

      const thigh = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 20), this.bodyMat)
      g.add(thigh)
      parts.push({
        mesh: thigh,
        rebuild: () => {
          const p = P()
          thigh.geometry.dispose()
          thigh.geometry = new T.CylinderGeometry(p.thighTop, p.thighBot, p.thighH, 20)
          thigh.position.set(0, -p.thighH / 2, 0)
        }
      })

      const knee = new T.Mesh(new T.SphereGeometry(1, 16, 10), this.jointMat)
      g.add(knee)
      parts.push({
        mesh: knee,
        rebuild: () => {
          const p = P()
          knee.geometry.dispose()
          knee.geometry = new T.SphereGeometry(p.kneeR, 16, 10)
          knee.position.set(0, -p.thighH, 0)
        }
      })

      const calf = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 20), this.bodyMat)
      g.add(calf)
      parts.push({
        mesh: calf,
        rebuild: () => {
          const p = P()
          calf.geometry.dispose()
          calf.geometry = new T.CylinderGeometry(p.calfTop, p.calfBot, p.calfH, 20)
          calf.position.set(0, -p.thighH - p.calfH / 2, 0)
        }
      })

      const foot = new T.Mesh(new T.BoxGeometry(1, 1, 1), this.bodyMat)
      g.add(foot)
      parts.push({
        mesh: foot,
        rebuild: () => {
          const p = P()
          foot.geometry.dispose()
          foot.geometry = new T.BoxGeometry(p.footW, p.footH, p.footD)
          foot.position.set(0, -(p.thighH + p.calfH + p.footH / 2 - 0.02), 0)
        }
      })
    })

    this._rebuildAll()
  }

  // -------------------------------------------------------------------------
  // 按当前参数重建所有部位
  // -------------------------------------------------------------------------
  _rebuildAll() {
    for (let i = 0; i < this.parts.length; i++) {
      this.parts[i].rebuild()
    }
  }

  // -------------------------------------------------------------------------
  // 性别切换（平滑变形）
  // -------------------------------------------------------------------------
  setGender(gender) {
    if (gender !== GENDER_MALE && gender !== GENDER_FEMALE) return
    if (gender === this.gender && !this.animating) return
    this.gender = gender
    this.target = Object.assign({}, PARAMS[gender])
    this.animating = true
  }

  /**
   * 每帧调用。dt 为秒。返回是否仍在动画中。
   */
  update(dt) {
    if (!this.animating) return false
    const p = this.p
    const t = this.target
    const k = 1 - Math.pow(1 - LERP_K, dt * 60)
    let done = true
    for (const key in t) {
      const diff = t[key] - p[key]
      if (Math.abs(diff) > 0.0005) done = false
      p[key] += diff * k
    }
    this._rebuildAll()
    if (done) {
      for (const key in t) p[key] = t[key]
      this.animating = false
    }
    return this.animating
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
    for (let i = 0; i < this.clothParts.length; i++) {
      this.clothParts[i].material = this.clothMat
    }
  }

  clearCloth() {
    if (!this.clothMat) return
    for (let i = 0; i < this.clothParts.length; i++) {
      this.clothParts[i].material = this.bodyMat
    }
    this.clothMat = null
  }
}
