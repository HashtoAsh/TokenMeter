# TokenMeter 用量表

轻量级 Windows 桌面悬浮窗应用，监控大模型 API（OpenAI 兼容 `chat/completions`）的 **Token 用量与费用**。
无数据库、无复杂功能：贴边悬浮 → 悬停看概览 → 点击看详情，每 5 分钟自动轮询一次。

## ✨ 特性

- 🪟 **桌面悬浮窗**：透明、无边框、置顶、不进任务栏（22×130 贴边竖条）
- 🧲 **拖动 + 边缘吸附**：按住任意位置拖动窗口，贴近屏幕边缘(<32px)松手自动贴边
- 🖱️ **三态交互**：贴边竖条 → 鼠标移入展开概览(输入/输出/费用) → 点击进入详情
- ➕ **多模型管理**：DeepSeek / MiMo / ChatGPT 预设模板 + 手动填写（端点、Key、定价、响应解析路径），添加在**独立弹窗**完成
- ⏱️ **定时轮询**：每 5 分钟向各模型发一次测试请求，解析 `usage` 字段并累计当日用量
- 💰 **费用统计**：按 输入/输出 tokens ÷ 1000 × 单价 估算当日费用
- 🔔 **系统托盘**：显示/隐藏主窗口、退出
- 📦 **单文件安装包**：NSIS 打包，Tauri 1.5（占用小、启动快）

## 📁 工程结构

```
TokenMeter/
├── src/                        # 前端 (React + TS + Tailwind + Zustand)
│   ├── App.tsx                 # 三态切换 / 窗口尺寸 / ?add=1 独立添加窗口
│   ├── layout.ts               # 各状态窗口尺寸 + 吸附阈值
│   ├── types.ts                # 类型 + 模型预设模板
│   ├── styles.css
│   ├── stores/useStore.ts      # Zustand 状态（模型/统计/edgeState）
│   ├── hooks/useWindowDrag.ts  # 窗口拖动 + 边缘吸附
│   └── components/
│       ├── FloatingBar.tsx     # 贴边竖条
│       ├── QuickInfo.tsx       # 悬停概览
│       ├── DetailPanel.tsx     # 详情面板（添加/轮询/收起）
│       └── ModelManager.tsx    # 添加模型表单（独立窗口/standalone）
├── src-tauri/                  # 后端 (Rust + Tauri 1.x)
│   ├── src/
│   │   ├── main.rs             # 入口、托盘、命令注册
│   │   ├── models.rs           # 数据模型（ModelConfig/AppConfig…）
│   │   ├── commands.rs         # 12 个 Tauri 命令
│   │   └── poller.rs           # 轮询引擎 + 连接测试
│   ├── icons/                  # 全套应用图标（tauri icon 生成）
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tools/
│   ├── build.ps1               # 一键构建脚本（schannel 异常时自动走本地代理）
│   ├── registry-proxy.mjs      # 本地 cargo 稀疏镜像代理（Node，无依赖）
│   ├── gen-icon.mjs            # 图标源图生成器
│   └── icon-source.png
├── docs/                       # 文档（见下方“文档”）
├── config.example.json         # 配置示例（真实 config.json 含 Key，不入库）
├── THIRD_PARTY_LICENSES.md     # 第三方依赖许可说明
└── package.json
```

## 🛠️ 技术栈

- **桌面框架**：Tauri 1.x（Rust，Windows / WebView2），`custom-protocol` 内嵌前端
- **前端**：React 18 · TypeScript · Vite 4 · Tailwind CSS 3 · Zustand 4
- **后端**：Rust · reqwest(rustls-tls) · tokio · serde · chrono · uuid · log/env_logger
- **存储**：运行目录下 `config.json`（纯文件，无数据库）

## 🚀 开发与构建（Windows）

### 环境要求
- Windows 10/11、WebView2 Runtime、Rust 工具链、Node.js 18+、pnpm

### 常用命令

```powershell
pnpm install                          # 安装前端依赖
pnpm build                            # 前端构建（tsc && vite build → dist/）
cargo build --features custom-protocol  # 编译后端（需在 src-tauri/ 下；独立运行 exe 用）
pnpm tauri build                      # 打正式安装包（NSIS）
```

- 独立运行 `src-tauri/target/debug/token-meter.exe` 需带 `custom-protocol`
  feature，否则 debug 构建会去加载 `http://localhost:1420`（devPath）。
- 日常一键构建（含网络兜底逻辑）可执行：`powershell -ExecutionPolicy Bypass -File tools\build.ps1`

### ⚠️ 本机网络特殊情况
部分环境（如本机）cargo/.NET 的 schannel TLS 会报 `SEC_E_NO_CREDENTIALS`，
`tools/build.ps1` 会自动启动 `tools/registry-proxy.mjs` 本地代理（127.0.0.1:8765）
走 Node/OpenSSL 下载依赖。构建期间建议关闭 DevSidecar 等代理工具以免劫持回环流量。

### 🔧 故障排查
- 应用启动即闪退、无窗口无托盘，控制台报 `CreateWebview ... 0x800700AA(资源在使用中)`：
  删除 `%LOCALAPPDATA%\com.tokenmeter.app`（WebView2 缓存目录）后重启。

## ⚙️ 配置

应用运行时在**当前目录**读取/写回 `config.json`（首次启动自动用默认值）。字段：

```jsonc
{
  "models": [ /* ModelConfig 数组，示例见 config.example.json */ ],
  "pollingInterval": 300000,   // 轮询间隔 ms
  "window": { "edgePosition": "right", "opacity": 0.9 }  // opacity 预留
}
```

- ⚠️ **`config.json` 含真实 API Key，已被 `.gitignore` 排除，切勿提交**；仓库内仅提供 `config.example.json` 脱敏示例。
- 模板默认值（`src/types.ts`）：DeepSeek(`deepseek-chat`) / MiMo(`mimo-v2.5-pro`, Token Plan 中国区端点) / ChatGPT(`gpt-4o`)。MiMo 走订阅 Credits 计费故价格填 0。
- 轮询会真实发送对话请求（含推理 token），会消耗按量/套餐额度，可在代码里调大 `pollingInterval`。

## 🧑‍💻 使用说明

1. 点击详情面板 **+ 添加** → 独立窗口选择模板或手填 → **测试连接** → 保存
2. 竖条整条可拖到屏幕边缘贴边；悬停看概览，点击进详情
3. 详情面板 **↻ 轮询** 可随时手动刷新今日用量
4. 托盘图标可隐藏/显示/退出

## 📄 文档

- [docs/README.md](docs/README.md) — 文档索引
- [architecture.md](docs/architecture.md) · [tech-stack.md](docs/tech-stack.md)
  · [api-design.md](docs/api-design.md) · [quick-start.md](docs/quick-start.md)
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) — 第三方依赖许可说明

## 📝 更新日志

### v0.1.0
- 悬浮窗三态交互、拖动与边缘吸附、系统托盘
- 模型管理（预设模板 + 独立添加窗口 + 测试连接 + 手动轮询）
- 5 分钟自动轮询、今日 Token/费用统计
- Tauri 1.x + NSIS 安装包、全套图标

## 📄 许可证

[MIT](LICENSE)

**TokenMeter** — 让 API 用量监控简单直观 🚀
