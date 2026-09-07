/**
 * 逻辑级验证：在 Node 中加载真实 threejs-miniprogram（r108），
 * 用 mock canvas 跑通 Mannequin 的构建、性别平滑变形、衣服贴图全流程。
 * 注意：不创建 WebGLRenderer，仅验证模型逻辑与 three 数学代码。
 */
import { createRequire } from 'module'
import { Mannequin, GENDER_MALE, GENDER_FEMALE } from './model.mjs'

const require = createRequire(import.meta.url)
const { createScopedThreejs } = require('threejs-miniprogram')

// ---- mock 小程序 canvas（满足 createScopedThreejs 的最小需求）----
const fakeCanvas = {
  width: 300,
  height: 600,
  getContext: () => ({ /* 不实际初始化 WebGL */ }),
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  createImage: () => ({})
}

const THREE = createScopedThreejs(fakeCanvas)
const scene = new THREE.Scene()

// 1. 构建男性木偶
const mannequin = new Mannequin(THREE, scene)
const initialParts = mannequin.parts.length
console.log('[1] 男性模特构建成功，部位数 =', initialParts, '，衣服部位数 =', mannequin.clothParts.length)

// 2. 切换到女性并跑 90 帧变形动画
mannequin.setGender(GENDER_FEMALE)
let frames = 0
while (mannequin.animating && frames < 240) {
  mannequin.update(1 / 60)
  frames++
}
console.log('[2] 性别切换动画完成，帧数 =', frames, '，当前性别 =', mannequin.gender)
if (mannequin.animating) throw new Error('动画未收敛')

// 关键差异验证：女性肩窄、腰细、臀宽、有胸、头小、下巴尖
const p = mannequin.p
console.log('[3] 女性体型: 肩=%.3f 腰=%.3f 臀=%.3f 胸=%.3f 头=%.3f 下巴=%.3f'.replace('%.3f', '%s').replace('%.3f', '%s').replace('%.3f', '%s').replace('%.3f', '%s').replace('%.3f', '%s').replace('%.3f', '%s'),
  p.shoulder.toFixed(3), p.waist.toFixed(3), p.hipW.toFixed(3), p.chestR.toFixed(3), p.headR.toFixed(3), p.chinR.toFixed(3))
if (!(p.shoulder < 0.18 && p.waist < p.shoulder && p.hipW > p.waist && p.chestR > 0.05 && p.headR < 0.14)) {
  throw new Error('女性体型参数异常')
}

// 3. 切回男性并收敛
mannequin.setGender(GENDER_MALE)
frames = 0
while (mannequin.animating && frames < 240) { mannequin.update(1 / 60); frames++ }
console.log('[4] 切回男性完成，帧数 =', frames)

// 4. 衣服贴图（用 1x1 画布生成纹理）
const texCanvas = {
  width: 2, height: 2,
  getContext: () => ({
    fillRect: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) })
  })
}
const texture = new THREE.Texture(texCanvas)
texture.needsUpdate = true
mannequin.setCloth(texture)
const clothCount = mannequin.clothParts.filter((m) => m.material === mannequin.clothMat).length
console.log('[5] 穿上衣服：', clothCount, '/', mannequin.clothParts.length, '个部位使用衣服材质')
if (clothCount !== mannequin.clothParts.length) throw new Error('衣服材质未覆盖全部衣服部位')

// 5. 脱下
mannequin.clearCloth()
const cleared = mannequin.clothParts.every((m) => m.material === mannequin.bodyMat)
console.log('[6] 脱下衣服：', cleared ? 'OK，全部恢复木偶色' : 'FAIL')
if (!cleared) throw new Error('脱衣失败')

// 6. 穿衣服状态下再切性别，确认 clothMat 保留
mannequin.setCloth(texture)
mannequin.setGender(GENDER_FEMALE)
frames = 0
while (mannequin.animating && frames < 240) { mannequin.update(1 / 60); frames++ }
const stillClothed = mannequin.clothParts.every((m) => m.material === mannequin.clothMat)
console.log('[7] 穿衣服 + 切女性后衣服保留：', stillClothed ? 'OK' : 'FAIL')
if (!stillClothed) throw new Error('性别切换丢衣服')

console.log('\n全部逻辑验证通过 ✔')
