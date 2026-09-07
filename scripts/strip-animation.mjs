/**
 * 用 gltf-transform 去掉 GLB 中的动画数据并全面优化。
 * 用法：node scripts/strip-animation.mjs <input.glb> <output.glb>
 */
import { NodeIO } from '@gltf-transform/core'
import { prune, weld, sparse } from '@gltf-transform/functions'
import { statSync } from 'fs'

const [, , input, output] = process.argv
if (!input || !output) {
  console.error('用法: node scripts/strip-animation.mjs <input.glb> <output.glb>')
  process.exit(1)
}

const io = new NodeIO()
const doc = await io.read(input)
const root = doc.getRoot()

// 删除所有动画
const anims = root.listAnimations()
console.log(`找到 ${anims.length} 个动画，正在删除...`)
anims.forEach((a) => a.dispose())

// 优化：顶点焊接 + 重排 + 稀疏化 + 清理
await doc.transform(
  weld(),
  sparse(),
  prune()
)

await io.write(output, doc)
const size = statSync(output).size
console.log(`导出成功: ${output} (${(size / 1024).toFixed(1)} KB)`)
