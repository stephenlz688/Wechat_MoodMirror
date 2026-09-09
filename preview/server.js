// 极简静态文件服务器（仅用于本地预览与无头验证）
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT || 8642)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary'
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  let file = path.join(ROOT, urlPath === '/' ? 'preview/index.html' : urlPath)
  // 防目录穿越
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden') }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      file = path.join(file, 'index.html')
      return fs.stat(file, (err2) => {
        if (err2) { res.writeHead(404); return res.end('not found') }
        send(file, res)
      })
    }
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found') }
    send(file, res)
  })
}).listen(PORT, () => console.log(`server on http://localhost:${PORT}`))

function send(file, res) {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}
