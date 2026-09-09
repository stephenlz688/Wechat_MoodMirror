# 衣镜 · MoodMirror

微信小程序——3D 虚拟试衣。内置仿真男女模特（腾讯混元3D 生成），默认白 T 恤 + 黑裤子；上传衣服图片即可实时「穿」到模特身上，支持男女切换、左右旋转、双指缩放。

## 功能

- **仿真 3D 模特**：腾讯混元3D 由真人参考图生成，GLB 模型 + three.js 渲染，非卡通木偶
- **性别切换**：男 / 女模型实时切换（另一性别后台预加载，切换无感）
- **衣服试穿**：上传衣服图片，自动识别白色 T 恤区域（躯干 + 袖子），三平面映射贴合身体，可一键脱下
- **交互**：单指仅左右旋转（不上下翻转），双指缩放
- **默认着装**：白色 T 恤 + 黑色牛仔裤

## 技术栈

- 微信小程序原生框架
- `threejs-miniprogram@0.0.8`（内置 three r108）
- `utils/gltf-loader.js`：由 three r108 GLTFLoader 包装的小程序适配版
- `utils/human-model.js`：GLB 加载、归一化、T 恤区域识别、换衣叠加层（ShaderMaterial 三平面映射），同时兼容 three r108 / r160
- 模型由腾讯混元3D（图生 3D）生成，经 gltf-transform 减面、纹理压缩（约 44MB → 2MB）

## 项目结构

```
├── app.js / app.json / app.wxss        # 小程序入口
├── pages/index/                        # 主页面（3D 试衣）
├── utils/
│   ├── human-model.js                  # 人体模型管理（加载/归一化/性别/换衣）
│   ├── gltf-loader.js                  # three r108 GLTFLoader 小程序适配版
│   └── config.js                       # 模型托管地址等配置
├── models/
│   ├── male.glb / female.glb           # 压缩后成品模型（各约 2MB）
│   └── source/                         # 混元原始大模型与输入图（不进 git / 不进包）
├── scripts/
│   ├── optimize-human.mjs              # GLB 减面 + 纹理压缩
│   └── extract-textures.mjs            # 提取 GLB 纹理 / 查看结构
├── miniprogram_npm/                    # npm 构建产物
├── preview/                            # 浏览器预览与兼容性调试（不进小程序包）
└── project.config.json
```

## 开发

### 安装依赖

```bash
npm install
# 微信开发者工具：工具 → 构建 npm
```

### 模型从哪里加载

成品模型各约 2MB，超过小程序主包 2MB 限制，因此运行时通过 `wx.downloadFile` 远程加载，地址在 `utils/config.js` 的 `MODEL_BASE_URL` 配置：

- **本地开发**：运行 `node preview/server.js`，模型地址指向 `http://localhost:8642/models`；微信开发者工具需在「详情 → 本地设置」勾选「不校验合法域名、TLS…」（项目已默认 `urlCheck:false`）。
- **正式上线**：把 `models/male.glb`、`models/female.glb` 上传到 HTTPS 的 CDN / 对象存储，修改 `MODEL_BASE_URL`，并在小程序管理后台把域名加入 `downloadFile` 合法域名。

### 浏览器预览（无需小程序环境，调试渲染 / 换衣）

```bash
node preview/server.js
# 打开 http://localhost:8642/preview/            （主预览，three r160）
#   参数 ?gender=male|female&cloth=auto
# http://localhost:8642/preview/compat.html      （three r108 兼容性回归，与小程序同版本）
```

### 微信开发者工具运行

1. 启动模型服务 `node preview/server.js`
2. 导入项目目录，构建 npm
3. 勾选「不校验合法域名」，编译运行

## 重新生成 / 压缩模型

1. 用 A-pose、纯白底、正面全身图在 [腾讯混元3D](https://3d.hunyuan.tencent.com/) 图生 3D，导出 GLB 到 `models/source/`
2. 减面 + 压缩纹理：

```bash
node scripts/optimize-human.mjs models/source/xxx.glb models/male.glb 50000 1024
# 参数：输入 输出 目标三角面数 纹理边长
```

## 注意事项

- `app.json` 中不要开启 `lazyCodeLoading: "requiredComponents"`，否则会报 `this._getData is not a function`
- `renderer.setSize(w, h, false)` 第三参必须为 `false`，避免动态改 canvas 样式触发渲染层错误
- 逻辑层没有 `performance`，计时用 `Date.now()`
- 换衣识别依赖模型 baseColor 纹理读取像素；读取失败时按人体位置兜底

## License

MIT
