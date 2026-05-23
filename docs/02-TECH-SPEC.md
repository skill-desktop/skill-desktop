# Skill Desktop 技术方案文档

> 版本: 1.0.0
> 更新日期: 2025-01-24
> 状态: 草案

---

## 1. 技术栈选型

### 1.1 整体架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Skill Desktop                                 │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      Frontend (React + TypeScript)                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │   shadcn/ui │  │  Tailwind   │  │  React Query│               │  │
│  │  │  Components │  │    CSS      │  │   State     │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ▲                                          │
│                              │ Tauri IPC                               │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       Backend (Rust)                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │   Scanner   │  │   Space     │  │   Network   │               │  │
│  │  │   Module    │  │   Manager   │  │   Module    │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  │                              │                                    │  │
│  │                              ▼                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐│  │
│  │  │                   SQLite (tauri-plugin-sql)                  ││  │
│  │  └──────────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    File System                                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │   Library   │  │   Spaces    │  │   Config    │               │  │
│  │  │   Directory │  │  (Symlinks) │  │   Files     │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型明细

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **桌面框架** | Tauri | 2.x | 极轻量(~10MB)，原生 Rust 支持，安全沙箱 |
| **前端框架** | React | 18.x | 生态成熟，开发效率高 |
| **前端语言** | TypeScript | 5.x | 类型安全，IDE 支持好 |
| **UI 组件库** | shadcn/ui | latest | 可定制性强，开发者工具风格 |
| **CSS 框架** | Tailwind CSS | 3.x | 原子化 CSS，快速开发 |
| **状态管理** | React Query + Zustand | 5.x / 4.x | 服务端状态 + 客户端状态分离 |
| **后端语言** | Rust | 1.75+ | 性能优异，内存安全 |
| **数据库** | SQLite | - | 零配置，单文件，适合桌面端 |
| **文件监控** | notify | 6.x | Rust 生态主流文件监控库 |
| **HTTP 客户端** | reqwest | 0.11+ | 异步，功能完整 |
| **YAML 解析** | serde_yaml | 0.9+ | Rust 标准 YAML 解析 |
| **Markdown 解析** | pulldown-cmark | 0.9+ | 高性能 Markdown 解析 |

---

## 2. 项目结构

### 2.1 目录结构

```
skill-desktop/
├── docs/                          # 文档
│   ├── 01-PRD.md                  # 产品需求文档
│   ├── 02-TECH-SPEC.md            # 技术方案文档
│   └── 03-UI-DESIGN.md            # UI 设计文档
├── src/                           # 前端源码
│   ├── components/                # React 组件
│   │   ├── ui/                    # shadcn/ui 基础组件
│   │   ├── layout/                # 布局组件
│   │   │   ├── Sidebar.tsx        # 侧边栏
│   │   │   ├── Header.tsx         # 顶栏
│   │   │   └── MainLayout.tsx     # 主布局
│   │   ├── library/               # Library 相关组件
│   │   │   ├── SkillList.tsx      # 技能列表
│   │   │   ├── SkillCard.tsx      # 技能卡片
│   │   │   ├── SkillDetail.tsx    # 技能详情
│   │   │   └── SkillSearch.tsx    # 搜索框
│   │   ├── space/                 # Space 相关组件
│   │   │   ├── SpaceList.tsx      # 空间列表
│   │   │   ├── SpaceEditor.tsx    # 空间编辑器
│   │   │   └── VisibilityToggle.tsx # 可见性开关
│   │   ├── hub/                   # Skill Hub 相关组件
│   │   │   ├── ImportDialog.tsx   # 导入对话框
│   │   │   └── PreviewPanel.tsx   # 预览面板
│   │   └── sandbox/               # 调试沙箱组件
│   │       ├── ParamInput.tsx     # 参数输入
│   │       └── OutputViewer.tsx   # 输出查看器
│   ├── hooks/                     # 自定义 Hooks
│   │   ├── useSkills.ts           # 技能数据 Hook
│   │   ├── useSpaces.ts           # 空间数据 Hook
│   │   └── useTauri.ts            # Tauri 命令封装
│   ├── stores/                    # Zustand 状态管理
│   │   ├── appStore.ts            # 应用全局状态
│   │   └── settingsStore.ts       # 设置状态
│   ├── lib/                       # 工具函数
│   │   ├── utils.ts               # 通用工具
│   │   └── tauri.ts               # Tauri API 封装
│   ├── types/                     # TypeScript 类型定义
│   │   ├── skill.ts               # Skill 相关类型
│   │   └── space.ts               # Space 相关类型
│   ├── App.tsx                    # 应用入口
│   ├── main.tsx                   # React 入口
│   └── index.css                  # 全局样式
├── src-tauri/                     # Tauri 后端源码
│   ├── src/
│   │   ├── main.rs                # Rust 入口
│   │   ├── lib.rs                 # 库入口
│   │   ├── commands/              # Tauri 命令
│   │   │   ├── mod.rs             # 命令模块
│   │   │   ├── skill.rs           # Skill 相关命令
│   │   │   ├── space.rs           # Space 相关命令
│   │   │   └── network.rs         # 网络相关命令
│   │   ├── scanner/               # 文件扫描模块
│   │   │   ├── mod.rs
│   │   │   ├── watcher.rs         # 文件监控
│   │   │   └── parser.rs          # 元数据解析
│   │   ├── database/              # 数据库模块
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs          # 表结构定义
│   │   │   └── queries.rs         # 查询函数
│   │   ├── space/                 # 空间管理模块
│   │   │   ├── mod.rs
│   │   │   └── symlink.rs         # 软链接管理
│   │   └── utils/                 # 工具函数
│   │       ├── mod.rs
│   │       └── hash.rs            # 哈希计算
│   ├── Cargo.toml                 # Rust 依赖配置
│   ├── tauri.conf.json            # Tauri 配置
│   └── capabilities/              # Tauri 权限配置
│       └── default.json           # 默认权限
├── package.json                   # Node 依赖配置
├── pnpm-lock.yaml                 # 锁定文件
├── tsconfig.json                  # TypeScript 配置
├── vite.config.ts                 # Vite 配置
├── tailwind.config.js             # Tailwind 配置
└── components.json                # shadcn/ui 配置
```

---

## 3. 核心模块设计

### 3.1 文件扫描器 (Scanner)

#### 3.1.1 功能概述

负责监控 Library 目录，检测文件变更，解析 Skill 元数据。

#### 3.1.2 核心流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  File       │────▶│  Calculate  │────▶│  Parse      │
│  Changed    │     │  SHA-256    │     │  Metadata   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Check      │     │  Update     │
                    │  Cache      │────▶│  SQLite     │
                    └─────────────┘     └─────────────┘
```

#### 3.1.3 Rust 实现

```rust
// src-tauri/src/scanner/mod.rs

use notify::{Watcher, RecursiveMode, Event};
use std::path::PathBuf;
use tokio::sync::mpsc;

pub struct SkillScanner {
    library_path: PathBuf,
    db: SqlitePool,
    watcher: notify::RecommendedWatcher,
}

impl SkillScanner {
    pub fn new(library_path: PathBuf, db: SqlitePool) -> Self {
        // 初始化文件监控
    }

    pub async fn start(&mut self) -> Result<(), ScannerError> {
        // 1. 初始扫描
        self.full_scan().await?;

        // 2. 启动监控
        self.watch().await
    }

    async fn full_scan(&self) -> Result<(), ScannerError> {
        // 递归扫描目录
        for entry in walkdir::WalkDir::new(&self.library_path) {
            if let Ok(entry) = entry {
                if self.is_skill_file(&entry.path()) {
                    self.process_file(entry.path()).await?;
                }
            }
        }
        Ok(())
    }

    async fn process_file(&self, path: &Path) -> Result<(), ScannerError> {
        // 1. 计算文件哈希
        let hash = self.calculate_hash(path)?;

        // 2. 检查缓存
        if self.is_cached(&hash).await? {
            return Ok(());
        }

        // 3. 解析元数据
        let metadata = self.parse_metadata(path)?;

        // 4. 更新数据库
        self.update_db(&hash, &metadata).await
    }

    fn is_skill_file(&self, path: &Path) -> bool {
        path.extension()
            .map(|ext| ext == "md" || ext == "json")
            .unwrap_or(false)
    }
}
```

#### 3.1.4 元数据解析

```rust
// src-tauri/src/scanner/parser.rs

use serde::{Deserialize, Serialize};
use pulldown_cmark::{Parser, Event, Tag};

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillMetadata {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub permissions: Vec<String>,
    pub parameters: Vec<ParameterDef>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParameterDef {
    pub name: String,
    pub r#type: String,
    pub required: bool,
    pub description: String,
}

pub fn parse_skill_file(content: &str) -> Result<SkillMetadata, ParseError> {
    // 1. 提取 YAML Front Matter
    let front_matter = extract_front_matter(content)?;

    // 2. 解析 YAML
    let metadata: SkillMetadata = serde_yaml::from_str(&front_matter)?;

    Ok(metadata)
}

fn extract_front_matter(content: &str) -> Result<String, ParseError> {
    let lines: Vec<&str> = content.lines().collect();

    if lines.first() != Some(&"---") {
        return Err(ParseError::NoFrontMatter);
    }

    let end_idx = lines.iter()
        .skip(1)
        .position(|&line| line == "---")
        .ok_or(ParseError::InvalidFrontMatter)?;

    Ok(lines[1..=end_idx].join("\n"))
}
```

---

### 3.2 空间管理器 (Space Manager)

#### 3.2.1 功能概述

管理工作空间，控制 Skill 可见性，维护软链接。

#### 3.2.2 软链接逻辑

```
Library Directory                Space Active Directory
├── skill-a.md          ───▶     ├── skill-a.md (symlink)
├── skill-b.md          ───▶     ├── skill-b.md (symlink)
├── skill-c.md                   └── (skill-c 未勾选，无链接)
└── skill-d.md          ───▶         skill-d.md (symlink)
```

#### 3.2.3 Rust 实现

```rust
// src-tauri/src/space/symlink.rs

use std::fs;
use std::path::{Path, PathBuf};

#[cfg(unix)]
use std::os::unix::fs::symlink;

#[cfg(windows)]
use std::os::windows::fs::symlink_file;

pub struct SymlinkManager {
    library_path: PathBuf,
}

impl SymlinkManager {
    pub fn new(library_path: PathBuf) -> Self {
        Self { library_path }
    }

    /// 同步空间的软链接
    pub fn sync_space_links(
        &self,
        active_path: &Path,
        enabled_skills: &[String],
    ) -> Result<SyncResult, SymlinkError> {
        // 1. 清理旧链接
        self.clean_old_links(active_path)?;

        // 2. 创建新链接
        let mut created = 0;
        let mut failed = Vec::new();

        for skill_file in enabled_skills {
            let src = self.library_path.join(skill_file);
            let dst = active_path.join(skill_file);

            match self.create_symlink(&src, &dst) {
                Ok(_) => created += 1,
                Err(e) => failed.push((skill_file.clone(), e.to_string())),
            }
        }

        Ok(SyncResult { created, failed })
    }

    fn clean_old_links(&self, dir: &Path) -> Result<(), SymlinkError> {
        if !dir.exists() {
            fs::create_dir_all(dir)?;
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            // 只删除软链接
            if path.is_symlink() {
                fs::remove_file(&path)?;
            }
        }

        Ok(())
    }

    #[cfg(unix)]
    fn create_symlink(&self, src: &Path, dst: &Path) -> Result<(), SymlinkError> {
        // 确保父目录存在
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }

        symlink(src, dst)?;
        Ok(())
    }

    #[cfg(windows)]
    fn create_symlink(&self, src: &Path, dst: &Path) -> Result<(), SymlinkError> {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }

        symlink_file(src, dst)?;
        Ok(())
    }
}

#[derive(Debug)]
pub struct SyncResult {
    pub created: usize,
    pub failed: Vec<(String, String)>,
}
```

---

### 3.3 数据库设计

#### 3.3.1 表结构

```sql
-- 数据库初始化脚本
-- src-tauri/src/database/schema.sql

-- Skill 表：存储所有技能的元数据
CREATE TABLE IF NOT EXISTS skills (
    hash TEXT PRIMARY KEY,                    -- SHA-256 哈希
    filename TEXT NOT NULL,                   -- 文件名
    local_path TEXT NOT NULL,                 -- 本地完整路径
    source_url TEXT,                          -- 来源 URL（网络下载时）
    name TEXT NOT NULL,                       -- 技能名称
    version TEXT NOT NULL DEFAULT '1.0.0',    -- 版本号
    description TEXT,                         -- 描述
    author TEXT,                              -- 作者
    tags TEXT,                                -- 标签（JSON 数组）
    permissions TEXT,                         -- 权限（JSON 数组）
    parameters TEXT,                          -- 参数定义（JSON）
    is_downloaded BOOLEAN DEFAULT FALSE,      -- 是否从网络下载
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 文件名索引，加速搜索
CREATE INDEX IF NOT EXISTS idx_skills_filename ON skills(filename);

-- 名称索引
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);


-- Space 表：存储工作空间配置
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,                      -- 空间 ID (UUID)
    name TEXT NOT NULL UNIQUE,                -- 空间名称
    active_dir_path TEXT NOT NULL,            -- Active 目录路径
    description TEXT,                         -- 描述
    is_default BOOLEAN DEFAULT FALSE,         -- 是否为默认空间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Space-Skill 关联表：记录空间与技能的可见性关系
CREATE TABLE IF NOT EXISTS space_skill_mapping (
    space_id TEXT NOT NULL,                   -- 空间 ID
    skill_hash TEXT NOT NULL,                 -- 技能哈希
    is_visible BOOLEAN DEFAULT TRUE,          -- 是否可见
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (space_id, skill_hash),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_hash) REFERENCES skills(hash) ON DELETE CASCADE
);

-- 空间 ID 索引
CREATE INDEX IF NOT EXISTS idx_mapping_space ON space_skill_mapping(space_id);


-- 设置表：存储应用配置
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('library_path', ''),
    ('theme', 'system'),
    ('auto_sync', 'true');
```

#### 3.3.2 Rust 数据库操作

```rust
// src-tauri/src/database/queries.rs

use sqlx::{SqlitePool, Row};
use crate::types::{Skill, Space, SpaceSkillMapping};

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(db_path: &str) -> Result<Self, sqlx::Error> {
        let pool = SqlitePool::connect(&format!("sqlite:{}", db_path)).await?;

        // 运行迁移
        sqlx::migrate!("./migrations").run(&pool).await?;

        Ok(Self { pool })
    }

    // ========== Skill 操作 ==========

    pub async fn upsert_skill(&self, skill: &Skill) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            INSERT INTO skills (hash, filename, local_path, source_url, name, version,
                               description, author, tags, permissions, parameters, is_downloaded)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(hash) DO UPDATE SET
                filename = excluded.filename,
                local_path = excluded.local_path,
                name = excluded.name,
                version = excluded.version,
                description = excluded.description,
                author = excluded.author,
                tags = excluded.tags,
                permissions = excluded.permissions,
                parameters = excluded.parameters,
                updated_at = CURRENT_TIMESTAMP
        "#)
        .bind(&skill.hash)
        .bind(&skill.filename)
        .bind(&skill.local_path)
        .bind(&skill.source_url)
        .bind(&skill.name)
        .bind(&skill.version)
        .bind(&skill.description)
        .bind(&skill.author)
        .bind(serde_json::to_string(&skill.tags).unwrap())
        .bind(serde_json::to_string(&skill.permissions).unwrap())
        .bind(serde_json::to_string(&skill.parameters).unwrap())
        .bind(skill.is_downloaded)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_all_skills(&self) -> Result<Vec<Skill>, sqlx::Error> {
        let rows = sqlx::query("SELECT * FROM skills ORDER BY name")
            .fetch_all(&self.pool)
            .await?;

        let skills = rows.iter()
            .map(|row| Skill::from_row(row))
            .collect();

        Ok(skills)
    }

    pub async fn search_skills(&self, query: &str) -> Result<Vec<Skill>, sqlx::Error> {
        let pattern = format!("%{}%", query);

        let rows = sqlx::query(r#"
            SELECT * FROM skills
            WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?
            ORDER BY name
        "#)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .fetch_all(&self.pool)
        .await?;

        let skills = rows.iter()
            .map(|row| Skill::from_row(row))
            .collect();

        Ok(skills)
    }

    pub async fn delete_skill(&self, hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM skills WHERE hash = ?")
            .bind(hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ========== Space 操作 ==========

    pub async fn create_space(&self, space: &Space) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            INSERT INTO spaces (id, name, active_dir_path, description)
            VALUES (?, ?, ?, ?)
        "#)
        .bind(&space.id)
        .bind(&space.name)
        .bind(&space.active_dir_path)
        .bind(&space.description)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_all_spaces(&self) -> Result<Vec<Space>, sqlx::Error> {
        let rows = sqlx::query("SELECT * FROM spaces ORDER BY name")
            .fetch_all(&self.pool)
            .await?;

        let spaces = rows.iter()
            .map(|row| Space::from_row(row))
            .collect();

        Ok(spaces)
    }

    // ========== 可见性操作 ==========

    pub async fn set_skill_visibility(
        &self,
        space_id: &str,
        skill_hash: &str,
        is_visible: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            INSERT INTO space_skill_mapping (space_id, skill_hash, is_visible)
            VALUES (?, ?, ?)
            ON CONFLICT(space_id, skill_hash) DO UPDATE SET
                is_visible = excluded.is_visible
        "#)
        .bind(space_id)
        .bind(skill_hash)
        .bind(is_visible)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_visible_skills(&self, space_id: &str) -> Result<Vec<Skill>, sqlx::Error> {
        let rows = sqlx::query(r#"
            SELECT s.* FROM skills s
            INNER JOIN space_skill_mapping m ON s.hash = m.skill_hash
            WHERE m.space_id = ? AND m.is_visible = TRUE
            ORDER BY s.name
        "#)
        .bind(space_id)
        .fetch_all(&self.pool)
        .await?;

        let skills = rows.iter()
            .map(|row| Skill::from_row(row))
            .collect();

        Ok(skills)
    }
}
```

---

### 3.4 Tauri 命令接口

#### 3.4.1 命令定义

```rust
// src-tauri/src/commands/skill.rs

use tauri::State;
use crate::database::Database;
use crate::scanner::SkillScanner;
use crate::types::Skill;

#[tauri::command]
pub async fn get_all_skills(db: State<'_, Database>) -> Result<Vec<Skill>, String> {
    db.get_all_skills()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_skills(
    query: String,
    db: State<'_, Database>,
) -> Result<Vec<Skill>, String> {
    db.search_skills(&query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_skill_content(hash: String, db: State<'_, Database>) -> Result<String, String> {
    let skill = db.get_skill_by_hash(&hash)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Skill not found")?;

    std::fs::read_to_string(&skill.local_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rescan_library(scanner: State<'_, SkillScanner>) -> Result<usize, String> {
    scanner.full_scan()
        .await
        .map_err(|e| e.to_string())
}
```

```rust
// src-tauri/src/commands/space.rs

use tauri::State;
use crate::database::Database;
use crate::space::SymlinkManager;
use crate::types::Space;

#[tauri::command]
pub async fn get_all_spaces(db: State<'_, Database>) -> Result<Vec<Space>, String> {
    db.get_all_spaces()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_space(
    name: String,
    active_dir: String,
    db: State<'_, Database>,
) -> Result<Space, String> {
    let space = Space {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        active_dir_path: active_dir,
        description: None,
        is_default: false,
    };

    db.create_space(&space)
        .await
        .map_err(|e| e.to_string())?;

    Ok(space)
}

#[tauri::command]
pub async fn set_skill_visibility(
    space_id: String,
    skill_hash: String,
    is_visible: bool,
    db: State<'_, Database>,
    symlink_mgr: State<'_, SymlinkManager>,
) -> Result<(), String> {
    // 1. 更新数据库
    db.set_skill_visibility(&space_id, &skill_hash, is_visible)
        .await
        .map_err(|e| e.to_string())?;

    // 2. 同步软链接
    let space = db.get_space(&space_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Space not found")?;

    let visible_skills = db.get_visible_skills(&space_id)
        .await
        .map_err(|e| e.to_string())?;

    let skill_files: Vec<String> = visible_skills
        .iter()
        .map(|s| s.filename.clone())
        .collect();

    symlink_mgr.sync_space_links(
        std::path::Path::new(&space.active_dir_path),
        &skill_files,
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn sync_space_links(
    space_id: String,
    db: State<'_, Database>,
    symlink_mgr: State<'_, SymlinkManager>,
) -> Result<SyncResult, String> {
    let space = db.get_space(&space_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Space not found")?;

    let visible_skills = db.get_visible_skills(&space_id)
        .await
        .map_err(|e| e.to_string())?;

    let skill_files: Vec<String> = visible_skills
        .iter()
        .map(|s| s.filename.clone())
        .collect();

    symlink_mgr.sync_space_links(
        std::path::Path::new(&space.active_dir_path),
        &skill_files,
    ).map_err(|e| e.to_string())
}
```

---

## 4. 前端架构

### 4.1 状态管理

```typescript
// src/stores/appStore.ts

import { create } from 'zustand';
import { Skill, Space } from '@/types';

interface AppState {
  // 当前选中的空间
  currentSpaceId: string | null;
  setCurrentSpaceId: (id: string | null) => void;

  // 当前选中的技能
  selectedSkillHash: string | null;
  setSelectedSkillHash: (hash: string | null) => void;

  // 搜索关键词
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // 侧边栏状态
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentSpaceId: null,
  setCurrentSpaceId: (id) => set({ currentSpaceId: id }),

  selectedSkillHash: null,
  setSelectedSkillHash: (hash) => set({ selectedSkillHash: hash }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
```

### 4.2 Tauri 命令封装

```typescript
// src/hooks/useTauri.ts

import { invoke } from '@tauri-apps/api/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Skill, Space } from '@/types';

// ========== Skill Hooks ==========

export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      return await invoke<Skill[]>('get_all_skills');
    },
  });
}

export function useSearchSkills(query: string) {
  return useQuery({
    queryKey: ['skills', 'search', query],
    queryFn: async () => {
      if (!query) return [];
      return await invoke<Skill[]>('search_skills', { query });
    },
    enabled: query.length > 0,
  });
}

export function useSkillContent(hash: string | null) {
  return useQuery({
    queryKey: ['skill-content', hash],
    queryFn: async () => {
      if (!hash) return null;
      return await invoke<string>('get_skill_content', { hash });
    },
    enabled: !!hash,
  });
}

export function useRescanLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await invoke<number>('rescan_library');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

// ========== Space Hooks ==========

export function useSpaces() {
  return useQuery({
    queryKey: ['spaces'],
    queryFn: async () => {
      return await invoke<Space[]>('get_all_spaces');
    },
  });
}

export function useCreateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, activeDir }: { name: string; activeDir: string }) => {
      return await invoke<Space>('create_space', { name, activeDir });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

export function useSetSkillVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spaceId,
      skillHash,
      isVisible
    }: {
      spaceId: string;
      skillHash: string;
      isVisible: boolean;
    }) => {
      return await invoke('set_skill_visibility', { spaceId, skillHash, isVisible });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['spaces', variables.spaceId, 'skills'] });
    },
  });
}
```

### 4.3 类型定义

```typescript
// src/types/skill.ts

export interface Skill {
  hash: string;
  filename: string;
  localPath: string;
  sourceUrl?: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tags: string[];
  permissions: string[];
  parameters: Parameter[];
  isDownloaded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Parameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
}

export type PermissionLevel = 'low' | 'medium' | 'high';

export const PERMISSION_LEVELS: Record<string, PermissionLevel> = {
  file_read: 'low',
  system_info: 'low',
  file_write: 'medium',
  network: 'medium',
  shell_exec: 'high',
};
```

```typescript
// src/types/space.ts

export interface Space {
  id: string;
  name: string;
  activeDirPath: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceSkillMapping {
  spaceId: string;
  skillHash: string;
  isVisible: boolean;
  addedAt: string;
}
```

---

## 5. 配置文件

### 5.1 Tauri 配置

```json
// src-tauri/tauri.conf.json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Skill Desktop",
  "version": "0.1.0",
  "identifier": "com.skill-desktop.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Skill Desktop",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "sql": {
      "preload": ["sqlite:skill_desktop.db"]
    },
    "fs": {
      "scope": ["$APP/*", "$HOME/*"]
    },
    "dialog": {
      "all": true
    },
    "shell": {
      "open": true
    }
  }
}
```

### 5.2 Tauri 权限配置

```json
// src-tauri/capabilities/default.json
{
  "$schema": "https://schema.tauri.app/config/2/capabilities",
  "identifier": "default",
  "description": "Default capabilities for Skill Desktop",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-execute",
    "sql:allow-select",
    "fs:default",
    "fs:allow-read",
    "fs:allow-write",
    "fs:allow-exists",
    "fs:allow-mkdir",
    "fs:allow-remove",
    "fs:allow-rename",
    "fs:allow-copy-file",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "shell:allow-open",
    "path:default"
  ]
}
```

### 5.3 Cargo 依赖

```toml
# src-tauri/Cargo.toml
[package]
name = "skill-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "skill_desktop_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_yaml = "0.9"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite"] }
notify = "6"
walkdir = "2"
sha2 = "0.10"
hex = "0.4"
uuid = { version = "1", features = ["v4"] }
pulldown-cmark = "0.9"
reqwest = { version = "0.11", features = ["json"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

---

## 6. 开发环境配置

### 6.1 前置要求

- Node.js 20+
- pnpm 8+
- Rust 1.75+
- Tauri CLI 2.x

### 6.2 初始化命令

```bash
# 安装 Tauri CLI
cargo install tauri-cli --version "^2.0.0"

# 安装前端依赖
pnpm install

# 开发模式
pnpm tauri dev

# 构建
pnpm tauri build
```

### 6.3 目录权限

应用需要访问以下目录：
- `$APP/data/` - 数据库文件
- `$HOME/.skill_desktop/` - 默认 Library 目录（Skill Desktop 拥有的中央存储位置）
- 用户自定义的 Library 目录
- Space 的 Active 目录

---

## 7. 错误处理

### 7.1 Rust 错误类型

```rust
// src-tauri/src/errors.rs

use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("File system error: {0}")]
    FileSystem(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Scan error: {0}")]
    Scan(String),

    #[error("Symlink error: {0}")]
    Symlink(String),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Not found: {0}")]
    NotFound(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}
```

---

## 8. 测试策略

### 8.1 单元测试

```rust
// src-tauri/src/scanner/parser_test.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_skill() {
        let content = r#"---
name: "test-skill"
version: "1.0.0"
description: "A test skill"
permissions:
  - file_read
---

# Test Skill
"#;

        let result = parse_skill_file(content);
        assert!(result.is_ok());

        let metadata = result.unwrap();
        assert_eq!(metadata.name, "test-skill");
        assert_eq!(metadata.version, "1.0.0");
        assert_eq!(metadata.permissions, vec!["file_read"]);
    }

    #[test]
    fn test_parse_missing_front_matter() {
        let content = "# No front matter";
        let result = parse_skill_file(content);
        assert!(result.is_err());
    }
}
```

### 8.2 集成测试

```rust
// src-tauri/tests/integration.rs

#[tokio::test]
async fn test_skill_lifecycle() {
    // 1. 创建临时目录
    let temp_dir = tempfile::tempdir().unwrap();

    // 2. 写入测试 Skill 文件
    let skill_path = temp_dir.path().join("test.md");
    std::fs::write(&skill_path, SKILL_CONTENT).unwrap();

    // 3. 初始化扫描器
    let db = Database::new(":memory:").await.unwrap();
    let scanner = SkillScanner::new(temp_dir.path().to_path_buf(), db.clone());

    // 4. 执行扫描
    scanner.full_scan().await.unwrap();

    // 5. 验证结果
    let skills = db.get_all_skills().await.unwrap();
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].name, "test-skill");
}
```

---

## 9. 部署与发布

### 9.1 构建流程

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, macos-14]

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Rust
        uses: dtolnay/rust-action@stable

      - name: Install dependencies
        run: pnpm install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: v__VERSION__
          releaseName: 'Skill Desktop v__VERSION__'
          releaseBody: 'See the assets to download this version.'
          releaseDraft: true
```

---

## 10. 附录

### 10.1 参考资料

- [Tauri 2.0 文档](https://v2.tauri.app/)
- [React Query 文档](https://tanstack.com/query/latest)
- [shadcn/ui 组件库](https://ui.shadcn.com/)
- [SQLx 文档](https://docs.rs/sqlx)
- [notify 文档](https://docs.rs/notify)

### 10.2 性能优化建议

1. **文件扫描优化**：使用增量扫描，只处理变更文件
2. **数据库优化**：合理使用索引，批量插入
3. **前端优化**：虚拟滚动处理大量 Skill 列表
4. **内存优化**：及时释放不再使用的文件内容
