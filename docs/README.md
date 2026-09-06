# TokenMeter 文档

## 文档列表

| 文档 | 内容 |
|------|------|
| [architecture.md](architecture.md) | 软件架构设计 |
| [tech-stack.md](tech-stack.md) | 技术栈说明 |
| [api-design.md](api-design.md) | API 设计 |
| [quick-start.md](quick-start.md) | 快速开始 |

## 技术栈

- **桌面框架**：Tauri 2.0
- **前端**：React + TypeScript + Tailwind CSS
- **状态管理**：Zustand
- **后端**：Rust
- **存储**：JSON 配置文件（无数据库）

## 核心功能

1. 贴边悬浮条 → 鼠标Hover展开简单信息 → 点击展开详情
2. 自定义添加大模型（支持预设模板）
3. 5分钟轮询API获取用量
4. 今日Token用量统计和费用计算
