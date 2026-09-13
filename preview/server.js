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

// 读取 AI 配置
function loadAiConfig() {
  const cfgPath = path.join(ROOT, 'config', 'ai-config.json')
  let cfg = {}
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  } catch (e) { /* 配置文件不存在时用默认值 */ }
  return {
    provider: cfg.provider || 'pollinations',
    size: cfg.size || '1024x1024',
    // 火山方舟
    arkApiKey: process.env.ARK_API_KEY || cfg.arkApiKey || '',
    arkModel: cfg.arkModel || 'doubao-seedream-4-5-251128',
    arkBaseUrl: cfg.arkBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    // 硅基流动
    siliconFlowApiKey: process.env.SILICONFLOW_API_KEY || cfg.siliconFlowApiKey || '',
    siliconFlowModel: cfg.siliconFlowModel || 'stabilityai/stable-diffusion-xl-base-1.0',
    siliconFlowBaseUrl: cfg.siliconFlowBaseUrl || 'https://api.siliconflow.cn/v1/images/generations',
    // Pollinations（免费无需Key）
    pollinationsModel: cfg.pollinationsModel || 'flux'
  }
}

// 根据品类构建专业 prompt（生成布料/材质纹理图，适合三平面映射）
// 生成纯纹理而非穿着图，避免人物干扰，贴合3D模型效果更好
function buildPrompt(category, userPrompt) {
  const fabric = `${userPrompt} fabric texture, woven textile material, seamless repeat pattern, close-up material detail, even studio lighting, no person no object no garment`
  const templates = {
    shirt: fabric,
    pants: fabric,
    shoes: `${userPrompt} material texture, footwear leather or fabric material, seamless pattern, close-up detail, even lighting, no person no object`,
    hat: fabric
  }
  return templates[category] || fabric
}

// Pollinations：免费无需Key，直接URL返回图片
function callPollinations(cfg, prompt) {
  const [w, h] = (cfg.size || '1024x1024').split('x')
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?model=${cfg.pollinationsModel}&width=${w}&height=${h}&nologo=true&seed=${Date.now() % 100000}`
  console.log('[AI] Pollinations URL:', url.slice(0, 120) + '...')
  return Promise.resolve(url)
}

// 通用 OpenAI 兼容文生图调用（火山方舟 / 硅基流动）
function callOpenAICompatible(baseUrl, apiKey, model, prompt, size) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, size, response_format: 'url' })
    const url = new URL(baseUrl)
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
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

// 按 provider 分发
function callAi(cfg, prompt) {
  switch (cfg.provider) {
    case 'ark':
      if (!cfg.arkApiKey) return Promise.reject(new Error('provider=ark 但未配置 arkApiKey'))
      return callOpenAICompatible(cfg.arkBaseUrl, cfg.arkApiKey, cfg.arkModel, prompt, cfg.size)
    case 'siliconflow':
      if (!cfg.siliconFlowApiKey) return Promise.reject(new Error('provider=siliconflow 但未配置 siliconFlowApiKey'))
      return callOpenAICompatible(cfg.siliconFlowBaseUrl, cfg.siliconFlowApiKey, cfg.siliconFlowModel, prompt, cfg.size)
    case 'pollinations':
    default:
      return callPollinations(cfg, prompt)
  }
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
        const { category, prompt } = JSON.parse(body || '{}')
        if (!category || !prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ error: '缺少 category 或 prompt 参数' }))
        }
        const fullPrompt = buildPrompt(category, prompt)
        console.log(`[AI] provider=${cfg.provider} 生成 ${category}: ${fullPrompt}`)
        const imgUrl = await callAi(cfg, fullPrompt)
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
