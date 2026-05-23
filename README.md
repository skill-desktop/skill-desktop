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

### Library Manager — One central library
All your skills live in a single, fixed location (`~/.skill_desktop/` by default) that Skill Desktop owns and curates.

- **Multi-level directory tree** - Organize skills with nested folders, expand/collapse, right-click to reveal in Finder
- **Auto-discovery** - Point to the folder, we index everything
- **Real-time sync** - File changes are detected instantly
- **Smart search** - Find skills by name, tags, or permissions
- **Full Agent Skills support** - SKILL.md with scripts, references, and assets
- **Risk analysis** - Automatic code scanning for potential security risks

### AI Tool Sync — One library, every AI agent
Sync any skill from your central library into the directories your AI tools actually read from.

- **Auto-detect installed tools** - Claude Code, Cursor, Codex, Gemini CLI, OpenCode, Windsurf, and the cross-tool `~/.agents/skills/` standard
- **Per-skill, per-tool control** - Install / uninstall a skill into each tool independently with status badges
- **Symlinks, not copies** - One source of truth in `~/.skill_desktop/`; tools see live symlinks
- **Bulk install / remove** - Push a skill to every active tool, or pull it back, with one click

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
- **Per-space visibility** - Show only the skills relevant to a project

### Skill Hub
Discover and import skills from the community.

- **URL / local import** - Paste a link, drop a folder/zip, preview and import with confidence
- **GitHub integration** - Import directly from repositories (including [anthropics/skills](https://github.com/anthropics/skills))
- **MCP Registry** - Browse and import from Glama, MCP.so, MCPServers.org, and Smithery — convert MCP tools into skills
- **Security first** - Review permissions and risk analysis before importing

### Onboarding & UX
- **First-run wizard** - Picks `~/.skill_desktop/`, detects your AI tools, offers links for any that aren't installed yet
- **⌘K command palette + ⌘1-6 view switching** - Press `?` anywhere for the shortcuts cheat sheet
- **Internationalized** - English & 简体中文

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

1. **Open the app** - Skill Desktop creates `~/.skill_desktop/` as your central library on first run
2. **Create or import a skill** - Use the wizard, paste a URL, drop a folder, or browse the Skill Hub
3. **Install into your AI tools** - Pick the tools detected on your machine (Claude Code / Cursor / Codex / Gemini CLI / OpenCode / Windsurf) and sync with one click
4. **Create a Space** (optional) - Curate which skills are visible per project / agent
5. **Edit a skill once, it updates everywhere** - Files live in `~/.skill_desktop/`; symlinks keep every AI tool in sync

## Agent Skills Standard

Skill Desktop follows the [Agent Skills](https://agentskills.io) specification created by Anthropic. This ensures your skills are compatible with Claude Code, Claude.ai, and other AI agents.

### Directory Structure

Skills are organized as directories containing a `SKILL.md` file and optional resource folders:

```
~/.skill_desktop/                  # Skill Desktop's central library (default)
├── web-search/
│   ├── SKILL.md                   # Main skill file (required)
│   ├── LICENSE.txt                # License file (optional)
│   ├── scripts/                   # Executable code (optional)
│   │   ├── search.py
│   │   └── parse_results.py
│   ├── references/                # Documentation (optional)
│   │   └── api_docs.md
│   └── assets/                    # Templates, images, etc. (optional)
│       └── template.html
├── research/                      # Nested folders are fully supported
│   ├── deep-research/
│   │   └── SKILL.md
│   └── citation-checker/
│       └── SKILL.md
└── data-analyzer/
    ├── SKILL.md
    └── references/
        └── schema.md
```

From this single source of truth, Skill Desktop creates symlinks into each AI tool's own skill directory (e.g. `~/.claude/skills/`, `~/.cursor/skills/`, `~/.codex/skills/`, `~/.gemini/skills/`, `~/.agents/skills/`).

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

- [x] Core library management with multi-level directory tree
- [x] Workspace spaces with per-skill visibility
- [x] First-run onboarding wizard
- [x] URL / local file / local folder import
- [x] GitHub integration (with full directory support)
- [x] MCP Registry support (Glama, MCP.so, MCPServers.org, Smithery) — import MCP tools as skills
- [x] Risk analysis
- [x] Agent Skills standard support (SKILL.md, scripts, references, assets)
- [x] Skill creation wizard
- [x] Auto-detection of installed AI tools (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, Windsurf)
- [x] Per-tool install / uninstall with symlinks
- [x] ⌘K command palette and global keyboard shortcuts
- [ ] Sandbox debugger UI
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
