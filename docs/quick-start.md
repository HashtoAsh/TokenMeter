# TokenMeter 用量表 — 快速上手（Windows）

> 本文面向开发者与终端用户。终端用户直接运行发布版安装包即可；开发者参考第 3 节构建。

## 1. 安装包

正式安装包由 NSIS 打包（构建后产物）：

```
src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe
```

## 2. 环境要求（Windows）

| 组件 | 说明 |
|---|---|
| Rust | stable，MSVC toolchain（`rustup toolchain install stable-x86_64-pc-windows-msvc`） |
| Node.js | **≥ 22.2**（`package.json` engines 约束），并安装 pnpm |
| WebView2 Runtime | Windows 10 1803+ 通常已内置 |
| Visual C++ Build Tools | Rust MSVC 链接所需 |

仅 Windows 平台，无需 macOS/Linux 工具链。

## 3. 构建与运行

### 3.1 依赖

```powershell
pnpm install          # 前端依赖；Rust 依赖由 cargo 构建时自动拉取
```

### 3.2 本地开发（前端热更新）

```powershell
pnpm tauri dev
```

等价于：`pnpm dev` 起 Vite（端口 1420），再在 `src-tauri` 下 debug 构建运行——debug 模式加载 `http://localhost:1420`。

### 3.3 前端构建与独立 exe

```powershell
pnpm build                          # tsc && vite build → dist/
# 独立运行后端 exe 需内嵌 dist：
#   （进入 src-tauri/）cargo build --features custom-protocol
# 否则 debug exe 会去加载 http://localhost:1420 而白屏
```

### 3.4 正式打包

```powershell
pnpm tauri build --features custom-protocol   # beforeBuildCommand 会先执行 pnpm build
```

产物：`src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`。

> 必须带 `--features custom-protocol`（内嵌前端 dist）；缺失会导致安装版白屏。

### 3.5 受限网络环境

若本机 cargo 下载依赖失败（如 TLS 后端异常），可使用一键脚本
`powershell -ExecutionPolicy Bypass -File tools\build.ps1`：
先试普通 `cargo fetch`，失败则自动启动 `tools/registry-proxy.mjs` 本地镜像代理完成下载，
并最终以 `cargo build --features custom-protocol` 构建。细节见该脚本头部注释。

## 4. 使用说明

- **系统托盘**：右键图标 → 显示主窗口 / 隐藏主窗口 / 退出。
- **悬浮窗三态交互**：

```
docked 贴边竖条 (22×130) ──鼠标移入──▶ hovering 概览 (320×400)
   ▲                                       │ 点击
   │               收起 ◀───────────────────▼
   └────────────── expanded 详情面板 (400×640)
```

  - 竖条/面板整块按住可拖动；松手时窗口贴近屏幕任一边缘(<32px)自动**吸附贴边**并收起。
  - 展开时贴右缘会自动向左生长，避免超出屏幕。
- **查看统计**：详情面板 **↻ 轮询** 手动触发一次全模型轮询（真实发请求）；下方为选中模型今日统计
  （请求次数、输入/输出/总 Tokens、今日总费用，金额按模型币种显示）。
  轮询失败会在概览与详情中显示原因提示。
- **模型管理**：详情面板 **+ 添加 / 编辑** 打开独立窗口：
  - 快速选择模板：DeepSeek（`deepseek-chat`）、MiMo（`mimo-v2.5-pro`，Token Plan 中国区端点，
    价格填 0——按订阅计费只统计 token）、ChatGPT（`gpt-4o`）；
  - 表单字段：名称、模型ID（即请求体 `model`）、完整 chat/completions URL、API Key、
    输入/输出单价（每 1K tokens）、币种、高级设置里的响应解析路径；
  - “测试连接”验证后再保存；保存自动关闭窗口并通知主窗口刷新。
- **轮询机制**：后台每 10 分钟（`pollingInterval`，默认 600000ms）向各模型发一次最小请求读取用量；
  当日用量仅存内存、次日自动清零。

## 5. 配置文件

运行时在**工作目录**（开发）或 **exe 所在目录**（安装版）读写 `config.json`
（首次启动自动创建默认值：`pollingInterval: 600000`、`models: []`）。

- 模型配置与轮询间隔的修改即时写回；
- 配置损坏（JSON 解析失败）时会先备份为 `config.json.bak.<时间戳>` 再重置，不静默清空；
- 配置字段说明见 [api-design.md](api-design.md)；模板见仓库根 `config.example.json`（复制为 `config.json` 填写即可）。

## 6. 常见问题

**Q1：debug 构建白屏？**
debug 模式默认加载 `http://localhost:1420`：要么保持 `pnpm dev` 运行，要么用
`cargo build --features custom-protocol` 构建内嵌前端的 exe。

**Q2：应用启动即退出，WebView2 报“资源在使用中 / 0x800700AA”？**
删除 WebView2 profile 缓存目录后重启：`%LOCALAPPDATA%\com.tokenmeter.app`。

**Q3：如何重生成图标？**
`node tools\gen-icon.mjs` 生成源图（输出到脚本所在目录），再执行
`pnpm tauri icon <源图路径>` 重生成 `src-tauri/icons/` 全套。

## 7. 相关文档

- [README.md](../README.md)：总览与配置
- [architecture.md](architecture.md)：整体架构、模块划分与数据流
- [api-design.md](api-design.md)：Tauri 命令、事件与 config schema
- [tech-stack.md](tech-stack.md)：依赖与技术选型
