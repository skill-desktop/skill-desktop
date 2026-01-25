# Skill Desktop 产品需求文档 (PRD)

> 版本: 1.0.0
> 更新日期: 2025-01-24
> 状态: 草案

---

## 1. 产品概述

### 1.1 产品定位

**Skill Desktop** 是一款面向 Agent 开发者的桌面端基础设施，旨在将零散的 Agent 技能（Skills/Tools）转化为可管理、可调试、可分发的标准资产。

**一句话定义**：Agent 时代的专业能力管理平台。

### 1.2 核心理念

- **文件系统为真 (Source of Truth)**：所有 Skill 以文件形式存储，用户拥有完全控制权
- **SQLite 为影 (High-speed Cache)**：数据库仅作为索引缓存，可随时重建
- **工作空间为界 (Context Isolation)**：不同 Agent/项目使用独立的 Skill 组合

### 1.3 目标用户

| 用户类型 | 痛点 | 期望 |
|---------|------|------|
| Agent 开发者 | Skill 文件散落各处，难以管理 | 统一管理、版本追踪 |
| AI 应用开发者 | 不同项目需要不同的 Skill 组合 | 快速切换、隔离配置 |
| 企业团队 | Skill 安全审计困难 | 权限控制、来源追溯 |

---

## 2. 功能需求

### 2.1 核心功能模块

```
┌─────────────────────────────────────────────────────────────────┐
│                     Skill Desktop                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Library    │  │   Space     │  │  Skill Hub  │              │
│  │  Manager    │  │   Manager   │  │  (Network)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Sandbox    │  │   Config    │  │   Settings  │              │
│  │  Debugger   │  │   Exporter  │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Library Manager (技能库管理)

#### 2.2.1 功能描述

管理本地所有 Skill 文件的全局仓库，是 Skill Desktop 的核心存储中心。

#### 2.2.2 功能列表

| 功能 | 优先级 | 描述 |
|------|--------|------|
| 目录扫描 | P0 | 自动扫描指定目录下的所有 Skill 文件 |
| 实时监控 | P0 | 文件变更时自动更新索引 |
| 元数据提取 | P0 | 解析 SKILL.md 的 YAML Front Matter |
| 搜索过滤 | P0 | 按名称、标签、来源等条件检索 |
| 文件预览 | P1 | 查看 Skill 源码和结构 |
| 批量操作 | P1 | 批量删除、移动、导出 |
| 版本追踪 | P2 | 记录 Skill 的修改历史 |

#### 2.2.3 用户故事

```
作为 Agent 开发者，
我希望 能够将所有 Skill 文件集中存放在一个目录，
以便 统一管理和快速查找。

验收标准：
- 支持设置 Library 根目录
- 自动递归扫描子目录
- 新增/修改/删除文件时自动更新索引
```

### 2.3 Space Manager (工作空间管理)

#### 2.3.1 功能描述

为不同 Agent 或项目创建独立的 Skill 工作空间，通过软链接实现灵活配置。

#### 2.3.2 功能列表

| 功能 | 优先级 | 描述 |
|------|--------|------|
| 创建空间 | P0 | 新建命名的工作空间 |
| 可见性控制 | P0 | 勾选/取消控制 Skill 在空间中的可见性 |
| 链接同步 | P0 | 自动创建/删除软链接到 Active 目录 |
| 空间切换 | P0 | 快速切换当前活跃空间 |
| 空间克隆 | P1 | 复制现有空间配置 |
| 隔离区 | P1 | 存放不稳定/敏感的 Skill |
| 空间导出 | P1 | 导出空间配置为 JSON |

#### 2.3.3 用户故事

```
作为 AI 应用开发者，
我希望 为不同项目创建独立的 Skill 空间，
以便 每个项目只看到需要的 Skill，避免干扰。

验收标准：
- 支持创建多个命名空间
- 每个空间有独立的 Active 目录
- 勾选 Skill 时自动创建软链接
- 取消勾选时自动删除软链接
```

### 2.4 Skill Hub (网络技能中心)

#### 2.4.1 功能描述

从网络导入和发现新的 Skill，支持多种来源。

#### 2.4.2 功能列表

| 功能 | 优先级 | 描述 |
|------|--------|------|
| URL 导入 | P0 | 通过链接下载单个 Skill 文件 |
| GitHub 导入 | P1 | 从 GitHub 仓库导入 Skill |
| MCP 对接 | P1 | 接入 Model Context Protocol 服务 |
| 下载预览 | P0 | 下载前预览源码和权限 |
| 来源标记 | P0 | 记录 Skill 的下载来源 |
| 更新检测 | P2 | 检测网络 Skill 的更新 |

#### 2.4.3 用户故事

```
作为 Agent 开发者，
我希望 能够从 GitHub 或其他来源导入社区分享的 Skill，
以便 快速扩展我的 Agent 能力。

验收标准：
- 支持粘贴 URL 直接下载
- 下载前显示源码预览
- 显示 Skill 请求的权限
- 用户确认后才入库
```

### 2.5 Sandbox Debugger (调试沙箱)

#### 2.5.1 功能描述

在安全隔离的环境中测试和调试 Skill。

#### 2.5.2 功能列表

| 功能 | 优先级 | 描述 |
|------|--------|------|
| Mock 运行 | P1 | 模拟 Agent 调用，手动输入参数 |
| 执行日志 | P1 | 显示 stdout/stderr 输出 |
| 性能统计 | P2 | 记录调用耗时、成功率 |
| 安全拦截 | P1 | 拦截高危命令，需用户确认 |
| 历史记录 | P2 | 保存调试历史 |

### 2.6 Config Exporter (配置导出)

#### 2.6.1 功能描述

将空间配置导出为各种 Agent 平台可识别的格式。

#### 2.6.2 功能列表

| 功能 | 优先级 | 描述 |
|------|--------|------|
| Claude 配置导出 | P0 | 生成 claude_desktop_config.json |
| 通用 JSON 导出 | P1 | 导出为通用配置格式 |
| MCP 配置导出 | P2 | 导出为 MCP 兼容配置 |

---

## 3. 非功能需求

### 3.1 性能要求

| 指标 | 要求 |
|------|------|
| 启动时间 | < 2 秒 |
| 扫描 1000 个文件 | < 5 秒 |
| 搜索响应 | < 100ms |
| 内存占用 | < 200MB |

### 3.2 安全要求

| 要求 | 描述 |
|------|------|
| 权限审计 | 所有 Skill 需声明权限，展示给用户 |
| 来源追溯 | 记录每个 Skill 的来源 URL |
| 高危拦截 | 执行危险命令前需用户确认 |
| 本地存储 | 所有数据存储在本地，不上传云端 |

### 3.3 兼容性要求

| 平台 | 支持状态 |
|------|----------|
| macOS (Apple Silicon) | 完全支持 |
| macOS (Intel) | 完全支持 |
| Windows 10/11 | 计划支持 |
| Linux | 计划支持 |

---

## 4. Skill 文件规范

### 4.1 文件结构

```markdown
---
name: "skill-name"
version: "1.0.0"
description: "简短描述"
author: "作者名"
tags: ["tag1", "tag2"]
permissions:
  - file_read
  - network
parameters:
  - name: "param1"
    type: "string"
    required: true
    description: "参数描述"
---

# Skill 名称

## 描述

详细的功能描述...

## 使用示例

```
示例代码...
```
```

### 4.2 权限类型

| 权限 | 描述 | 风险等级 |
|------|------|----------|
| file_read | 读取文件 | 低 |
| file_write | 写入文件 | 中 |
| network | 网络访问 | 中 |
| shell_exec | 执行命令 | 高 |
| system_info | 获取系统信息 | 低 |

---

## 5. 数据模型

### 5.1 Skill 实体

```typescript
interface Skill {
  hash: string;           // SHA-256 文件哈希
  filename: string;       // 文件名
  localPath: string;      // 本地路径
  sourceUrl?: string;     // 来源 URL
  name: string;           // Skill 名称
  version: string;        // 版本号
  description: string;    // 描述
  author?: string;        // 作者
  tags: string[];         // 标签
  permissions: string[];  // 权限列表
  parameters: Parameter[];// 参数定义
  isDownloaded: boolean;  // 是否从网络下载
  createdAt: Date;        // 创建时间
  updatedAt: Date;        // 更新时间
}
```

### 5.2 Space 实体

```typescript
interface Space {
  id: string;             // 空间 ID
  name: string;           // 空间名称
  activeDir: string;      // Active 目录路径
  description?: string;   // 描述
  createdAt: Date;        // 创建时间
}
```

### 5.3 SpaceSkill 关联

```typescript
interface SpaceSkill {
  spaceId: string;        // 空间 ID
  skillHash: string;      // Skill 哈希
  isVisible: boolean;     // 是否可见
  addedAt: Date;          // 添加时间
}
```

---

## 6. 路线图

### Phase 1: 核心链路 (V1.0)

- [ ] Library 目录扫描与索引
- [ ] Space 创建与可见性控制
- [ ] 软链接自动同步
- [ ] 基础 UI 框架
- [ ] 文件预览功能

### Phase 2: 网络与分发 (V1.5)

- [ ] URL 导入功能
- [ ] GitHub 仓库导入
- [ ] MCP 协议对接
- [ ] 权限审计 UI
- [ ] 配置导出功能

### Phase 3: 调试与生态 (V2.0)

- [ ] 可视化调试面板
- [ ] 执行日志追踪
- [ ] 云端配置同步
- [ ] VS Code 扩展

---

## 7. 术语表

| 术语 | 定义 |
|------|------|
| Skill | Agent 可调用的能力单元，以文件形式存储 |
| Library | 存放所有 Skill 文件的全局仓库目录 |
| Space | 面向特定 Agent/项目的虚拟工作空间 |
| Active Directory | Space 的软链接目录，Agent 实际读取的位置 |
| MCP | Model Context Protocol，Agent 工具协议标准 |
| Front Matter | Markdown 文件顶部的 YAML 元数据块 |
