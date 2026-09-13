# TokenMeter 用量表

轻量级 Windows 桌面悬浮窗：按固定间隔向已配置的大模型 API 发一次最小请求，读取响应中的 token 用量并折算费用，
贴边常驻屏幕边缘，随时瞄一眼今日消耗。

> **统计口径**：只统计 TokenMeter **自己发出的轮询/测试请求**（响应 `usage` 是单次请求口径），
> 不代表该账号在其它工具上的全部消耗。

## 特性

| 能力 | 说明 |
|---|---|
| 贴边悬浮窗 | 透明、无边框、置顶、不进任务栏；常态是一条 22×130 竖条 |
| 三态交互 + 边缘吸附 | 竖条 → 鼠标移入概览 → 点击详情；拖动贴近屏幕边缘（<32px）松手自动贴边收起 |
| 多模型管理 | 内置 DeepSeek / MiMo / ChatGPT 模板，可添加与编辑；独立窗口表单，先"测试连接"再保存 |
| 费用估算 | 输入/输出 tokens ÷ 1000 × 单价，按模型币种（¥ / $ / € …）显示 |
| 今日统计 | 请求次数、输入/输出/总 tokens、今日费用；按**本地时区**零点切日 |
| 历史查询 | 按 API Key / 模型 / 总计查某日明细，近 7 天费用趋势，导出月度 CSV，可忽略异常记录 |
| 定时轮询 | 默认每 10 分钟一次（`pollingInterval`），详情面板可 ↻ 手动轮询；失败会在概览与详情中提示原因 |
| 数据留存 | 本地 SQLite（`usage_data.db`：用量记录 + 调试日志），默认保留 3 个月，启动时提示导出 CSV 或清理 |
| 桌面集成 | 系统托盘、开机自启动（写注册表）、单实例运行、窗口权限最小化 + 保守 CSP |

## 快速开始

环境：Windows 10/11 + WebView2 Runtime + Rust（MSVC）+ Node.js ≥ 22.2 + pnpm。

    pnpm install
    pnpm tauri dev                                 # 开发：Vite(1420) + debug 后端，前端热更新
    pnpm tauri build --features custom-protocol    # 打包：NSIS 安装包
    node tools/test-window-geometry.cjs            # 贴边/展开几何的回归测试（22 项断言）

产物：

- 安装包 `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`
- 便携版 `cargo build --release --features custom-protocol` → `src-tauri\target\release\TokenMeter.exe`

必须带 `--features custom-protocol`，否则前端 `dist` 不会被内嵌，运行时会白屏。详见 [docs/quick-start.md](docs/quick-start.md)。

## 首次使用

1. 托盘/悬浮条 → 详情面板 → **+ 添加** → 选模板或手填 → **测试连接** → 保存
2. 需要填写：名称、模型 ID（即请求体 `model`）、完整 `…/chat/completions` 地址、API Key、
   每 1K tokens 的输入/输出单价、币种
3. 既有模型可点 **编辑** 修改 Key / 价格 / 端点；**↻ 轮询** 手动刷新一次今日用量
4. 历史页可切"按 Key / 按模型 / 总计"查询某日明细并导出 CSV

## 配置

运行时在**工作目录**（开发）或 **exe 所在目录**（安装版）读写 `config.json`，首次启动自动生成默认值：

    {
      "models": [ /* 模型列表，示例见 config.example.json */ ],
      "pollingInterval": 600000   // 轮询间隔（毫秒），默认 10 分钟
    }

- `models[].responsePath` 支持点号与数组下标，如 `usage.prompt_tokens`、`choices[0].usage.total_tokens`；
- 配置损坏（JSON 解析失败）会先备份为 `config.json.bak.<时间戳>` 再重置，不会静默清空；
- 字段与命令接口见 [docs/api-design.md](docs/api-design.md)。

## 工程结构

    TokenMeter/
    ├── src/                      # 前端：React 18 + TS + Tailwind + Zustand
    │   ├── App.tsx               # 三态切换；贴边状态 → 窗口几何的唯一入口
    │   ├── layout.ts             # 各状态尺寸、吸附/冷却/动画参数
    │   ├── lib/                  # windowGeometry(纯几何) / windowTauri(执行层) / addModelWindow(子窗口)
    │   ├── hooks/useWindowDrag.ts# 拖动 + 边缘吸附
    │   ├── components/           # FloatingBar / QuickInfo / DetailPanel / ModelManager / HistoryPanel …
    │   └── stores/useStore.ts    # Zustand：models/stats/edgeState/dockSide + invoke 封装
    ├── src-tauri/                # 后端：Rust + Tauri 1.x
    │   ├── src/                  # main.rs / commands.rs / poller.rs / storage.rs / models.rs
    │   ├── tauri.conf.json       # 窗口、allowlist、CSP、打包目标
    │   └── Cargo.toml
    ├── tools/                    # build.ps1 / registry-proxy.mjs / gen-icon.mjs / test-window-geometry.cjs
    ├── docs/                     # 架构 / 接口 / 上手 / 技术栈
    ├── output/                   # 发布产物（安装包 + 便携版）
    ├── PROGRESS.md               # 改进历史与问题根因记录
    └── config.example.json       # 配置模板

## 文档

- [docs/quick-start.md](docs/quick-start.md) — 环境、构建与打包、使用说明、排障
- [docs/architecture.md](docs/architecture.md) — 模块划分、数据流、窗口状态机、存储
- [docs/api-design.md](docs/api-design.md) — Tauri 命令与事件、config schema、HTTP 请求形态
- [docs/tech-stack.md](docs/tech-stack.md) — 真实依赖清单与关键工程配置
- [PROGRESS.md](PROGRESS.md) — 每轮改进的"问题 → 根因 → 修法 → 验证"

## 更新日志

### 未发布：窗口体验修复

- **"添加/编辑模型"窗口不再是"大窗套小窗"**：旧实现是整页 50% 黑遮罩 + 居中 384×594 面板，再叠一层系统标题栏；
  现在是无边框 + 透明 + 置顶的 500×690 面板，只有一层自绘标题栏（可拖动、✕/Esc 关闭），默认贴在主窗口旁边打开。
- **贴边隐藏重做**：收起一定贴到屏幕边缘；展开按显示器工作区钳制（不被任务栏/屏幕底部截断）；
  尺寸与位置同帧下发 + 140ms 滑动过渡；收起后有冷却，不再"刚收起又弹开"；竖条被拖离边缘会恢复为正常悬浮尺寸。
- 新增纯几何回归测试 `pnpm test:geometry`。

### v0.1.0

- 悬浮窗三态交互、拖动与边缘吸附、系统托盘
- 模型管理（模板、添加/编辑、测试连接、手动轮询、失败提示）
- 10 分钟自动轮询；今日 Token/费用统计（本地时区切日、按币种显示）
- SQLite 持久化、历史查询与月度 CSV 导出、忽略记录、数据保留策略、开机自启动
- 单实例运行；窗口权限按实际调用声明 + 保守 CSP
- Tauri 1.x + NSIS 单文件安装包

## 许可证

[MIT](LICENSE)（第三方组件见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)）
