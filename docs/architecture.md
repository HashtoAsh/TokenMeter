# TokenMeter 用量表 - 软件架构设计

## 1. 项目概述

TokenMeter 是一款轻量级悬浮窗桌面应用，用于实时监控各大模型 API 的 Token 用量。支持用户自定义添加和管理多个大模型服务（如 DeepSeek、MiMo 等），以悬浮窗形式展示用量统计，帮助开发者更好地控制 API 使用成本。

## 2. 核心需求

### 2.1 功能需求
- **实时监控**：悬浮窗实时显示当前 API 调用的 Token 用量
- **多模型支持**：支持自定义添加多个大模型服务（DeepSeek、MiMo、OpenAI 等）
- **用量统计**：按时间维度统计 Token 使用量（日/周/月）
- **成本计算**：根据各模型定价计算费用
- **悬浮窗显示**：桌面悬浮窗，可拖拽、可调整大小、半透明
- **系统托盘**：最小化到系统托盘，后台运行

### 2.2 非功能需求
- **轻量级**：内存占用小，启动快速
- **跨平台**：支持 Windows、macOS、Linux
- **低侵入**：不干扰用户正常工作
- **可扩展**：易于添加新的模型支持

## 3. 技术栈推荐

### 3.1 方案对比

| 技术栈 | 优点 | 缺点 | 推荐度 |
|--------|------|------|--------|
| **Tauri + React/Vue** | 轻量（~10MB）、性能好、跨平台 | 学习曲线较陡、Rust 环境配置 | ⭐⭐⭐⭐⭐ |
| **Electron + React/Vue** | 生态成熟、开发效率高 | 体积大（~150MB）、内存占用高 | ⭐⭐⭐ |
| **Python + PyQt** | 开发简单、轻量 | 跨平台打包复杂、界面不够现代 | ⭐⭐⭐ |
| **Flutter Desktop** | 性能好、UI 一致 | 生态相对年轻、桌面支持待完善 | ⭐⭐ |

### 3.2 推荐技术栈：Tauri + React + TypeScript

**前端层**
- **框架**：React 18 + TypeScript
- **UI 库**：Tailwind CSS + shadcn/ui（轻量、可定制）
- **状态管理**：Zustand（轻量级状态管理）
- **图表**：Recharts（轻量级图表库）

**后端层**
- **桌面框架**：Tauri 2.0
- **语言**：Rust（系统级性能）
- **HTTP 客户端**：reqwest（Rust HTTP 库）
- **数据存储**：SQLite（通过 rusqlite）

**开发工具**
- **构建工具**：Vite（前端构建）
- **包管理**：pnpm
- **代码规范**：ESLint + Prettier + Clippy

## 4. 系统架构

### 4.1 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户界面层 (UI Layer)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  悬浮窗组件  │  │  配置面板   │  │  统计图表   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    业务逻辑层 (Business Layer)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 模型管理器  │  │ 用量统计器 │  │ 成本计算器 │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    数据访问层 (Data Layer)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 数据库操作  │  │ 配置文件   │  │ API 调用   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    系统层 (System Layer)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 系统托盘    │  │ 窗口管理   │  │ 文件系统   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 核心模块设计

#### 4.2.1 模型管理模块 (ModelManager)
```typescript
interface ModelConfig {
  id: string;
  name: string;           // 模型名称，如 "DeepSeek V3"
  provider: string;       // 提供商，如 "DeepSeek"
  apiEndpoint: string;    // API 端点
  apiKey: string;         // API 密钥（加密存储）
  pricing: {
    inputTokenPrice: number;   // 输入 Token 价格（每 1K tokens）
    outputTokenPrice: number;  // 输出 Token 价格（每 1K tokens）
    currency: string;          // 货币单位
  };
  isActive: boolean;      // 是否启用监控
  createdAt: Date;
  updatedAt: Date;
}
```

#### 4.2.2 用量统计模块 (UsageTracker)
```typescript
interface UsageRecord {
  id: string;
  modelId: string;
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requestId: string;      // 请求标识
  metadata?: Record<string, any>;
}

interface UsageStats {
  modelId: string;
  period: 'day' | 'week' | 'month';
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
  averageTokensPerRequest: number;
}
```

#### 4.2.3 悬浮窗模块 (FloatingWindow)
- 窗口属性：半透明、可拖拽、可调整大小、置顶显示
- 显示内容：当前模型、今日用量、实时请求、费用统计
- 交互功能：点击展开详情、右键菜单、快捷键操作

#### 4.2.4 数据存储模块 (DataStorage)
```sql
-- 模型配置表
CREATE TABLE models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    api_endpoint TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    pricing_json TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用量记录表
CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cost REAL NOT NULL,
    request_id TEXT,
    metadata_json TEXT,
    FOREIGN KEY (model_id) REFERENCES models(id)
);

-- 索引
CREATE INDEX idx_usage_model_timestamp ON usage_records(model_id, timestamp);
CREATE INDEX idx_usage_timestamp ON usage_records(timestamp);
```

## 5. 数据流设计

### 5.1 API 调用拦截流程
```
用户应用 → 大模型 API 请求 → TokenMeter 拦截 → 记录用量 → 转发请求
                ↓
        响应返回 → 解析 Token 使用 → 更新统计 → 返回响应
```

### 5.2 悬浮窗更新流程
```
数据库变化 → 事件触发 → 状态更新 → UI 重绘 → 悬浮窗刷新
```

## 6. 目录结构

```
token-meter/
├── src-tauri/                 # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── main.rs           # 主入口
│   │   ├── lib.rs            # 库入口
│   │   ├── commands/         # Tauri 命令
│   │   ├── models/           # 数据模型
│   │   ├── services/         # 业务服务
│   │   ├── db/               # 数据库操作
│   │   └── utils/            # 工具函数
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                       # 前端源码 (React)
│   ├── components/           # React 组件
│   │   ├── FloatingWindow/   # 悬浮窗组件
│   │   ├── Settings/         # 设置面板
│   │   ├── Statistics/       # 统计图表
│   │   └── common/           # 通用组件
│   ├── hooks/                # 自定义 Hooks
│   ├── stores/               # Zustand 状态
│   ├── services/             # API 服务
│   ├── types/                # TypeScript 类型
│   └── utils/                # 工具函数
├── docs/                      # 项目文档
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## 7. 开发计划

### Phase 1：基础框架搭建（1周）
- [ ] 初始化 Tauri + React 项目
- [ ] 配置 TypeScript、Tailwind CSS、ESLint
- [ ] 实现基础悬浮窗功能
- [ ] 系统托盘集成

### Phase 2：核心功能开发（2周）
- [ ] 模型配置管理界面
- [ ] 数据库设计与实现
- [ ] API 调用拦截与记录
- [ ] 用量统计计算

### Phase 3：高级功能（1周）
- [ ] 统计图表展示
- [ ] 成本计算与预算告警
- [ ] 数据导出功能
- [ ] 快捷键支持

### Phase 4：优化与发布（1周）
- [ ] 性能优化
- [ ] 错误处理与日志
- [ ] 自动更新机制
- [ ] 打包与分发

## 8. 安全考虑

### 8.1 API 密钥安全
- 使用系统密钥链存储 API 密钥
- 传输过程中使用 HTTPS
- 内存中加密存储

### 8.2 数据隐私
- 所有数据本地存储，不上传云端
- 用户可随时删除数据
- 提供数据导出与备份功能

## 9. 性能指标

- **启动时间**：< 1秒
- **内存占用**：< 50MB
- **CPU 占用**：< 1%（空闲时）
- **窗口响应**：< 16ms（60fps）

## 10. 扩展性设计

### 10.1 插件系统（未来）
- 支持自定义数据源插件
- 支持自定义图表插件
- 支持第三方通知集成

### 10.2 模型适配器
```typescript
interface ModelAdapter {
  // 解析 API 响应中的 Token 使用信息
  parseUsage(response: any): UsageInfo;
  
  // 构建监控请求
  buildMonitorRequest(config: ModelConfig): Request;
  
  // 验证 API 连接
  validateConnection(config: ModelConfig): Promise<boolean>;
}
```

---

**文档版本**：v1.0  
**创建日期**：2026年9月6日  
**最后更新**：2026年9月6日