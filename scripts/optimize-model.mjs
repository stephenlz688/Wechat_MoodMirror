/**
 * 用 gltf-transform 去掉动画 + 减面优化，目标 2MB 以下。
 */
import { NodeIO } from '@gltf-transform/core'
import { prune, weld, sparse, simplify } from '@gltf-transform/functions'
import { statSync } from 'fs'

const input = 'models/Xbot.glb'
const output = 'models/Xbot-min.glb'

const io = new NodeIO()
const doc = await io.read(input)
const root = doc.getRoot()

// 删除所有动画
root.listAnimations().forEach((a) => a.dispose())

// 减面 50% + 顶点焊接 + 稀疏化 + 清理
await doc.transform(
  simplify({ ratio: 0.5, error: 0.001 }),
  weld(),
  sparse(),
  prune()
)

await io.write(output, doc)
console.log(`完成: ${(statSync(output).size / 1024).toFixed(1)} KB`)
