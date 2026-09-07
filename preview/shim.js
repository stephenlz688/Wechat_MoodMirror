/**
 * 浏览器预览用 shim：把 threejs-miniprogram 的 createScopedThreejs 映射为浏览器 three。
 * 通过 import map 让 utils/model.js 无需改动即可在浏览器运行。
 */
import * as THREE from 'three'

export function createScopedThreejs(canvas) {
  return THREE
}
