# 衣镜 · MoodMirror

微信小程序——3D 虚拟试衣。上传衣服图片，实时穿到 3D 模特身上；支持男女模特切换、左右旋转、双指缩放。

## 功能

- **3D 模特**：基于 GLB 模型 + three.js（threejs-miniprogram）渲染
- **性别切换**：男女模型实时切换
- **衣服试穿**：上传衣服图片，自动映射到模特躯干和袖子
- **交互**：单指左右旋转，双指缩放
- **木偶色默认**：模特默认皮肤色，突出衣服效果

## 技术栈

- 微信小程序原生框架
- `threejs-miniprogram@0.0.8`（内置 three r108）
- GLTFLoader 加载 GLB 模型
- 衣服贴图层：独立几何体，按标准人体比例定位

## 项目结构

```
├── app.js / app.json / app.wxss    # 小程序入口
├── pages/index/                    # 主页面（3D 试衣）
├── utils/
│   ├── model.js                    # 模特类（GLB 加载 + 衣服贴图）
│   └── gltf-loader.js              # GLTFLoader（threejs-miniprogram 适配版）
├── models/                         # 模型分包（GLB 文件）
│   ├── Xbot.glb                    # 人体模型（Mixamo Xbot）
│   └── pages/empty/                # 分包占位页面
├── miniprogram_npm/                # npm 构建产物
├── preview/                        # 浏览器预览版（开发调试用）
└── project.config.json
```

## 开发

### 安装依赖

```bash
npm install
npm run build:npm
```

### 浏览器预览（开发调试）

```bash
node preview/server.js
# 打开 http://localhost:8642/preview/
# 支持 ?gender=male|female&cloth=auto 参数
```

### 微信开发者工具

1. 导入项目目录
2. AppID 选测试号
3. 编译运行

## 模型替换

当前使用 Mixamo Xbot 作为默认模型。如需替换为更写实的模型：

1. 准备 GLB 格式的人体模型（推荐 [Ready Player Me](https://readyplayer.me) 生成）
2. 放入 `models/` 目录
3. 修改 `pages/index/index.js` 中的 `MODEL_URLS`

### 模型要求

- 格式：GLB（二进制 glTF 2.0）
- 姿势：A-pose 或 T-pose
- 面向：默认面向 -Z（代码会自动旋转 180°）
- 尺寸：代码会自动归一化到高 1.7m

## 注意事项

- 模型文件放在分包 `models/` 中，避免超过主包 2MB 限制
- `app.json` 中不要开启 `lazyCodeLoading: "requiredComponents"`，否则会报 `this._getData is not a function`
- 纹理使用 `texture.encoding = THREE.sRGBEncoding`（three r108 用法）

## License

MIT
