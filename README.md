# 3D 换装模特（微信小程序）

一个基于 **three.js（r108）+ WebGL** 的微信小程序：3D 木偶模特支持**性别实时切换**（平滑变形），默认呈现**未上漆木偶色**，并可**上传衣服图片**实时穿到模特身上（躯干 + 袖子）。

## 功能

| 功能 | 说明 |
|---|---|
| 3D 木偶模特 | 参数化人体建模：头部 / 躯干 / 四肢 / 关节球，共 30 个部位，木偶色质感 |
| 性别实时切换 | 一键切换男女，所有体型参数（肩宽、腰臀比、胸部、头脸比例等）逐帧插值，平滑变形 |
| 上传衣服 | 从相册/拍照选择衣服图片，作为纹理穿到躯干与上臂，可随时脱下 |
| 交互 | 单指拖动旋转、双指缩放（小程序端）；滚轮缩放（预览页） |

## 目录结构

```
weixinApp3d/
├── app.js / app.json / app.wxss     # 小程序入口
├── project.config.json              # 微信开发者工具项目配置（appid 为游客模式）
├── sitemap.json
├── pages/index/                     # 主页面
│   ├── index.js                     # 3D 场景初始化、触摸交互、性别/衣服逻辑
│   ├── index.wxml                   # 页面结构
│   ├── index.wxss                   # 页面样式
│   └── index.json
├── utils/model.js                   # ★ 核心：参数化木偶模特（性别变形 + 衣服贴图）
├── miniprogram_npm/                 # ★ 已构建的 npm 包（threejs-miniprogram，自含 three r108）
├── scripts/build-npm.js             # 本地重建 miniprogram_npm 的脚本
├── preview/                         # 浏览器预览版（同一份 model.js 逻辑）
│   ├── index.html                   # 预览页：http://localhost:8642/preview/
│   ├── shim.js / vendor/            # 浏览器适配与本地 three 模块
│   └── server.js                    # 静态服务器
└── verify/                          # 逻辑级回归测试（Node 运行）
```

## 快速开始（微信小程序）

1. **导入项目**：打开微信开发者工具 → 导入项目 → 选择本目录（AppID 可留空/用测试号，project.config.json 已配游客模式）。
2. **构建 npm（可选）**：`miniprogram_npm/` 已预构建。若改动依赖，可在开发者工具中点击 工具 → 构建 npm，或本地执行 `npm install && npm run build:npm`。
3. **编译运行**：基础库选 2.33.0 及以上，编译后即可在模拟器/真机看到 3D 模特。

> 提示：上传衣服使用 `wx.chooseMedia`（基础库 ≥ 2.10.0）；WebGL canvas 需基础库 ≥ 2.7.0。

## 浏览器预览（无需微信开发者工具）

```bash
node preview/server.js
# 打开 http://localhost:8642/preview/
```

URL 参数便于演示与验证：

```
/preview/                          # 默认男性木偶
/preview/?gender=female            # 初始为女性
/preview/?gender=female&cloth=auto # 女性 + 自动生成的红白条纹上衣
```

## 技术实现

- **3D 渲染**：`threejs-miniprogram`（官方小程序 WebGL 适配，自包含 three.js r108），通过 `createScopedThreejs(canvas)` 获取与 canvas 绑定的 three 作用域。
- **参数化建模**：`utils/model.js` 中每个部位持有一个 `rebuild()` 闭包，从统一参数表重建几何体与位置。性别切换 = 参数逐帧插值（帧率无关指数趋近），因此过渡平滑且体型差异真实。
- **衣服贴图**：躯干（两段圆柱）与上臂使用独立材质槽，上传图片 → `TextureLoader` → `MeshStandardMaterial({ map })`，UV 自动环绕包裹；默认木偶色材质随时可恢复。
- **光源**：环境光 + 主方向光 + 补光 + 半球光，透明背景叠加页面 CSS 渐变。

## 已知限制

- 衣服为**纹理贴合**方案（非 3D 服装建模），适合衣服平铺图/正面照；复杂立体剪裁（领口、下摆翻折）无法表现。
- 模型为低多边形风格木偶，非写实人体；如需写实模型可替换 `model.js` 为 GLTF 加载（需引入额外的模型文件与加载器）。
- 预览页依赖 `three@0.108.0` 本地 ESM 副本（`preview/vendor/`），可离线使用。

## 验证情况

- `node verify/run.mjs`：逻辑回归（构建 30 部位、性别变形收敛、体型参数断言、穿衣/脱衣/切性别保衣）全部通过。
- 浏览器无头渲染截图：男性木偶、女性木偶、女性穿红白条纹上衣三个场景渲染正常（three r108 渲染管线与 Shader 无报错）。
- 微信开发者工具/真机上的实际渲染请以导入运行结果为准。
