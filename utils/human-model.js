/**
 * human-model.js —— GLB 仿真人体模型管理
 *  - 加载混元3D 生成的男女 GLB（外部传入 GLTFLoader.parse，兼容浏览器/小程序）
 *  - 归一化：统一身高、脚底落地、水平居中
 *  - 性别切换
 *  - 换衣：识别白色 T 恤区域，叠加三平面映射的衣服纹理层
 *  - 仅水平旋转（外部控制 group.rotation.y）
 */

export class HumanModel {
  /**
   * @param {object} THREE three.js 命名空间
   * @param {object} scene 场景
   * @param {object} opts
   *   targetHeight 归一化身高（默认 1.7）
   *   readImagePixels 可选，(image)=>{width,height,data:Uint8ClampedArray}，用于颜色识别 T 恤
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
    this.clothTexture = null
    this.clothMaterial = null
    this.loaded = { male: false, female: false }
  }

  // ----------------------------------------------------------------------
  // 加载 GLB
  //  parseBuffer: (arrayBuffer) => Promise<gltfScene>
  // ----------------------------------------------------------------------
  async addGender(gender, arrayBuffer, parseBuffer) {
    const gltfScene = await parseBuffer(arrayBuffer)
    const model = this._normalize(gltfScene)
    model.visible = gender === this.gender
    this._tagShirtArea(model)
    this.models[gender] = model
    this.loaded[gender] = true
    this.group.add(model)
    if (this.clothTexture) this._applyClothToModel(model, this.clothTexture)
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
  // 识别 T 恤区域，写入 aShirt 顶点属性（1=T恤，0=其他）
  // ----------------------------------------------------------------------
  _tagShirtArea(model) {
    const T = this.T
    const H = this.targetHeight
    // T 恤所在的世界高度区间（排除头部与白鞋/裤腿）
    const yLow = H * 0.52
    const yHigh = H * 0.86

    model.updateMatrixWorld(true)
    const tmp = new T.Vector3()

    model.traverse((mesh) => {
      if (!mesh.isMesh) return
      const geo = mesh.geometry
      const pos = geo.attributes.position
      if (!pos) return
      const count = pos.count
      const shirt = new Float32Array(count)

      // 尝试取 baseColor 纹理图像做颜色识别（兼容 r108 的 map.image 与新版 map.source.data）
      const mat = mesh.material
      let pixels = null
      const map = mat && mat.map
      const texImage = map && ((map.source && map.source.data) || map.image)
      if (texImage && this.opts.readImagePixels) {
        try { pixels = this.opts.readImagePixels(texImage) } catch (e) { pixels = null }
      }
      const uv = geo.attributes.uv
      let shirtCount = 0

      for (let i = 0; i < count; i++) {
        // 兼容 r108（无 Vector3.fromBufferAttribute）
        tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld)
        const wx = tmp.x, wy = tmp.y, wz = tmp.z
        const inHeight = wy > yLow && wy < yHigh
        if (!inHeight) { shirt[i] = 0; continue }

        let isShirt = false
        // 躯干核心区域（不含脖子）一定属于上衣，避免下摆/腋下阴影漏识别
        const coreTorso = Math.abs(wx) < 0.17 && !(Math.abs(wx) < 0.07 && wy > H * 0.80)
        if (pixels && uv) {
          const u = uv.getX(i), v = uv.getY(i)
          const px = Math.min(pixels.width - 1, Math.max(0, Math.floor(u * pixels.width)))
          const py = Math.min(pixels.height - 1, Math.max(0, Math.floor(v * pixels.height)))
          const idx = (py * pixels.width + px) * 4
          const r = pixels.data[idx] / 255, g = pixels.data[idx + 1] / 255, b = pixels.data[idx + 2] / 255
          const mn = Math.min(r, g, b), mx = Math.max(r, g, b)
          // 白色 T 恤：高亮、低饱和
          const white = mn > 0.62 && (mx - mn) < 0.18
          // 排除脖子（中轴最窄处偏上）
          const notNeck = !(Math.abs(wx) < 0.07 && wy > H * 0.80)
          isShirt = (white || coreTorso) && notNeck
        } else {
          // 兜底：位置判断（躯干 + 上臂）
          const torso = Math.abs(wx) < 0.24 && !(Math.abs(wx) < 0.07 && wy > H * 0.80)
          const arm = Math.abs(wx) > 0.16 && Math.abs(wx) < 0.34
          isShirt = torso || arm
        }
        shirt[i] = isShirt ? 1 : 0
        if (isShirt) shirtCount++
      }

      // 兼容 r108（addAttribute）与新版（setAttribute）
      const aShirt = new T.BufferAttribute(shirt, 1)
      if (geo.setAttribute) geo.setAttribute('aShirt', aShirt)
      else geo.addAttribute('aShirt', aShirt)
      mesh.userData.shirtCount = shirtCount
      mesh.userData.totalCount = count
      mesh.userData.hasPixels = !!pixels
    })
  }

  // ----------------------------------------------------------------------
  // 衣服叠加层
  // ----------------------------------------------------------------------
  _buildClothMaterial() {
    const T = this.T
    return new T.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTex: { value: null },
        uRepeat: { value: 2.2 },
        uExpand: { value: 0.006 }
      },
      vertexShader: `
        attribute float aShirt;
        varying float vShirt;
        varying vec3 vPos;
        varying vec3 vNrm;
        uniform float uExpand;
        void main() {
          vShirt = aShirt;
          vec3 p = position + normal * uExpand;
          vPos = (modelMatrix * vec4(p, 1.0)).xyz;
          vNrm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform float uRepeat;
        varying float vShirt;
        varying vec3 vPos;
        varying vec3 vNrm;
        void main() {
          float mask = smoothstep(0.4, 0.6, vShirt);
          if (mask < 0.02) discard;
          vec3 n = normalize(vNrm);
          vec3 cx = texture2D(uTex, vPos.zy * uRepeat).rgb;
          vec3 cy = texture2D(uTex, vPos.xz * uRepeat).rgb;
          vec3 cz = texture2D(uTex, vPos.xy * uRepeat).rgb;
          vec3 w = pow(abs(n), vec3(2.0));
          float ws = w.x + w.y + w.z + 1e-5;
          w /= ws;
          vec3 col = cx * w.x + cy * w.y + cz * w.z;
          // 简单明暗，跟随法线
          float shade = 0.82 + 0.18 * max(dot(n, normalize(vec3(0.4,1.0,0.6))), 0.0);
          gl_FragColor = vec4(col * shade, mask);
        }
      `
    })
  }

  _applyClothToModel(model, texture) {
    const T = this.T
    model.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.isClothLayer) return
      if (!mesh.geometry || !mesh.geometry.attributes.aShirt) return
      if (!mesh.userData.clothLayer) {
        const mat = this._buildClothMaterial()
        const layer = new T.Mesh(mesh.geometry, mat)
        layer.renderOrder = 2
        layer.userData.isClothLayer = true
        layer.matrixAutoUpdate = false
        layer.matrix.identity()
        mesh.add(layer)
        mesh.userData.clothLayer = layer
        mesh.userData.clothMat = mat
      }
      mesh.userData.clothMat.uniforms.uTex.value = texture
      mesh.userData.clothLayer.visible = true
    })
  }

  setCloth(texture) {
    this.clothTexture = texture
    Object.values(this.models).forEach((m) => {
      if (m) this._applyClothToModel(m, texture)
    })
  }

  clearCloth() {
    this.clothTexture = null
    Object.values(this.models).forEach((model) => {
      if (!model) return
      model.traverse((mesh) => {
        if (mesh.userData && mesh.userData.clothLayer) {
          mesh.userData.clothLayer.visible = false
        }
      })
    })
  }

  get clothed() {
    return this.clothTexture !== null
  }

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
