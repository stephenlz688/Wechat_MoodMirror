/**
 * human-model.js —— GLB 仿真人体模型管理
 *  - 加载混元3D 生成的男女 GLB（外部传入 GLTFLoader.parse，兼容浏览器/小程序）
 *  - 归一化：统一身高、脚底落地、水平居中
 *  - 性别切换
 *  - 四品类换装：上衣 / 裤子 / 鞋子 / 帽子，各自识别区域并叠加三平面映射纹理层
 *  - 皮肤美白层
 *  - 仅水平旋转（外部控制 group.rotation.y）
 */

// 品类配置：顶点属性名 / 渲染顺序 / 外扩距离 / 纹理重复度
const CATEGORIES = {
  shirt: { attr: 'aShirt', renderOrder: 2, expand: 0.006, repeat: 2.2 },
  pants: { attr: 'aPants', renderOrder: 2, expand: 0.002, repeat: 1.6 },
  shoes: { attr: 'aShoes', renderOrder: 2, expand: 0.002, repeat: 3.0 },
  hat:   { attr: 'aHat',   renderOrder: 3, expand: 0.003, repeat: 2.0 }
}

export class HumanModel {
  /**
   * @param {object} THREE three.js 命名空间
   * @param {object} scene 场景
   * @param {object} opts
   *   targetHeight 归一化身高（默认 1.7）
   *   readImagePixels 可选，(image)=>{width,height,data:Uint8ClampedArray}，用于颜色识别
   */
  constructor(THREE, scene, opts = {}) {
    this.T = THREE
    this.scene = scene
    this.opts = opts
    this.targetHeight = opts.targetHeight || 1.7
    this.group = new THREE.Group()
    scene.add(this.group)

    this.models = { male: null, female: null }
    this.gender = 'male'
    this.textures = {} // { shirt: tex, pants: tex, shoes: tex, hat: tex }
    this.loaded = { male: false, female: false }
  }

  // ----------------------------------------------------------------------
  // 加载 GLB
  // ----------------------------------------------------------------------
  async addGender(gender, arrayBuffer, parseBuffer) {
    const gltfScene = await parseBuffer(arrayBuffer)
    const model = this._normalize(gltfScene)
    model.visible = gender === this.gender
    this._tagAreas(model)
    this.models[gender] = model
    this.loaded[gender] = true
    this.group.add(model)
    this._applySkinToModel(model)
    // 应用已有的各品类纹理
    Object.entries(this.textures).forEach(([cat, tex]) => {
      if (tex) this._applyOverlayToModel(model, cat, tex)
    })
    return model
  }

  // 归一化：统一身高、落地、居中
  _normalize(obj) {
    const T = this.T
    let box = new T.Box3().setFromObject(obj)
    const size = new T.Vector3()
    box.getSize(size)
    const scale = this.targetHeight / size.y
    obj.scale.setScalar(scale)

    box = new T.Box3().setFromObject(obj)
    const center = new T.Vector3()
    box.getCenter(center)
    obj.position.x -= center.x
    obj.position.z -= center.z
    obj.position.y -= box.min.y

    obj.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return obj
  }

  // ----------------------------------------------------------------------
  // 识别上衣/裤子/鞋子/帽子/皮肤区域，写入对应顶点属性
  // ----------------------------------------------------------------------
  _tagAreas(model) {
    const T = this.T
    const H = this.targetHeight

    model.updateMatrixWorld(true)
    const tmp = new T.Vector3()

    model.traverse((mesh) => {
      if (!mesh.isMesh) return
      const geo = mesh.geometry
      const pos = geo.attributes.position
      if (!pos) return
      const count = pos.count
      const shirt = new Float32Array(count)
      const pants = new Float32Array(count)
      const shoes = new Float32Array(count)
      const hat = new Float32Array(count)
      const skin = new Float32Array(count)

      const mat = mesh.material
      let pixels = null
      const map = mat && mat.map
      const texImage = map && ((map.source && map.source.data) || map.image)
      if (texImage && this.opts.readImagePixels) {
        try { pixels = this.opts.readImagePixels(texImage) } catch (e) { pixels = null }
      }
      const uv = geo.attributes.uv
      const counts = { shirt: 0, pants: 0, shoes: 0, hat: 0, skin: 0 }

      for (let i = 0; i < count; i++) {
        tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld)
        const wx = tmp.x, wy = tmp.y

        // ---- 上衣（T 恤）----
        let isShirt = false
        if (wy > H * 0.52 && wy < H * 0.86) {
          const coreTorso = Math.abs(wx) < 0.17 && !(Math.abs(wx) < 0.07 && wy > H * 0.80)
          if (pixels && uv) {
            const c = this._samplePixel(pixels, uv, i)
            const mn = Math.min(c.r, c.g, c.b), mx = Math.max(c.r, c.g, c.b)
            const white = mn > 0.62 && (mx - mn) < 0.18
            const notNeck = !(Math.abs(wx) < 0.07 && wy > H * 0.80)
            isShirt = (white || coreTorso) && notNeck
          } else {
            const torso = Math.abs(wx) < 0.24 && !(Math.abs(wx) < 0.07 && wy > H * 0.80)
            const arm = Math.abs(wx) > 0.16 && Math.abs(wx) < 0.34
            isShirt = torso || arm
          }
        }
        if (isShirt) { shirt[i] = 1; counts.shirt++; continue }

        // ---- 裤子（位置 + 深色判定，排除肤色手臂；核心腿部强制覆盖）----
        if (wy > H * 0.05 && wy < H * 0.55 && Math.abs(wx) < 0.30) {
          const coreLeg = Math.abs(wx) < 0.16
          let isDark = true
          if (pixels && uv) {
            const c = this._samplePixel(pixels, uv, i)
            isDark = Math.max(c.r, c.g, c.b) < 0.58
          }
          if (isDark || coreLeg) { pants[i] = 1; counts.pants++; continue }
        }

        // ---- 鞋子（脚底区域）----
        if (wy < H * 0.10) { shoes[i] = 1; counts.shoes++; continue }

        // ---- 帽子（头顶，排除脸）----
        let isHat = false
        if (wy > H * 0.91 && Math.abs(wx) < 0.14) {
          if (pixels && uv) {
            const c = this._samplePixel(pixels, uv, i)
            const isSkinColor = c.r > c.g + 0.005 && c.g > c.b + 0.005 && (c.r - c.b) > 0.03 && c.r > 0.28
            if (!isSkinColor) isHat = true
          } else {
            isHat = wy > H * 0.93
          }
        }
        if (isHat) { hat[i] = 1; counts.hat++; continue }

        // ---- 皮肤（脸/脖子/手臂/手）----
        if (wy > H * 0.40) {
          if (pixels && uv) {
            const c = this._samplePixel(pixels, uv, i)
            const warm = c.r > c.g + 0.005 && c.g > c.b + 0.005
            const midLight = c.r > 0.28 && c.r < 0.98
            const notBright = Math.min(c.r, c.g, c.b) < 0.90
            const notDark = Math.max(c.r, c.g, c.b) > 0.20
            const reddish = (c.r - c.b) > 0.03
            if (warm && midLight && notBright && notDark && reddish) {
              skin[i] = 1; counts.skin++
            }
          } else {
            const face = wy > H * 0.84 && Math.abs(wx) < 0.13
            const neck = wy > H * 0.78 && wy < H * 0.86 && Math.abs(wx) < 0.08
            const arm = Math.abs(wx) > 0.18 && Math.abs(wx) < 0.36 && wy > H * 0.42
            if (face || neck || arm) { skin[i] = 1; counts.skin++ }
          }
        }
      }

      const setAttr = (name, arr) => {
        const attr = new T.BufferAttribute(arr, 1)
        if (geo.setAttribute) geo.setAttribute(name, attr)
        else geo.addAttribute(name, attr)
      }
      setAttr('aShirt', shirt)
      setAttr('aPants', pants)
      setAttr('aShoes', shoes)
      setAttr('aHat', hat)
      setAttr('aSkin', skin)
      mesh.userData.areaCounts = counts
      mesh.userData.totalCount = count
      mesh.userData.hasPixels = !!pixels
    })
  }

  // 从纹理像素中采样某顶点的颜色
  _samplePixel(pixels, uv, i) {
    const u = uv.getX(i), v = uv.getY(i)
    const px = Math.min(pixels.width - 1, Math.max(0, Math.floor(u * pixels.width)))
    const py = Math.min(pixels.height - 1, Math.max(0, Math.floor(v * pixels.height)))
    const idx = (py * pixels.width + px) * 4
    return {
      r: pixels.data[idx] / 255,
      g: pixels.data[idx + 1] / 255,
      b: pixels.data[idx + 2] / 255
    }
  }

  // ----------------------------------------------------------------------
  // 品类叠加层（上衣/裤子/鞋子/帽子通用）
  // ----------------------------------------------------------------------
  _buildOverlayMaterial(category) {
    const T = this.T
    const cfg = CATEGORIES[category]
    return new T.ShaderMaterial({
      transparent: true,
      depthWrite: category === 'pants' ? false : true,
      uniforms: {
        uTex: { value: null },
        uRepeat: { value: cfg.repeat },
        uExpand: { value: cfg.expand }
      },
      vertexShader: `
        attribute float ${cfg.attr};
        varying float vMask;
        varying vec3 vPos;
        varying vec3 vNrm;
        uniform float uExpand;
        void main() {
          vMask = ${cfg.attr};
          vec3 p = position + normal * uExpand;
          vPos = (modelMatrix * vec4(p, 1.0)).xyz;
          vNrm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform float uRepeat;
        varying float vMask;
        varying vec3 vPos;
        varying vec3 vNrm;
        void main() {
          float mask = smoothstep(0.4, 0.6, vMask);
          if (mask < 0.02) discard;
          vec3 n = normalize(vNrm);
          vec3 cx = texture2D(uTex, vPos.zy * uRepeat).rgb;
          vec3 cy = texture2D(uTex, vPos.xz * uRepeat).rgb;
          vec3 cz = texture2D(uTex, vPos.xy * uRepeat).rgb;
          vec3 w = pow(abs(n), vec3(2.0));
          float ws = w.x + w.y + w.z + 1e-5;
          w /= ws;
          vec3 col = cx * w.x + cy * w.y + cz * w.z;
          float shade = 0.82 + 0.18 * max(dot(n, normalize(vec3(0.4, 1.0, 0.6))), 0.0);
          gl_FragColor = vec4(col * shade, mask);
        }
      `
    })
  }

  _applyOverlayToModel(model, category, texture) {
    const T = this.T
    const cfg = CATEGORIES[category]
    const layerKey = category + 'Layer'
    const matKey = category + 'Mat'
    model.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.isOverlayLayer || mesh.userData.isSkinLayer) return
      if (!mesh.geometry || !mesh.geometry.attributes[cfg.attr]) return
      if (!mesh.userData[layerKey]) {
        const mat = this._buildOverlayMaterial(category)
        const layer = new T.Mesh(mesh.geometry, mat)
        layer.renderOrder = cfg.renderOrder
        layer.userData.isOverlayLayer = true
        layer.userData.category = category
        layer.matrixAutoUpdate = false
        layer.matrix.identity()
        mesh.add(layer)
        mesh.userData[layerKey] = layer
        mesh.userData[matKey] = mat
      }
      mesh.userData[matKey].uniforms.uTex.value = texture
      mesh.userData[layerKey].visible = true
    })
  }

  // ----------------------------------------------------------------------
  // 皮肤美白层
  // ----------------------------------------------------------------------
  _buildSkinMaterial() {
    const T = this.T
    return new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uSkinColor: { value: new T.Color(1.0, 0.90, 0.82) },
        uSkinAlpha: { value: 0.38 },
        uExpand: { value: 0.001 }
      },
      vertexShader: `
        attribute float aSkin;
        varying float vSkin;
        varying vec3 vNrm;
        uniform float uExpand;
        void main() {
          vSkin = aSkin;
          vec3 p = position + normal * uExpand;
          vNrm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkinColor;
        uniform float uSkinAlpha;
        varying float vSkin;
        varying vec3 vNrm;
        void main() {
          float mask = smoothstep(0.4, 0.6, vSkin);
          if (mask < 0.02) discard;
          vec3 n = normalize(vNrm);
          float shade = 0.85 + 0.15 * max(dot(n, normalize(vec3(0.4, 1.0, 0.6))), 0.0);
          gl_FragColor = vec4(uSkinColor * shade, uSkinAlpha * mask);
        }
      `
    })
  }

  _applySkinToModel(model) {
    const T = this.T
    model.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.isOverlayLayer || mesh.userData.isSkinLayer) return
      if (!mesh.geometry || !mesh.geometry.attributes.aSkin) return
      if (!mesh.userData.skinLayer) {
        const mat = this._buildSkinMaterial()
        const layer = new T.Mesh(mesh.geometry, mat)
        layer.renderOrder = 1
        layer.userData.isSkinLayer = true
        layer.matrixAutoUpdate = false
        layer.matrix.identity()
        mesh.add(layer)
        mesh.userData.skinLayer = layer
      }
      mesh.userData.skinLayer.visible = true
    })
  }

  // ----------------------------------------------------------------------
  // 对外 API
  // ----------------------------------------------------------------------

  /** 设置某个品类的纹理；category: shirt/pants/shoes/hat */
  setItem(category, texture) {
    if (!CATEGORIES[category]) return
    this.textures[category] = texture
    Object.values(this.models).forEach((m) => {
      if (m) this._applyOverlayToModel(m, category, texture)
    })
  }

  /** 脱下某个品类 */
  clearItem(category) {
    if (!CATEGORIES[category]) return
    this.textures[category] = null
    const layerKey = category + 'Layer'
    Object.values(this.models).forEach((m) => {
      if (!m) return
      m.traverse((mesh) => {
        if (mesh.userData && mesh.userData[layerKey]) {
          mesh.userData[layerKey].visible = false
        }
      })
    })
  }

  /** 某个品类是否已穿着 */
  hasItem(category) {
    return !!this.textures[category]
  }

  // 向后兼容：上衣别名
  setCloth(texture) { this.setItem('shirt', texture) }
  clearCloth() { this.clearItem('shirt') }
  get clothed() { return this.hasItem('shirt') }

  // ----------------------------------------------------------------------
  setGender(gender) {
    this.gender = gender
    Object.entries(this.models).forEach(([g, m]) => {
      if (m) m.visible = g === gender
    })
  }

  update(/* dt */) {
    // GLB 模型无程序化动画，保留接口
  }

  dispose() {
    Object.values(this.models).forEach((m) => { if (m) this.group.remove(m) })
    this.scene.remove(this.group)
  }
}
