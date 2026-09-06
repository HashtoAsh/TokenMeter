# TokenMeter 技术栈详细说明

## 1. 技术栈选择理由

### 1.1 为什么选择 Tauri？

**轻量级优势**
- 打包体积：约 5-10MB（Electron 约 150MB）
- 内存占用：约 30-50MB（Electron 约 200-300MB）
- 启动速度：< 1秒

**性能优势**
- 使用 Rust 作为后端，系统级性能
- 前端使用系统 WebView，无需捆绑 Chromium
- 原生系统集成更好

**安全性**
- Rust 内存安全保证
- 更小的攻击面
- 权限控制更精细

### 1.2 为什么选择 React + TypeScript？

**React 优势**
- 组件化开发，易于维护
- 丰富的生态系统
- 虚拟 DOM 性能优化
- 学习资源丰富

**TypeScript 优势**
- 类型安全，减少运行时错误
- 更好的 IDE 支持
- 代码可维护性高
- 重构更安全

### 1.3 为什么选择 Tailwind CSS？

**开发效率**
- 原子化 CSS，快速构建 UI
- 无需编写自定义 CSS
- 响应式设计简单

**性能**
- 生产环境自动 purge 未使用的样式
- 生成的 CSS 体积小
- 无运行时开销

## 2. 核心依赖库

### 2.1 前端依赖

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "recharts": "^2.8.0",
    "date-fns": "^2.30.0",
    "uuid": "^9.0.0",
    "@tauri-apps/api": "^1.5.0"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "vite": "^4.5.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.50.0",
    "prettier": "^3.0.0"
  }
}
```

### 2.2 Tauri/Rust 依赖

```toml
[dependencies]
tauri = { version = "1.5", features = ["api-all", "system-tray"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rusqlite = { version = "0.31", features = ["bundled"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
tokio = { version = "1.0", features = ["full"] }
keyring = "2.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4", "serde"] }
log = "0.4"
env_logger = "0.10"
```

## 3. 开发环境配置

### 3.1 系统要求

**Windows**
- Windows 10/11 (64-bit)
- Microsoft Visual C++ Build Tools
- WebView2 Runtime (Windows 10 1803+)

**macOS**
- macOS 10.15+
- Xcode Command Line Tools

**Linux**
- Ubuntu 18.04+ / Debian 10+
- 需要安装webkit2gtk

### 3.2 开发工具

**必需工具**
```bash
# Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js (推荐 v18+)
# 使用 nvm 或 fnm 管理版本

# pnpm (包管理器)
npm install -g pnpm

# Tauri CLI
cargo install tauri-cli
```

**推荐 IDE**
- VS Code + 以下扩展：
  - rust-analyzer (Rust 语言支持)
  - Tauri (Tauri 开发支持)
  - ES7+ React/Redux/React-Native snippets
  - Tailwind CSS IntelliSense
  - ESLint
  - Prettier

## 4. 项目初始化

### 4.1 创建 Tauri 项目

```bash
# 使用 Tauri 脚手架
pnpm create tauri-app token-meter --template react-ts

# 进入项目目录
cd token-meter

# 安装依赖
pnpm install
```

### 4.2 配置 Tailwind CSS

```bash
# 安装 Tailwind CSS
pnpm add -D tailwindcss postcss autoprefixer

# 初始化配置
npx tailwindcss init -p
```

### 4.3 项目配置文件

**vite.config.ts**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

**tailwind.config.js**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
```

## 5. 核心模块实现指南

### 5.1 Tauri 窗口配置

**tauri.conf.json**
```json
{
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devPath": "http://localhost:1420",
    "distDir": "../dist"
  },
  "package": {
    "productName": "TokenMeter",
    "version": "0.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "window": {
        "all": true,
        "setAlwaysOnTop": true,
        "setDecorations": true,
        "setResizable": true,
        "setPosition": true,
        "setSize": true,
        "setSkipTaskbar": true
      },
      "shell": {
        "all": false,
        "execute": true,
        "sidecar": true,
        "open": true
      },
      "http": {
        "all": true,
        "request": true
      },
      "notification": {
        "all": true
      }
    },
    "windows": [
      {
        "label": "floating",
        "title": "TokenMeter",
        "width": 300,
        "height": 200,
        "resizable": true,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "x": 100,
        "y": 100
      },
      {
        "label": "settings",
        "title": "TokenMeter Settings",
        "width": 800,
        "height": 600,
        "resizable": true,
        "visible": false
      }
    ],
    "systemTray": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    },
    "security": {
      "csp": null
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.tokenmeter.app",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ]
    }
  }
}
```

### 5.2 系统托盘实现

```rust
// src-tauri/src/main.rs
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

fn create_system_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "显示悬浮窗");
    let hide = CustomMenuItem::new("hide".to_string(), "隐藏悬浮窗");
    let settings = CustomMenuItem::new("settings".to_string(), "设置");
    let quit = CustomMenuItem::new("quit".to_string(), "退出");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(settings)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

fn main() {
    tauri::Builder::default()
        .system_tray(create_system_tray())
        .on_system_tray_event(|app, event| {
            match event {
                SystemTrayEvent::MenuItemClick { id, .. } => {
                    match id.as_str() {
                        "show" => {
                            let window = app.get_window("floating").unwrap();
                            window.show().unwrap();
                        }
                        "hide" => {
                            let window = app.get_window("floating").unwrap();
                            window.hide().unwrap();
                        }
                        "settings" => {
                            let window = app.get_window("settings").unwrap();
                            window.show().unwrap();
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 5.3 SQLite 数据库初始化

```rust
// src-tauri/src/db/mod.rs
use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let app_dir = app_handle
            .path_resolver()
            .app_data_dir()
            .expect("failed to get app data dir");
        
        fs::create_dir_all(&app_dir).unwrap();
        let db_path = app_dir.join("tokenmeter.db");
        let conn = Connection::open(db_path)?;
        
        let db = Database { conn };
        db.initialize_tables()?;
        Ok(db)
    }

    fn initialize_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS models (
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

            CREATE TABLE IF NOT EXISTS usage_records (
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

            CREATE INDEX IF NOT EXISTS idx_usage_model_timestamp 
            ON usage_records(model_id, timestamp);
            
            CREATE INDEX IF NOT EXISTS idx_usage_timestamp 
            ON usage_records(timestamp);
            "
        )?;
        Ok(())
    }
}
```

## 6. 前端组件架构

### 6.1 Zustand 状态管理

```typescript
// src/stores/modelStore.ts
import { create } from 'zustand';
import { ModelConfig } from '../types';

interface ModelState {
  models: ModelConfig[];
  activeModelId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchModels: () => Promise<void>;
  addModel: (model: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateModel: (id: string, updates: Partial<ModelConfig>) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  setActiveModel: (id: string | null) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  activeModelId: null,
  isLoading: false,
  error: null,

  fetchModels: async () => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const models = await invoke<ModelConfig[]>('get_models');
      set({ models, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  addModel: async (modelData) => {
    set({ isLoading: true, error: null });
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const newModel = await invoke<ModelConfig>('add_model', { model: modelData });
      set(state => ({ 
        models: [...state.models, newModel], 
        isLoading: false 
      }));
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  // ... 其他方法
}));
```

### 6.2 悬浮窗组件

```tsx
// src/components/FloatingWindow/index.tsx
import React from 'react';
import { useUsageStore } from '../../stores/usageStore';
import { useModelStore } from '../../stores/modelStore';

export const FloatingWindow: React.FC = () => {
  const { activeModelId } = useModelStore();
  const { currentUsage, dailyStats } = useUsageStore();

  return (
    <div className="w-full h-full bg-white/80 backdrop-blur-md rounded-lg shadow-lg p-4 
                    border border-gray-200 drag-region">
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-700">TokenMeter</h3>
        <div className="flex gap-1">
          <button className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500" />
          <button className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500" />
          <button className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500" />
        </div>
      </div>

      {/* 模型信息 */}
      <div className="mb-3">
        <div className="text-xs text-gray-500">当前模型</div>
        <div className="text-sm font-medium text-gray-800">
          {activeModelId ? 'DeepSeek V3' : '未选择模型'}
        </div>
      </div>

      {/* 实时用量 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 p-2 rounded">
          <div className="text-xs text-blue-600">输入 Tokens</div>
          <div className="text-lg font-bold text-blue-700">
            {currentUsage?.inputTokens?.toLocaleString() || '0'}
          </div>
        </div>
        <div className="bg-green-50 p-2 rounded">
          <div className="text-xs text-green-600">输出 Tokens</div>
          <div className="text-lg font-bold text-green-700">
            {currentUsage?.outputTokens?.toLocaleString() || '0'}
          </div>
        </div>
      </div>

      {/* 今日统计 */}
      <div className="bg-gray-50 p-2 rounded">
        <div className="text-xs text-gray-500 mb-1">今日统计</div>
        <div className="flex justify-between text-sm">
          <span>总请求: {dailyStats?.requestCount || 0}</span>
          <span className="font-medium text-purple-600">
            费用: ¥{dailyStats?.totalCost?.toFixed(2) || '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
};
```

## 7. 构建与部署

### 7.1 开发模式

```bash
# 启动开发服务器
pnpm tauri dev

# 仅前端开发
pnpm dev

# 仅 Rust 后端开发
cd src-tauri && cargo run
```

### 7.2 生产构建

```bash
# 构建生产版本
pnpm tauri build

# 构建特定平台
pnpm tauri build --target x86_64-pc-windows-msvc  # Windows
pnpm tauri build --target x86_64-apple-darwin      # macOS
pnpm tauri build --target x86_64-unknown-linux-gnu  # Linux
```

### 7.3 自动更新配置

```json
// tauri.conf.json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://releases.tokenmeter.app/{{target}}/{{current_version}}"
      ],
      "dialog": true,
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEUyNjQ2OUM3RkI0NjBFOEEKUldTTDJkWHZ3WHFoQjdIcWZ6YnN5K2hOZkwyZ0d2U0d6YkY2Tm5LcEd6R3p6YnM9Cg=="
    }
  }
}
```

## 8. 性能优化建议

### 8.1 前端优化
- 使用 React.memo 避免不必要的重渲染
- 使用 useMemo 和 useCallback 优化计算和回调
- 虚拟滚动处理大量数据列表
- 图表数据采样，避免渲染过多数据点

### 8.2 后端优化
- 使用连接池管理数据库连接
- 批量插入优化大量数据写入
- 异步处理非关键路径操作
- 定期清理过期数据

### 8.3 内存管理
- 及时清理事件监听器
- 避免内存泄漏（定时器、订阅等）
- 大数据分页加载
- 图片和资源懒加载

---

**文档版本**：v1.0  
**创建日期**：2026年9月6日  
**最后更新**：2026年9月6日