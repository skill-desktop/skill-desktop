<p align="center">
  <img src="public/skill-desktop.png" width="80" height="80" alt="Skill Desktop Logo">
</p>

<h1 align="center">Skill Desktop</h1>

<p align="center">
  <strong>The AI Agent Skills Management Platform</strong>
</p>

<p align="center">
  Manage, organize, and distribute your AI agent skills following the <a href="https://agentskills.io">Agent Skills</a> standard.
</p>

<p align="center">
  <a href="./README_ZH.md">中文文档</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#agent-skills-standard">Agent Skills Standard</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Agent%20Skills-compatible-orange" alt="Agent Skills Compatible">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## The Problem

Building AI agents is exciting, but managing their skills (tools/capabilities) is a nightmare:

- **Scattered Files** - Skills are spread across different folders, projects, and machines
- **Context Switching** - Different agents need different skill combinations
- **Security Concerns** - Hard to audit what permissions each skill requires
- **No Standard Format** - Every team has their own way of organizing skills

## The Solution

**Skill Desktop** is a native desktop application that brings order to chaos. It follows the [Agent Skills](https://agentskills.io) standard created by Anthropic, making your skills compatible with Claude Code, Claude.ai, and other AI agents.

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
│  │  Skill      │  │   Config    │  │   Settings  │              │
│  │  Creator    │  │   Exporter  │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Library Manager
Your central hub for all skills. Automatically scans directories, indexes metadata, and keeps everything in sync.

- **Auto-discovery** - Point to a folder, we handle the rest
- **Real-time sync** - File changes are detected instantly
- **Smart search** - Find skills by name, tags, or permissions
- **Full Agent Skills support** - SKILL.md with scripts, references, and assets
- **Risk analysis** - Automatic code scanning for potential security risks

### Skill Creator
Create new skills with a guided wizard following the Agent Skills standard.

- **Step-by-step wizard** - Name, description, and resource options
- **Validation** - Real-time validation of name and description formats
- **Template generation** - Creates proper directory structure with example files
- **Resource directories** - Optional scripts/, references/, and assets/ folders

### Workspace Spaces
Create isolated environments for different projects or agents. Each space has its own skill configuration.

- **One-click switching** - Jump between contexts instantly
- **Symlink magic** - Skills are linked, not copied
- **Export configs** - Generate `claude_desktop_config.json` and MCP configs

### Skill Hub
Discover and import skills from the community.

- **URL import** - Paste a link, preview the code, import with confidence
- **GitHub integration** - Import directly from repositories (including [anthropics/skills](https://github.com/anthropics/skills))
- **MCP Registry** - Browse and import from Glama, MCP.so, MCPServers.org, and Smithery
- **Security first** - Review permissions and risk analysis before importing

### Security Built-in
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
2. **Create a Skill** - Use the wizard to create your first skill
3. **Create a Space** - Name it after your project or agent
4. **Toggle skills** - Enable/disable skills for each space
5. **Export config** - Generate configs for Claude, GPT, or custom agents

## Agent Skills Standard

Skill Desktop follows the [Agent Skills](https://agentskills.io) specification created by Anthropic. This ensures your skills are compatible with Claude Code, Claude.ai, and other AI agents.

### Directory Structure

Skills are organized as directories containing a `SKILL.md` file and optional resource folders:

```
~/SkillLibrary/
├── web-search/
│   ├── SKILL.md              # Main skill file (required)
│   ├── LICENSE.txt           # License file (optional)
│   ├── scripts/              # Executable code (optional)
│   │   ├── search.py
│   │   └── parse_results.py
│   ├── references/           # Documentation (optional)
│   │   └── api_docs.md
│   └── assets/               # Templates, images, etc. (optional)
│       └── template.html
├── code-executor/
│   ├── SKILL.md
│   └── scripts/
│       └── sandbox.py
└── data-analyzer/
    ├── SKILL.md
    └── references/
        └── schema.md
```

### Resource Directories

| Directory | Purpose | When to Use |
|-----------|---------|-------------|
| `scripts/` | Executable code (Python/Bash/etc.) | When the same code is rewritten repeatedly or deterministic reliability is needed |
| `references/` | Documentation to load into context | For detailed information Claude should reference while working |
| `assets/` | Files used in output | Templates, images, fonts, boilerplate code |

### SKILL.md Format

Skills use Markdown with YAML front matter following the Agent Skills spec:

```markdown
---
name: web-search
description: Search the web and return results. Use this when you need to find current information online, verify facts, or research topics.
license: MIT
---

# Web Search

## Overview

Search the web using various search engines and return structured results.

## Workflow

1. Parse the search query
2. Execute search via API
3. Parse and rank results
4. Return formatted response

## Resources

### scripts/
- `search.py` - Main search implementation
- `parse_results.py` - Result parsing utilities

### references/
- `api_docs.md` - Search API documentation
```

### Required Fields

Per the Agent Skills specification:

| Field | Description | Requirements |
|-------|-------------|--------------|
| `name` | Unique identifier | 1-64 chars, lowercase alphanumeric and hyphens, must match directory name |
| `description` | What the skill does and when to use it | 1-1024 chars, no angle brackets |

### Optional Fields

| Field | Description |
|-------|-------------|
| `license` | License info (e.g., "MIT", "Apache-2.0", "Complete terms in LICENSE.txt") |
| `allowed-tools` | List of allowed tools for this skill |
| `metadata` | Additional metadata object |

## Philosophy

**File System as Source of Truth** - Your skills are just files. You own them. Back them up, version them, share them however you want.

**SQLite as Shadow** - The database is just a fast index. Delete it anytime, we'll rebuild it from your files.

**Workspaces as Boundaries** - Different projects, different skills. No cross-contamination.

**Standards Matter** - Following the Agent Skills spec means your skills work everywhere.

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
- [x] URL import
- [x] GitHub integration (with full directory support)
- [x] MCP Registry support (Glama, MCP.so, MCPServers.org, Smithery)
- [x] Risk analysis
- [x] Agent Skills standard support (SKILL.md, scripts, references, assets)
- [x] Skill creation wizard
- [ ] Sandbox debugger
- [ ] Cloud sync (optional)
- [ ] VS Code extension

## Related Projects

- [anthropics/skills](https://github.com/anthropics/skills) - Official Agent Skills examples from Anthropic
- [Agent Skills Specification](https://agentskills.io/specification) - The standard specification

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

- [Report bugs](https://github.com/user/skill-desktop/issues)
- [Request features](https://github.com/user/skill-desktop/issues)
- [Submit PRs](https://github.com/user/skill-desktop/pulls)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with care for the AI agent community</sub>
</p>
