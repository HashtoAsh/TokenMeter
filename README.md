# TokenMeter 用量表

轻量级 Windows 桌面悬浮窗应用：监控大模型 API（OpenAI 兼容 `chat/completions`）的 **Token 用量与费用**。贴边悬浮常驻屏幕边缘，随时瞄一眼今日消耗。

## ✨ 特性

- 🪟 **贴边悬浮窗**：透明、无边框、置顶、不进任务栏，常态是一条 22×130 的竖条
- 🧲 **全区域拖动 + 边缘吸附**：按住任意位置拖动，松手时贴近屏幕边缘(<32px)自动贴边收起
- 🖱️ **三态交互**：贴边竖条 → 鼠标移入展开概览(输入/输出/费用) → 点击进入详情(400×640)
- ➕ **多模型管理**：内置 DeepSeek / MiMo / ChatGPT 预设，可手动配置端点、Key、定价与响应解析路径；支持**添加与编辑**（独立窗口表单）
- ⏱️ **定时轮询**：每 10 分钟向各模型发一次最小请求，解析响应 `usage` 并累计当日用量；详情页也可 **↻ 手动轮询**
- 💰 **费用估算**：输入/输出 tokens ÷ 1000 × 单价，按模型币种（¥ / $ / € …）显示
- 🔔 **系统托盘**：显示 / 隐藏主窗口、退出
- 📦 **单文件安装包**：Tauri 1.x + NSIS

> 统计口径说明：TokenMeter 只统计**它自己发出的轮询/测试请求**的用量（响应 `usage` 为单次请求口径），并非第三方工具在你账号上的全部消耗。

## 🖥️ 安装

下载并运行发布版安装包（NSIS）：

```
src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe
```

需要 Windows 10/11 与 WebView2 Runtime（Win10 1803+ 通常已内置）。

## 🚀 快速使用

1. 托盘/悬浮条进入详情面板 → **+ 添加** → 独立窗口选模板或手填 → **测试连接** → 保存
2. 既有模型可点 **编辑** 修改 Key / 价格 / 端点
3. 详情面板 **↻ 轮询** 手动刷新今日用量；模型行下方或概览面板会显示最近一次轮询失败原因
4. 按住窗口任意处拖动，贴近屏幕边缘松手即吸附贴边

## ⚙️ 配置

运行时在**工作目录**（开发模式）或 **exe 所在目录**（安装版）读写 `config.json`，
首次启动自动生成默认值：

```jsonc
{
  "models": [ /* 模型列表，示例见 config.example.json */ ],
  "pollingInterval": 600000   // 轮询间隔 ms（默认 10 分钟）
}
```

`models[].responsePath` 支持点号与数组下标，如 `usage.prompt_tokens`、`choices[0].usage.total_tokens`。
配置损坏时会先备份为 `config.json.bak.<时间戳>` 再重置，不会静默清空。

> 使用方式：把 [config.example.json](config.example.json) 复制为 `config.json` 并填入你的模型与密钥即可
> （首次启动也会自动按默认值生成配置）。

## 🛠️ 开发与构建（Windows）

环境：Rust stable（MSVC）、Node.js ≥ 22.2、pnpm、WebView2 Runtime。

```powershell
pnpm install                          # 前端依赖
pnpm tauri dev                        # 本地开发（Vite 热更新 + debug 运行）
pnpm build                            # 仅前端构建（tsc && vite build → dist/）
cargo build --features custom-protocol   # 后端 debug（在 src-tauri/ 下；独立跑 exe 用）
pnpm tauri build --features custom-protocol   # 正式安装包（NSIS）
```

- 必须带 `--features custom-protocol`，否则前端 `dist` 不会被内嵌，窗口会白屏
  （debug 模式默认加载 `http://localhost:1420`）。
- 网络受限环境可改用一键脚本 `tools\build.ps1`（普通模式失败时自动回退本地镜像代理，
  详见该脚本头部注释与 `tools/registry-proxy.mjs`）。
- 重生成图标：`node tools\gen-icon.mjs`（无依赖生成 1024² 源图）→
  `pnpm tauri icon <源图路径>` 产出 `src-tauri/icons/` 全套。

常见问题（白屏、WebView2 报错等）见 [docs/quick-start.md](docs/quick-start.md)。

## 📁 工程结构

```
TokenMeter/
├── src/                  # 前端：React 18 + TS + Tailwind + Zustand
│   ├── App.tsx           # 三态切换 / 窗口尺寸 / 独立添加·编辑窗口(?add=1&?edit=)
│   ├── layout.ts         # 各状态窗口尺寸 + 吸附阈值
│   ├── components/       # FloatingBar / QuickInfo / DetailPanel / ModelManager
│   ├── hooks/            # useWindowDrag（拖动 + 边缘吸附）
│   ├── stores/           # useStore（Zustand）
│   └── utils/            # 币种/金额格式化等
├── src-tauri/            # 后端：Rust + Tauri 1.x
│   ├── src/              # main.rs / models.rs / commands.rs / poller.rs
│   ├── icons/            # tauri icon 全套图标
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tools/                # build.ps1 / registry-proxy.mjs / gen-icon.mjs
├── docs/                 # 架构 / 接口 / 上手文档
├── config.example.json   # 配置模板（示例）
└── package.json
```

## 📄 文档

- [docs/README.md](docs/README.md) — 文档索引
- [docs/quick-start.md](docs/quick-start.md) — 构建运行 / 使用说明 / 常见问题
- [docs/architecture.md](docs/architecture.md) — 整体架构与模块划分
- [docs/api-design.md](docs/api-design.md) — Tauri 命令、事件与配置 schema
- [docs/tech-stack.md](docs/tech-stack.md) — 依赖与技术选型

## 📝 更新日志

### v0.1.0

- 悬浮窗三态交互、拖动与边缘吸附、系统托盘
- 模型管理（预设模板、添加/编辑、测试连接、手动轮询、轮询失败提示）
- 10 分钟自动轮询、今日 Token/费用统计（本地时区切日、按币种显示金额）
- Tauri 1.x + NSIS 单文件安装包

## 📄 许可证

[MIT](LICENSE)
