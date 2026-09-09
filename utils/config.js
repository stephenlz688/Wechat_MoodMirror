/**
 * config.js —— 全局配置
 */

// 3D 模型（GLB）托管根地址。
// 开发阶段：启动 preview/server.js（node preview/server.js），用本机地址；
//   微信开发者工具需在「详情-本地设置」勾选「不校验合法域名…」（项目已默认 urlCheck:false）。
// 上线阶段：把 models/male.glb、models/female.glb 上传到 HTTPS 的 CDN/对象存储，
//   并在小程序管理后台「开发-服务器域名」的 downloadFile 合法域名中加入该域名。
const MODEL_BASE_URL = 'http://localhost:8642/models'

export const CONFIG = {
  MODEL_BASE_URL,
  // 归一化后的模特身高（米）
  TARGET_HEIGHT: 1.7,
  GENDERS: ['male', 'female']
}
