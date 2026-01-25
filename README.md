<p align="center">
  <img src="public/skill-desktop.png" width="80" height="80" alt="Skill Desktop Logo">
</p>

<h1 align="center">Skill Desktop</h1>

<p align="center">
  <strong>The AI Agent Skills Management Platform</strong>
</p>

<p align="center">
  Manage, organize, and distribute your AI agent skills like a pro.
</p>

<p align="center">
  <a href="./README_ZH.md">中文文档</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## The Problem

Building AI agents is exciting, but managing their skills (tools/capabilities) is a nightmare:

- 🗂️ **Scattered Files** - Skills are spread across different folders, projects, and machines
- 🔄 **Context Switching** - Different agents need different skill combinations
- 🔒 **Security Concerns** - Hard to audit what permissions each skill requires
- 📦 **No Standard Format** - Every team has their own way of organizing skills

## The Solution

**Skill Desktop** is a native desktop application that brings order to chaos. Think of it as a powerful platform for managing AI Agent capabilities.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Skill Desktop                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Library    │  │   Spaces    │  │  Skill Hub  │              │
│  │  Manager    │  │   Manager   │  │  (Network)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Sandbox    │  │   Config    │  │   Settings  │              │
│  │  Debugger   │  │   Exporter  │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 📚 Library Manager
Your central hub for all skills. Automatically scans directories, indexes metadata, and keeps everything in sync.

- **Auto-discovery** - Point to a folder, we handle the rest
- **Real-time sync** - File changes are detected instantly
- **Smart search** - Find skills by name, tags, or permissions
- **Metadata extraction** - YAML front matter parsed automatically

### 🗂️ Workspace Spaces
Create isolated environments for different projects or agents. Each space has its own skill configuration.

- **One-click switching** - Jump between contexts instantly
- **Symlink magic** - Skills are linked, not copied
- **Export configs** - Generate `claude_desktop_config.json` and more

### 🌐 Skill Hub
Discover and import skills from the community.

- **URL import** - Paste a link, preview the code, import with confidence
- **GitHub integration** - Import directly from repositories
- **MCP support** - Connect to Model Context Protocol servers
- **Security first** - Review permissions before importing

### 🧪 Sandbox Debugger
Test skills in a safe, isolated environment before deploying.

- **Mock execution** - Simulate agent calls with custom parameters
- **Live logging** - See stdout/stderr in real-time
- **Performance metrics** - Track execution time and success rates

### 🔒 Security Built-in
Every skill declares its permissions. You're always in control.

```yaml
permissions:
  - file_read    # Low risk
  - network      # Medium risk  
  - shell_exec   # High risk - requires confirmation
```

## Installation

### macOS

```bash
# Homebrew (coming soon)
brew install --cask skill-desktop

# Or download from releases
```

### Windows

```bash
# Winget (coming soon)
winget install skill-desktop

# Or download from releases
```

### Linux

```bash
# AppImage available in releases
chmod +x Skill-Desktop.AppImage
./Skill-Desktop.AppImage
```

## Quick Start

1. **Set your Library path** - Choose where your skills live
2. **Create a Space** - Name it after your project or agent
3. **Toggle skills** - Enable/disable skills for each space
4. **Export config** - Generate configs for Claude, GPT, or custom agents

```bash
# Your skills folder structure
~/SkillLibrary/
├── web-search.md
├── file-manager.md
├── code-executor.md
└── data-analyzer.md
```

## Skill File Format

Skills use a simple Markdown format with YAML front matter:

```markdown
---
name: "web-search"
version: "1.0.0"
description: "Search the web and return results"
author: "your-name"
tags: ["search", "web", "utility"]
permissions:
  - network
parameters:
  - name: "query"
    type: "string"
    required: true
    description: "Search query"
---

# Web Search

Search the web using various search engines.

## Usage

Provide a search query and get back relevant results...
```

## Philosophy

**File System as Source of Truth** - Your skills are just files. You own them. Back them up, version them, share them however you want.

**SQLite as Shadow** - The database is just a fast index. Delete it anytime, we'll rebuild it from your files.

**Workspaces as Boundaries** - Different projects, different skills. No cross-contamination.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Tauri (Rust)
- **Database**: SQLite
- **UI Components**: shadcn/ui

## Development

```bash
# Prerequisites
# - Node.js 18+
# - Rust 1.70+
# - pnpm

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Roadmap

- [x] Core library management
- [x] Workspace spaces
- [x] Basic UI framework
- [ ] URL import
- [ ] GitHub integration
- [ ] MCP protocol support
- [ ] Sandbox debugger
- [ ] Cloud sync (optional)
- [ ] VS Code extension

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

- 🐛 [Report bugs](https://github.com/user/skill-desktop/issues)
- 💡 [Request features](https://github.com/user/skill-desktop/issues)
- 🔧 [Submit PRs](https://github.com/user/skill-desktop/pulls)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ for the AI agent community</sub>
</p>
