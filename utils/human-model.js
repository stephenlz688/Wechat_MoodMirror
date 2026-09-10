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
    this._tagAreas(model)
    this.models[gender] = model
    this.loaded[gender] = true
    this.group.add(model)
    this._applySkinToModel(model)
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
  // 识别 T 恤与皮肤区域，分别写入 aShirt / aSkin 顶点属性
  _tagAreas(model) {
    const T = this.T
    const H = this.targetHeight
    // T 恤所在的世界高度区间
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
      const skin = new Float32Array(count)

      const mat = mesh.material
      let pixels = null
      const map = mat && mat.map
      const texImage = map && ((map.source && map.source.data) || map.image)
      if (texImage && this.opts.readImagePixels) {
        try { pixels = this.opts.readImagePixels(texImage) } catch (e) { pixels = null }
      }
      const uv = geo.attributes.uv
      let shirtCount = 0, skinCount = 0

      for (let i = 0; i < count; i++) {
        tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld)
        const wx = tmp.x, wy = tmp.y

        // ---- T 恤 ----
        let isShirt = false
        const inShirtHeight = wy > yLow && wy < yHigh
        if (inShirtHeight) {
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
        shirt[i] = isShirt ? 1 : 0
        if (isShirt) shirtCount++

        // ---- 皮肤（脸/脖子/手臂/手）----
        if (!isShirt && wy > H * 0.40) {
          if (pixels && uv) {
            const c = this._samplePixel(pixels, uv, i)
            // 肤色：暖调 R>G>B，亮度中高，排除高亮(白T/鞋)与暗部(头发/裤)
            const warm = c.r > c.g + 0.005 && c.g > c.b + 0.005
            const midLight = c.r > 0.28 && c.r < 0.98
            const notBright = Math.min(c.r, c.g, c.b) < 0.90
            const notDark = Math.max(c.r, c.g, c.b) > 0.20
            const reddish = (c.r - c.b) > 0.03
            if (warm && midLight && notBright && notDark && reddish) {
              skin[i] = 1
              skinCount++
            }
          } else {
            // 兜底：脸+脖子+手臂区域
            const face = wy > H * 0.84 && Math.abs(wx) < 0.13
            const neck = wy > H * 0.78 && wy < H * 0.86 && Math.abs(wx) < 0.08
            const arm = Math.abs(wx) > 0.18 && Math.abs(wx) < 0.36 && wy > H * 0.42
            if (face || neck || arm) { skin[i] = 1; skinCount++ }
          }
        }
      }

      const setAttr = (name, arr) => {
        const attr = new T.BufferAttribute(arr, 1)
        if (geo.setAttribute) geo.setAttribute(name, attr)
        else geo.addAttribute(name, attr)
      }
      setAttr('aShirt', shirt)
      setAttr('aSkin', skin)
      mesh.userData.shirtCount = shirtCount
      mesh.userData.skinCount = skinCount
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

  // ----------------------------------------------------------------------
  // 皮肤美白层：在肤色区域叠加一层浅白暖肤色，提亮肤色
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
      if (!mesh.isMesh || mesh.userData.isClothLayer || mesh.userData.isSkinLayer) return
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
