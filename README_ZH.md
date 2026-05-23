<p align="center">
  <img src="public/skill-desktop.png" width="80" height="80" alt="Skill Desktop Logo">
</p>

<h1 align="center">Skill Desktop</h1>

<p align="center">
  <strong>AI Agent 技能管理平台</strong>
</p>

<p align="center">
  遵循 <a href="https://agentskills.io">Agent Skills</a> 标准，管理、组织和分发你的 AI Agent 技能。
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="#特性">特性</a> •
  <a href="#安装">安装</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#agent-skills-标准">Agent Skills 标准</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Agent%20Skills-compatible-orange" alt="Agent Skills Compatible">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## 痛点

构建 AI Agent 很有趣，但管理它们的技能（工具/能力）却是一场噩梦：

- **文件散落各处** - 技能分散在不同的文件夹、项目和机器上
- **上下文切换困难** - 不同的 Agent 需要不同的技能组合
- **安全审计困难** - 难以审计每个技能需要什么权限
- **没有标准格式** - 每个团队都有自己组织技能的方式

## 解决方案

**Skill Desktop** 是一款原生桌面应用，让混乱变得有序。它遵循 Anthropic 创建的 [Agent Skills](https://agentskills.io) 标准，使你的技能与 Claude Code、Claude.ai 和其他 AI Agent 兼容。

```
┌─────────────────────────────────────────────────────────────────┐
│                     Skill Desktop                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  技能库     │  │   工作空间   │  │  技能中心   │              │
│  │  管理器     │  │   管理器     │  │  (网络)     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  技能       │  │   配置      │  │   设置      │              │
│  │  创建器     │  │   导出      │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## 特性

### 技能库管理器 — 一个中央技能库
所有技能集中存放在 Skill Desktop 拥有并维护的固定位置（默认 `~/.skill_desktop/`）。

- **多级目录树** - 支持嵌套文件夹、一键展开/折叠、右键在 Finder 中显示
- **自动发现** - 指定一个文件夹，剩下的交给我们
- **实时同步** - 文件变更即时检测
- **智能搜索** - 按名称、标签或权限查找技能
- **完整 Agent Skills 支持** - SKILL.md 以及 scripts、references、assets 目录
- **风险分析** - 自动代码扫描，识别潜在安全风险

### AI 工具同步 — 一个技能库，所有 AI 工具
把中央技能库里的任意技能，同步到各 AI 工具实际读取的目录。

- **自动检测已安装工具** - Claude Code、Cursor、Codex、Gemini CLI、OpenCode、Windsurf 以及跨工具的 `~/.agents/skills/` 标准
- **按技能、按工具独立控制** - 每个技能可独立 install / uninstall 到任意工具，状态徽章一目了然
- **软链接而非拷贝** - 唯一真相在 `~/.skill_desktop/`，各工具看到的是实时软链接
- **批量安装/移除** - 一键将技能推送到所有已激活的工具，或一键全部回收

### 技能创建器
使用引导式向导创建符合 Agent Skills 标准的新技能。

- **分步向导** - 名称、描述和资源选项
- **实时验证** - 名称和描述格式的实时验证
- **模板生成** - 创建正确的目录结构和示例文件
- **资源目录** - 可选的 scripts/、references/ 和 assets/ 文件夹

### 工作空间
为不同的项目或 Agent 创建隔离的环境。每个空间都有自己的技能配置。

- **一键切换** - 在不同上下文之间即时跳转
- **软链接魔法** - 技能是链接的，不是复制的
- **按空间可见性** - 只展示当前项目需要的技能

### 技能中心
从社区发现和导入技能。

- **URL / 本地导入** - 粘贴链接、拖入文件夹/zip，预览后放心导入
- **GitHub 集成** - 直接从仓库导入（包括 [anthropics/skills](https://github.com/anthropics/skills)）
- **MCP 注册表** - 浏览并从 Glama、MCP.so、MCPServers.org 和 Smithery 导入，还可将 MCP 工具转换为技能
- **安全优先** - 导入前审查权限和风险分析

### 引导与体验
- **首次运行向导** - 自动指向 `~/.skill_desktop/`，检测本机 AI 工具，未安装的提供官方安装链接
- **⌘K 命令面板 + ⌘1-6 视图切换** - 按 `?` 随时打开快捷键速查表
- **多语言** - English & 简体中文

### 内置安全
每个技能都声明其权限。你始终掌控一切。

```yaml
permissions:
  - file_read    # 低风险
  - network      # 中风险  
  - shell_exec   # 高风险 - 需要确认
```

## 安装

### macOS

```bash
# Homebrew（即将推出）
brew install --cask skill-desktop

# 或从 releases 下载
```

### Windows

```bash
# Winget（即将推出）
winget install skill-desktop

# 或从 releases 下载
```

### Linux

```bash
# AppImage 可在 releases 中获取
chmod +x Skill-Desktop.AppImage
./Skill-Desktop.AppImage
```

## 快速开始

1. **打开应用** - 首次启动时 Skill Desktop 会创建 `~/.skill_desktop/` 作为中央技能库
2. **创建或导入技能** - 用向导、粘贴 URL、拖入文件夹，或浏览技能中心
3. **同步到你的 AI 工具** - 选择本机检测到的工具（Claude Code / Cursor / Codex / Gemini CLI / OpenCode / Windsurf），一键同步
4. **创建工作空间**（可选）- 按项目/Agent 精选可见的技能
5. **改一次，处处生效** - 文件在 `~/.skill_desktop/`，软链接保持所有 AI 工具实时同步

## Agent Skills 标准

Skill Desktop 遵循 Anthropic 创建的 [Agent Skills](https://agentskills.io) 规范。这确保你的技能与 Claude Code、Claude.ai 和其他 AI Agent 兼容。

### 目录结构

技能以目录形式组织，包含 `SKILL.md` 文件和可选的资源文件夹：

```
~/.skill_desktop/                  # Skill Desktop 的中央技能库（默认）
├── web-search/
│   ├── SKILL.md                   # 主技能文件（必需）
│   ├── LICENSE.txt                # 许可证文件（可选）
│   ├── scripts/                   # 可执行代码（可选）
│   │   ├── search.py
│   │   └── parse_results.py
│   ├── references/                # 文档（可选）
│   │   └── api_docs.md
│   └── assets/                    # 模板、图片等（可选）
│       └── template.html
├── research/                      # 完全支持嵌套目录
│   ├── deep-research/
│   │   └── SKILL.md
│   └── citation-checker/
│       └── SKILL.md
└── data-analyzer/
    ├── SKILL.md
    └── references/
        └── schema.md
```

从这个唯一的真相源出发，Skill Desktop 会向每个 AI 工具自己的技能目录创建软链接（如 `~/.claude/skills/`、`~/.cursor/skills/`、`~/.codex/skills/`、`~/.gemini/skills/`、`~/.agents/skills/`）。

### 资源目录

| 目录 | 用途 | 何时使用 |
|------|------|----------|
| `scripts/` | 可执行代码（Python/Bash 等） | 当相同代码被重复编写或需要确定性可靠性时 |
| `references/` | 加载到上下文的文档 | 用于 Claude 在工作时应参考的详细信息 |
| `assets/` | 输出中使用的文件 | 模板、图片、字体、样板代码 |

### SKILL.md 格式

技能使用带有 YAML front matter 的 Markdown 格式，遵循 Agent Skills 规范：

```markdown
---
name: web-search
description: 搜索网络并返回结果。当你需要在线查找当前信息、验证事实或研究主题时使用此技能。
license: MIT
---

# 网络搜索

## 概述

使用各种搜索引擎搜索网络并返回结构化结果。

## 工作流程

1. 解析搜索查询
2. 通过 API 执行搜索
3. 解析并排序结果
4. 返回格式化响应

## 资源

### scripts/
- `search.py` - 主搜索实现
- `parse_results.py` - 结果解析工具

### references/
- `api_docs.md` - 搜索 API 文档
```

### 必需字段

根据 Agent Skills 规范：

| 字段 | 描述 | 要求 |
|------|------|------|
| `name` | 唯一标识符 | 1-64 字符，小写字母数字和连字符，必须与目录名匹配 |
| `description` | 技能功能和使用场景 | 1-1024 字符，不能包含尖括号 |

### 可选字段

| 字段 | 描述 |
|------|------|
| `license` | 许可证信息（如 "MIT"、"Apache-2.0"、"Complete terms in LICENSE.txt"）|
| `allowed-tools` | 此技能允许使用的工具列表 |
| `metadata` | 额外的元数据对象 |

## 设计理念

**文件系统为真** - 你的技能就是文件。你拥有它们。随意备份、版本控制、分享。

**SQLite 为影** - 数据库只是一个快速索引。随时删除，我们会从你的文件重建。

**工作空间为界** - 不同项目，不同技能。互不干扰。

**标准至上** - 遵循 Agent Skills 规范意味着你的技能到处都能用。

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS
- **后端**: Tauri (Rust)
- **数据库**: SQLite
- **UI 组件**: shadcn/ui

## 开发

```bash
# 前置要求
# - Node.js 18+
# - Rust 1.70+
# - pnpm

# 安装依赖
pnpm install

# 开发模式运行
pnpm tauri dev

# 生产构建
pnpm tauri build
```

## 路线图

- [x] 核心技能库管理（多级目录树）
- [x] 工作空间（按技能可见性）
- [x] 首次运行引导向导
- [x] URL / 本地文件 / 本地文件夹导入
- [x] GitHub 集成（支持完整目录导入）
- [x] MCP 注册表支持（Glama、MCP.so、MCPServers.org、Smithery）— 可将 MCP 工具转为技能
- [x] 风险分析
- [x] Agent Skills 标准支持（SKILL.md、scripts、references、assets）
- [x] 技能创建向导
- [x] 自动检测已安装 AI 工具（Claude Code、Cursor、Codex、Gemini CLI、OpenCode、Windsurf）
- [x] 按工具的 install / uninstall（软链接方式）
- [x] ⌘K 命令面板与全局快捷键
- [ ] 调试沙箱 UI
- [ ] 云端同步（可选）
- [ ] VS Code 扩展

## 相关项目

- [anthropics/skills](https://github.com/anthropics/skills) - Anthropic 官方 Agent Skills 示例
- [Agent Skills 规范](https://agentskills.io/specification) - 标准规范

## 贡献

我们欢迎贡献！请查看我们的 [贡献指南](CONTRIBUTING.md) 了解详情。

- [报告 Bug](https://github.com/user/skill-desktop/issues)
- [功能请求](https://github.com/user/skill-desktop/issues)
- [提交 PR](https://github.com/user/skill-desktop/pulls)

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)。

---

<p align="center">
  <sub>为 AI Agent 社区用心构建</sub>
</p>
