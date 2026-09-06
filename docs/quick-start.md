# TokenMeter 快速开始指南

## 🎯 5 分钟快速上手

本指南帮助您快速启动 TokenMeter 项目并开始开发。

## 📋 前置条件检查

### Windows 用户

```powershell
# 检查 Rust 是否安装
rustc --version
cargo --version

# 检查 Node.js 是否安装
node --version
npm --version

# 检查 pnpm 是否安装
pnpm --version

# 检查 Visual C++ Build Tools
# 如果没有安装，请从以下链接下载：
# https://visualstudio.microsoft.com/visual-cpp-build-tools/

# 检查 WebView2 Runtime
# Windows 10 1803+ 通常已预装
```

### macOS 用户

```bash
# 检查 Xcode Command Line Tools
xcode-select --install

# 检查 Rust
rustc --version

# 检查 Node.js
node --version

# 安装 pnpm
npm install -g pnpm
```

### Linux 用户

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
npm install -g pnpm
```

## 🚀 项目初始化

### 1. 克隆项目

```bash
# 如果还没有项目目录
git clone https://github.com/yourusername/token-meter.git
cd token-meter

# 或者如果已经在项目目录中
cd "D:\CODE PROG\TokenMeter用量表"
```

### 2. 安装依赖

```bash
# 安装前端依赖
pnpm install

# 安装 Tauri CLI (如果还没有安装)
cargo install tauri-cli
```

### 3. 启动开发服务器

```bash
# 方式 1: 启动完整开发环境（推荐）
pnpm tauri dev

# 方式 2: 分步启动
# 终端 1: 启动前端开发服务器
pnpm dev

# 终端 2: 启动 Rust 后端
cd src-tauri
cargo run
```

### 4. 查看应用

- 应用启动后会显示悬浮窗
- 系统托盘会出现 TokenMeter 图标
- 右键托盘图标可以访问设置

## 📝 基本配置

### 1. 添加第一个模型

1. 右键系统托盘图标 → 选择"设置"
2. 点击"添加模型"
3. 填写模型信息：

```
模型名称: DeepSeek V3
提供商: DeepSeek
API 端点: https://api.deepseek.com
API 密钥: sk-your-api-key-here
```

4. 配置定价信息：

```
输入 Token 价格: 0.001 (每 1K tokens)
输出 Token 价格: 0.002 (每 1K tokens)
货币: CNY
```

5. 点击"测试连接"验证配置
6. 保存配置

### 2. 调整悬浮窗

- **拖拽**：按住标题栏拖动
- **调整大小**：拖动窗口边缘
- **透明度**：在设置中调整
- **置顶**：默认开启，可在设置中关闭

### 3. 设置快捷键

默认快捷键：
- `Ctrl/Cmd + Shift + T`：显示/隐藏悬浮窗
- `Ctrl/Cmd + Shift + S`：打开设置
- `Ctrl/Cmd + Shift + Q`：退出应用

可以在设置中自定义快捷键。

## 🔧 开发环境配置

### IDE 设置 (VS Code)

1. 安装推荐扩展：

```bash
# 打开 VS Code 扩展面板
code --install-extension rust-lang.rust-analyzer
code --install-extension tauri-apps.tauri-vscode
code --install-extension dsznajder.es7-react-js-snippets
code --install-extension bradlc.vscode-tailwindcss
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
```

2. 配置 VS Code 设置：

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "rust-analyzer.check.command": "clippy",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### 代码规范

```bash
# 检查代码规范
pnpm lint

# 自动修复
pnpm lint:fix

# 格式化代码
pnpm format

# 类型检查
pnpm type-check
```

## 📊 使用示例

### 查看实时用量

悬浮窗会实时显示：
- 当前模型名称
- 输入/输出 Token 数量
- 今日总请求数
- 今日总费用

### 查看统计图表

1. 右键托盘图标 → 选择"统计"
2. 选择时间范围（日/周/月）
3. 查看用量趋势图
4. 查看费用分布图

### 导出数据

1. 打开设置面板
2. 选择"数据管理"
3. 选择导出格式（JSON/CSV）
4. 选择导出路径
5. 点击"导出"

## 🐛 常见问题

### Q: 应用无法启动

**A: 检查以下几点：**
1. 确保 WebView2 Runtime 已安装（Windows）
2. 确保 Rust 工具链是最新的：`rustup update`
3. 清理并重新安装依赖：`rm -rf node_modules && pnpm install`

### Q: 悬浮窗不显示

**A: 尝试以下解决方案：**
1. 检查系统托盘是否有图标
2. 右键托盘图标 → 选择"显示悬浮窗"
3. 检查窗口是否在屏幕外（可能需要重置位置）

### Q: API 连接失败

**A: 检查以下配置：**
1. API 密钥是否正确
2. API 端点是否可访问
3. 网络连接是否正常
4. 查看日志文件获取详细错误信息

### Q: 用量数据不准确

**A: 可能的原因：**
1. 模型适配器配置错误
2. API 响应格式不匹配
3. 需要更新适配器代码

## 📚 下一步

- 阅读 [架构设计文档](architecture.md) 了解系统设计
- 查看 [技术栈说明](tech-stack.md) 了解技术细节
- 参考 [API 设计文档](api-design.md) 了解接口设计
- 查看 [项目结构说明](project-structure.md) 了解代码组织

## 🆘 获取帮助

- 查看 [README.md](../README.md) 获取项目概述
- 提交 [GitHub Issues](https://github.com/yourusername/token-meter/issues) 报告问题
- 参与 [GitHub Discussions](https://github.com/yourusername/token-meter/discussions) 讨论

---

**祝您开发愉快！** 🚀

如有问题，请随时提 Issue 或联系维护者。