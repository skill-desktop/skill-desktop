<p align="center">
  <img src="public/tauri.svg" width="80" height="80" alt="Skill Desktop Logo">
</p>

<h1 align="center">Skill Desktop</h1>

<p align="center">
  <strong>AI Agent 技能管理的 Docker Desktop</strong>
</p>

<p align="center">
  像专业人士一样管理、组织和分发你的 AI Agent 技能。
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="#特性">特性</a> •
  <a href="#安装">安装</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#文档">文档</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## 痛点

构建 AI Agent 很有趣，但管理它们的技能（工具/能力）却是一场噩梦：

- 🗂️ **文件散落各处** - 技能分散在不同的文件夹、项目和机器上
- 🔄 **上下文切换困难** - 不同的 Agent 需要不同的技能组合
- 🔒 **安全审计困难** - 难以审计每个技能需要什么权限
- 📦 **没有标准格式** - 每个团队都有自己组织技能的方式

## 解决方案

**Skill Desktop** 是一款原生桌面应用，让混乱变得有序。可以把它想象成 AI Agent 时代的 **Docker Desktop + VS Code 扩展管理器**。

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
│  │  调试       │  │   配置      │  │   设置      │              │
│  │  沙箱       │  │   导出      │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## 特性

### 📚 技能库管理器
所有技能的中央枢纽。自动扫描目录、索引元数据，保持一切同步。

- **自动发现** - 指定一个文件夹，剩下的交给我们
- **实时同步** - 文件变更即时检测
- **智能搜索** - 按名称、标签或权限查找技能
- **元数据提取** - 自动解析 YAML front matter

### 🗂️ 工作空间
为不同的项目或 Agent 创建隔离的环境。每个空间都有自己的技能配置。

- **一键切换** - 在不同上下文之间即时跳转
- **软链接魔法** - 技能是链接的，不是复制的
- **导出配置** - 生成 `claude_desktop_config.json` 等配置文件

### 🌐 技能中心
从社区发现和导入技能。

- **URL 导入** - 粘贴链接，预览代码，放心导入
- **GitHub 集成** - 直接从仓库导入
- **MCP 支持** - 连接 Model Context Protocol 服务器
- **安全优先** - 导入前审查权限

### 🧪 调试沙箱
在部署前在安全隔离的环境中测试技能。

- **模拟执行** - 使用自定义参数模拟 Agent 调用
- **实时日志** - 实时查看 stdout/stderr
- **性能指标** - 跟踪执行时间和成功率

### 🔒 内置安全
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

1. **设置技能库路径** - 选择你的技能存放位置
2. **创建工作空间** - 以你的项目或 Agent 命名
3. **切换技能** - 为每个空间启用/禁用技能
4. **导出配置** - 为 Claude、GPT 或自定义 Agent 生成配置

```bash
# 你的技能文件夹结构
~/SkillLibrary/
├── web-search.md
├── file-manager.md
├── code-executor.md
└── data-analyzer.md
```

## 技能文件格式

技能使用简单的 Markdown 格式，带有 YAML front matter：

```markdown
---
name: "web-search"
version: "1.0.0"
description: "搜索网络并返回结果"
author: "your-name"
tags: ["搜索", "网络", "工具"]
permissions:
  - network
parameters:
  - name: "query"
    type: "string"
    required: true
    description: "搜索查询"
---

# 网络搜索

使用各种搜索引擎搜索网络。

## 使用方法

提供搜索查询，获取相关结果...
```

## 设计理念

**文件系统为真** - 你的技能就是文件。你拥有它们。随意备份、版本控制、分享。

**SQLite 为影** - 数据库只是一个快速索引。随时删除，我们会从你的文件重建。

**工作空间为界** - 不同项目，不同技能。互不干扰。

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

- [x] 核心技能库管理
- [x] 工作空间
- [x] 基础 UI 框架
- [ ] URL 导入
- [ ] GitHub 集成
- [ ] MCP 协议支持
- [ ] 调试沙箱
- [ ] 云端同步（可选）
- [ ] VS Code 扩展

## 贡献

我们欢迎贡献！请查看我们的 [贡献指南](CONTRIBUTING.md) 了解详情。

- 🐛 [报告 Bug](https://github.com/user/skill-desktop/issues)
- 💡 [功能请求](https://github.com/user/skill-desktop/issues)
- 🔧 [提交 PR](https://github.com/user/skill-desktop/pulls)

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)。

---

<p align="center">
  <sub>为 AI Agent 社区用 ❤️ 构建</sub>
</p>
