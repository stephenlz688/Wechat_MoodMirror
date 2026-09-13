// 静态文件服务器 + AI 换衣代理接口（本地开发用）
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT || 8642)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary'
}

// 读取 AI 配置（环境变量优先，其次 config/ai-config.json）
function loadAiConfig() {
  const cfgPath = path.join(ROOT, 'config', 'ai-config.json')
  let cfg = {}
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  } catch (e) { /* 配置文件不存在时用默认值 */ }
  return {
    apiKey: process.env.ARK_API_KEY || cfg.arkApiKey || '',
    model: cfg.model || 'doubao-seedream-4-5-251128',
    baseUrl: cfg.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    size: cfg.size || '1024x1024'
  }
}

// 根据品类构建专业 prompt（生成衣服平铺/纹理图）
function buildPrompt(category, userPrompt) {
  const templates = {
    shirt: `一件${userPrompt}的T恤，平铺展示正面，纯白色背景，服装产品摄影，高清布料纹理，无模特无人台，无褶皱阴影，居中构图`,
    pants: `一条${userPrompt}的长裤，平铺展示正面，纯白色背景，服装产品摄影，高清布料纹理，无模特无人台，无褶皱阴影，居中构图`,
    shoes: `一双${userPrompt}的鞋子，侧面45度视角，纯白色背景，产品摄影，高清材质纹理，无模特，居中构图`,
    hat: `一顶${userPrompt}的帽子，正面视角，纯白色背景，产品摄影，高清材质纹理，无模特，居中构图`
  }
  return templates[category] || templates.shirt
}

// 调用火山方舟 Seedream 文生图
function callArk(cfg, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: cfg.model,
      prompt: prompt,
      size: cfg.size,
      response_format: 'url'
    })
    const url = new URL(cfg.baseUrl)
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (resp) => {
      let data = ''
      resp.on('data', (c) => data += c)
      resp.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)))
          const imgUrl = json.data && json.data[0] && json.data[0].url
          if (!imgUrl) return reject(new Error('API 返回中没有图片 URL：' + data.slice(0, 300)))
          resolve(imgUrl)
        } catch (e) {
          reject(new Error('解析 API 响应失败：' + data.slice(0, 300)))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

const server = http.createServer((req, res) => {
  // CORS（小程序/浏览器调用）
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  const urlPath = decodeURIComponent(req.url.split('?')[0])

  // ---- AI 换衣代理接口 ----
  if (urlPath === '/api/ai-gen-cloth' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => body += c)
    req.on('end', async () => {
      try {
        const cfg = loadAiConfig()
        if (!cfg.apiKey) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ error: '未配置 API Key，请在 config/ai-config.json 填入 arkApiKey 后重启服务器' }))
        }
        const { category, prompt } = JSON.parse(body || '{}')
        if (!category || !prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ error: '缺少 category 或 prompt 参数' }))
        }
        const fullPrompt = buildPrompt(category, prompt)
        console.log(`[AI] 生成 ${category}: ${fullPrompt}`)
        const imgUrl = await callArk(cfg, fullPrompt)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ url: imgUrl }))
      } catch (e) {
        console.error('[AI] 生成失败:', e.message)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // ---- 静态文件 ----
  let file = path.join(ROOT, urlPath === '/' ? 'preview/index.html' : urlPath)
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
})

server.listen(PORT, () => console.log(`server on http://localhost:${PORT}`))

function send(file, res) {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}
