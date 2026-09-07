/**
 * 浏览器预览用 shim：把 threejs-miniprogram 的 createScopedThreejs 映射为浏览器 three。
 * 注意：import * as THREE 得到的是只读命名空间对象，需要浅拷贝为可变对象，
 *       否则 gltf-loader.js 里 THREE.GLTFLoader = ... 会赋值失败。
 */
import * as THREE from 'three'

export function createScopedThreejs(canvas) {
  return Object.assign({}, THREE)
}
