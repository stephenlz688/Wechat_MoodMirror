/**
 * build-npm.js —— 本地模拟微信开发者工具"构建 npm"，生成 miniprogram_npm。
 *
 * threejs-miniprogram 的 dist/index.js 已自包含完整 three.js（r108），
 * 因此这里只需复制包并生成符合小程序模块解析规则的入口文件。
 *
 * 用法：node scripts/build-npm.js
 * 说明：在微信开发者工具中重新点击"构建 npm"也会得到等效产物。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'node_modules', 'threejs-miniprogram')
const DEST = path.join(ROOT, 'miniprogram_npm', 'threejs-miniprogram')

if (!fs.existsSync(path.join(SRC, 'dist', 'index.js'))) {
  console.error('[build-npm] 未找到 node_modules/threejs-miniprogram，请先执行 npm install')
  process.exit(1)
}

// 1. 清空并重建目标目录
fs.rmSync(DEST, { recursive: true, force: true })
fs.mkdirSync(DEST, { recursive: true })

// 2. 复制 dist 与 package.json / LICENSE
for (const name of ['dist', 'package.json', 'LICENSE']) {
  const s = path.join(SRC, name)
  if (fs.existsSync(s)) {
    fs.cpSync(s, path.join(DEST, name), { recursive: true })
  }
}

// 3. 生成入口 index.js（小程序 require('threejs-miniprogram') 时加载它）
fs.writeFileSync(
  path.join(DEST, 'index.js'),
  "module.exports = require('./dist/index.js')\n",
  'utf8'
)

// 4. 自检：用 node 加载验证导出
const mod = require(path.join(DEST, 'index.js'))
if (typeof mod.createScopedThreejs === 'function') {
  console.log('[build-npm] 构建成功：miniprogram_npm/threejs-miniprogram (导出 createScopedThreejs)')
} else {
  console.error('[build-npm] 自检失败：导出不符合预期')
  process.exit(1)
}
