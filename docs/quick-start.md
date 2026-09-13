# TokenMeter 用量表 — 快速上手（Windows）

## 1. 环境要求

| 组件 | 说明 |
|---|---|
| Rust | stable + MSVC toolchain |
| Node.js | **≥ 22.2**（`package.json` engines 约束；`tools/gen-icon.mjs` 用到 `zlib.crc32`） |
| pnpm | 包管理 |
| WebView2 Runtime | Windows 10 1803+ 通常已内置 |
| Visual C++ Build Tools | Rust MSVC 链接所需 |

仅支持 Windows，无需 macOS/Linux 工具链。

## 2. 开发

    pnpm install
    pnpm tauri dev      # 起 Vite(1420) + debug 后端；debug 模式加载 http://localhost:1420

## 3. 构建与打包

    pnpm build                                     # 只出前端：tsc && vite build → dist/
    node tools/test-window-geometry.cjs            # 贴边/展开几何回归测试（22 项断言，无需 Tauri）

    # 便携版（必须带 feature，否则内嵌不进前端、运行白屏）
    cd src-tauri
    cargo build --release --features custom-protocol

    # 安装包（NSIS）
    pnpm tauri build --features custom-protocol

| 产物 | 路径 |
|---|---|
| 便携版 exe | `src-tauri\target\release\TokenMeter.exe` |
| 安装包 | `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe` |
| 发布目录（手工整理） | `output/TokenMeter_0.1.0_x64-setup.exe`、`output/portable/TokenMeter.exe` |

注意：

- `--features custom-protocol` 决定是否内嵌 `dist`，打包与"独立跑 exe"都必须带；
- `beforeBuildCommand` 会先执行 `pnpm build`；若本机 pnpm 包装器不认脚本里的 `&&`，
  可先单独跑 `tsc --noEmit` 与 `vite build`，再把该命令临时改成 `cmd /c exit 0`（**打完记得改回**）；
- 网络受限（cargo 拉不到依赖）时用一键脚本：
  `powershell -ExecutionPolicy Bypass -File tools\build.ps1` —— 先试普通 `cargo fetch`，失败自动起
  `tools/registry-proxy.mjs` 本地镜像代理再构建，并保证环境变量与临时文件复原。

## 4. 打包产物与实测验证（2026-09-13）

| 文件 | 大小 |
|---|---|
| `output/TokenMeter_0.1.0_x64-setup.exe` | 3.5 MB |
| `output/portable/TokenMeter.exe` | 11.2 MB |

直接运行便携版实测的窗口矩形（Win32 枚举 + 鼠标模拟）：

| 操作 | 实测 | 期望 |
|---|---|---|
| 启动 | 22×130 贴右边（x=2538） | docked 贴边 |
| 首次鼠标移入 | 320×400（右缘仍 2560） | 以贴边为锚向内展开 |
| 点击 | 400×640，稳定不抖 | expanded |
| 点"+ 添加" | 新增 500×690 子窗口，位于主窗左侧 12px | 子窗口不叠在、不被主窗盖住 |

添加窗口抓图逐像素扫描：只有 10px 透明留白 + 480px 圆角面板，**无 `127,127,127` 灰带**
（旧版此处是 48px/33px 纯灰带，即"大窗套小窗"）。取证图存于 `.local/before-add-window.png` / `after-add-window.png`。

## 5. 使用说明

    docked 贴边竖条 (22×130) ──鼠标移入──▶ hovering 概览 (320×400)
       ▲                                        │ 点击
       │            收起（移出 260ms 或点"收起"）  ▼
       └────────────────────────────── expanded 详情 (400×640)

- **拖动**：按住窗口任意处拖动；松手时距屏幕左/右边缘 <32px 自动吸附贴边收起，否则停在原地（不会被强行吸回）。
- **托盘**：显示主窗口 / 隐藏主窗口 / 退出。
- **单实例**：重复启动只会把已有窗口唤到前台；要重启请先从托盘退出。
- **模型管理**：详情面板 **+ 添加 / 编辑** 打开独立窗口 —— 选模板或手填（名称、模型 ID、完整
  `…/chat/completions` 地址、API Key、每 1K tokens 输入/输出单价、币种、响应解析路径），
  **测试连接** 通过后保存；保存会自动关闭子窗口并刷新主窗口。子窗口可拖动标题栏、✕ 或 Esc 关闭。
- **统计**：详情面板 **↻ 轮询** 手动触发一次全模型轮询（真实请求、会计费）；
  今日页显示选中模型的请求次数、输入/输出/总 tokens 与费用；历史页可按 Key/模型/总计查某日明细、
  看近 7 天费用趋势、导出月度 CSV、忽略异常记录。
- **数据保留**：默认 3 个月，启动时若发现更早的数据会询问导出 CSV 或直接清理。
- **开机自启动**：设置页开关，写入 `HKCU\…\CurrentVersion\Run`。

## 6. 配置文件

运行时在**工作目录**（存在则优先）或 **exe 所在目录**读写 `config.json`，首次启动自动生成默认值：

    { "models": [ /* 见 config.example.json */ ], "pollingInterval": 600000 }

- 模型/间隔的修改即时写回；配置损坏（JSON 解析失败）先备份为 `config.json.bak.<时间戳>` 再重置，不静默清空；
- 用量数据存同目录的 SQLite 文件 `usage_data.db`（用量记录 + 调试日志）；
- 字段含义见 [api-design.md](api-design.md)。

## 7. 常见问题

**Q1 运行白屏？** 构建时漏了 `--features custom-protocol`（前端未内嵌）。
debug 模式则会去加载 `http://localhost:1420`，需保持 `pnpm dev` 在跑。

**Q2 启动即退出、日志报 WebView2 `0x800700AA`（资源在使用中）？**
删除 WebView2 profile 缓存 `%LOCALAPPDATA%\com.tokenmeter.app` 后重启。

**Q3 双击图标没反应？** 单实例设计：只会唤起已有窗口。窗口被隐藏时用托盘"显示主窗口"。

**Q4 贴边条找不到了？** 它只会贴在屏幕左/右边缘；把它拖到屏幕中间会恢复为正常悬浮尺寸（不会卡成小条）。

**Q5 费用对不上账号账单？** 统计口径只含 TokenMeter 自身的轮询请求，见 [README](../README.md) 的统计口径说明。

**Q6 重新生成图标？** `node tools\gen-icon.mjs`（输出到脚本目录，需 Node ≥ 22.2）→
`pnpm tauri icon <源图路径>` 生成 `src-tauri/icons/` 全套。

## 8. 相关文档

- [../README.md](../README.md)：总览、特性、配置
- [architecture.md](architecture.md)：架构、窗口状态机、存储
- [api-design.md](api-design.md)：命令、事件、config schema
- [tech-stack.md](tech-stack.md)：依赖与技术选型
