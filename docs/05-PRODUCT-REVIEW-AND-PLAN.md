# Skill Desktop · 产品力盘点与改进计划

> 版本: 1.1（路径方案调整）
> 角色视角: 资深产品经理 + AI 重度用户
> 截稿日期: 2026-05-21（v1.0），2026-05-23（v1.1 修订）

---

## ⚠️ v1.1 状态更新（2026-05-23）

经过用户使用反馈与产品评审，**默认 library 路径已从 `~/.agents/skills/` 改为 `~/.skill_desktop/`**：

- Skill Desktop 拥有并维护 `~/.skill_desktop/` 作为唯一的中央存储位置
- 各 AI 工具的目录（`~/.claude/skills/`、`~/.cursor/skills/`、`~/.codex/skills/`、`~/.gemini/skills/`、`~/.agents/skills/` 等）通过软链接从中央库同步
- 这样做的好处：① 用户清晰知道"我的技能在哪"，② 删除/卸载 AI 工具不会影响技能本体，③ 不会污染任何 AI 工具的目录

下文中所有提到"默认 library 路径是 `~/.agents/skills/`"的段落，请以本块为准。

---

## TL;DR

**当前定位过宽，主线被淹没。** 一句话能讲清的产品（"把你写的 skill 装进任何 AI 工具"），现在被拆成 5 个 Top-level Tab + 6 个 Import 来源 + 4 个 AI Tool 子页 + 6 个 Settings 子页，新用户打开后**不知道该先做什么**。

接下来 4 周用 3 个 Milestone 把它压回 iOS App 那种"打开即懂"的形态：

| Milestone | 关键动作 | 用户感受 |
|-----------|----------|----------|
| **M1** 收口主线 | 抓住"拖一个 skill 进来 → 自动装到我的 AI 工具" | "原来这么简单" |
| **M2** 信息架构瘦身 | 5 个顶层 Tab 砍到 2-3 个，把次要功能塞进抽屉 | "终于不晕了" |
| **M3** 视觉与交互打磨 | 动效、空状态、首启引导都按 iOS 标准重做一遍 | "像官方 App" |

---

## 第一部分 · 产品力盘点

### 1. 价值主张是清晰的，但表达失焦

#### 产品到底解决什么问题？

把 Anthropic 在 2026 年定下的 **Agent Skills 标准**（`SKILL.md` + `scripts/` + `references/` + `assets/` 的目录约定）变成所有 AI 工具都能识别的本地资产，**让一个 skill 写一次，到处都能用**。

用户痛点是真实的：

- 写好的 prompt/工具散落在 Claude Code 的 `~/.claude/skills/`、Cursor 的 `~/.cursor/skills/`、OpenCode 的 `~/.config/opencode/`、各种自建 agent 项目里
- 每换一个 AI 工具就要重新搭一遍
- 不知道哪个 skill 装到哪个工具
- 朋友/同事/社区分享一个 skill 就是丢一个 zip 给你，没人会手把手教你怎么放

#### 表达上的问题

打开当前的 README、当前的首屏，**用户看不到"一个 skill 装进所有 AI 工具"这句话**。看到的是：

- "Agent Skill management infrastructure for developers"（infrastructure 是个开发者词，普通用户不感冒）
- 一个空荡的 Library 列表
- 5 个 Tab，每个 Tab 长得都差不多，都是列表

**对照 iOS Shortcuts**：打开就是大卡片 + 一个加号 + 我的快捷指令一目了然。这里缺的就是这种"我一眼就知道这是干嘛的"的视觉锚点。

---

### 2. 信息架构：太多、太平、太散

#### 当前一级导航

```
Library    -- 全部 skill
Spaces     -- 子集 + 软链接（高级概念）
Sandbox    -- 跑脚本
AI Tools   -- 配置 4 个 AI 工具
Settings   -- 6 个子页
```

**问题诊断**：

| Tab | 真实使用频率 | 真实功能职责 | 是否值得占顶层 |
|-----|-------------|--------------|----------------|
| Library | 高 | skill 全集 | ✅ 当之无愧 |
| Spaces | 中-低 | skill 子集 + symlink | ⚠️ 多数人只用一个 |
| Sandbox | 低 | 跑脚本测试 | ❌ 应该收敛进 Library 的 detail |
| AI Tools | **混乱** | 既改 `CLAUDE.md` 配置文件，又装 skill | ❌ **职责重叠**，跟 Library 的 install 重复 |
| Settings | 低频 | 偏好/路径/LLM key/CLI | ⚠️ 应该齿轮图标进抽屉 |

**核心冲突点**：`Library` 里有 "Install to AI Tool" 按钮（每个 skill 都能装），`AI Tools` 里也能管 skill 装机。同一件事两个入口，新用户第二次进来会困惑"我刚才到底在哪儿装的"。

#### Import Skill Dialog 的"6 个标签"

```
Local · Examples · URL · GitHub · MCP · Registry
```

——这是一个对开发者非常诚实、对普通用户非常恐怖的页面。其中 4 个（MCP / Registry / URL / GitHub）都是"从远程拉过来"，可以合并成一个 "**Discover**"。Examples 应该首页推荐，不该单独成 Tab。

#### Settings 6 子页

```
Appearance · Library · Security · LLM · CLI · About
```

里面真正用得多的就是 `Appearance.theme` 和 `Library.directory`。其它的都是"偶尔配一次"的页面。**应该收敛**。

---

### 3. 痛点直击度评估

用户的真实任务（按出现频率排序）：

| # | 任务 | 当前路径长度 | 应该多长 |
|---|------|--------------|----------|
| 1 | 我有个 skill，想让 Claude 能用 | 拖入 → 切 Library → 选 skill → Install dialog → 选 Claude → 点 Install（6 步） | **拖入即装**（1 步，自动装到首选 AI 工具） |
| 2 | 想看别人写的 skill 长啥样 | 切 Library → Import → Examples → 一个一个点 → 点 Import | 首屏就有 "Browse Examples"（2 步） |
| 3 | 装错了想卸载 | 切 Library → 找到那个 skill → 看 Install dialog → 点 Uninstall | 卡片右上角直接显示"已装到 Claude · Cursor"，点掉勾 |
| 4 | 想知道这个 skill 是否安全 | 切 Library → 点 skill → 切 Security tab | 卡片上直接显示安全 badge，颜色编码 |
| 5 | 换设备同步我的 skill | ❌ 还没做 | iCloud Drive / Dropbox 选目录即可 |

**结论**：核心任务 #1 的路径长度是 6，应该是 1。当前产品是一个"管理工具"，理想形态是一个"开关型工具"。

---

### 4. UX 微观摩擦点（按伤害递减排序）

#### 🔴 首启即空白
- 打开应用，Library 是空的，只显示 "No library directory set" 卡片
- 没有任何引导，没有示例 skill 预装
- **对比**：iOS Shortcuts 第一次打开就有"启动器" "效率" "购物" 三个分类示例

#### 🔴 默认 library 路径是 `~/.agents/skills/`，但 Claude Code 用的是 `~/.claude/skills/`
- 默认目录跟用户日常用的 AI 工具不一致，每次都要"Install to AI Tool"
- **可以**：检测到用户安装了 Claude Code 就把默认目录设成 `~/.claude/skills/`，让 Library = Claude 的实际目录，0 配置
- **v1.1 最终方案（已落地）**：放弃"library = 某个 AI 工具目录"的耦合，改为 Skill Desktop 拥有的中央存储 `~/.skill_desktop/`，再通过软链接同步到各 AI 工具目录。Onboarding Step 2 一键完成检测 + 同步配置，0 配置目标依然达成且不绑定单一工具。

#### 🟡 Spaces 概念门槛太高
- 软链接（symlink）是开发者词
- "Active Directory" 又是另一个晦涩词
- 普通用户根本搞不懂"Library 跟 Space 有什么区别"
- **可以**：默认隐藏 Spaces，只在用户主动点 "+ New Workspace" 后才展示

#### 🟡 Skill 卡片信息密度不够
- 当前卡片只显示 name + description + tags
- 缺少：装到了哪些 AI 工具、上次更新时间、来源 logo、是否有 high-risk 权限的红点
- 应该让人**扫一眼就知道这个 skill 当前的状态**

#### 🟡 顶部搜索框只在 Library Tab 出现
- 用户期望：⌘K 在任何页面都能用、能搜任何东西（skill、space、设置）
- 当前：只搜 skill，且只在 Library 显示
- **可以**：做全局命令面板，⌘K 唤起，统一入口

#### 🟢 状态栏信息密度尚可，但配色单调
- "ready / scanning / watching / error" 四种状态用同色文案，缺乏视觉差异

#### 🟢 文件拖拽支持已加，但只在 Import dialog 里
- 用户期望：直接把 zip 拖到主窗口空白处也能触发导入
- 当前：必须先打开 Import dialog 才认拖拽

---

### 5. "像 iOS 官方软件一样丝滑"差距盘点

iOS 官方 App 之所以丝滑，靠的是 **4 件事**：

| iOS 信条 | 当前实现 | 差距 |
|---------|---------|------|
| **一个屏幕，一个目标** | 每个 Tab 都在做多件事（Library 列表 + 卡片 + Detail Drawer + Filter + Sort + Batch + Quarantine + Category 全在一屏） | **重** |
| **大字标题 + 强对比** | 现在的 Header 是 10px 高的小标题栏，缺少 hero 感 | **缺** |
| **空状态有温度** | 现在的 EmptyState 是一行小灰字 + 一个按钮 | **平** |
| **过渡动效是视觉语言** | 当前几乎没有动效（除了 spinner） | **缺** |

具体来说：

- **没有 Hero**：iOS App 总有个 16-32pt 的大标题、副标题、一个明显的 primary action。当前用户进来看到的是 6 个 ButtonGroup
- **没有 Swipe 手势**：iOS 列表都有左划删除、右划归档。当前列表只有点击 + 右键
- **没有触觉反馈/声音反馈**：不强求，但成功导入一个 skill 给个轻微的 success 音效会很提气
- **没有 hairline transitions**：界面切换是硬切，没有 fade/slide

---

### 6. 已经做对的事（继续保持）

这里**必须客观**，不能因为要写改进就否定一切：

1. ✅ **拖拽 + Scan Folder + zip/skill/folder 多源导入**（这次刚做，整个流程很顺，是产品最闪光的能力之一）
2. ✅ **risk_analyzer 自动识别 high-risk 代码**（很多同类工具都没有，是差异化护城河）
3. ✅ **文件系统是 source of truth, SQLite 是缓存**（架构正确，让用户能用 `git` 管理 skill）
4. ✅ **Install to AI Tool 的 symlink 机制**（不复制，节省空间，自动同步更新）
5. ✅ **Agent Skills 标准的完整实现**（YAML front matter / 资源目录 / 描述长度校验）

这些是产品的"内核"，不能在改造中误伤。

---

## 第二部分 · 改进计划

### 设计原则（贯穿所有 M）

1. **一句话准则**：每个屏幕用一句话能说清"我现在能干嘛"
2. **0 配置准则**：检测用户环境，默认值要让 80% 用户开箱即用
3. **隐藏 ≠ 删除**：Spaces / Sandbox / AI Tools 配置不是删掉，是收到二级入口
4. **iOS 视觉语言**：18pt+ 标题、16dp+ 留白、180ms cubic-bezier 过渡

---

### M1 · 主线收口（W1-W2，~10 天）  ✅ 已完成

**目标**：让 80% 的"安装 skill 到 AI 工具"任务**从 6 步降到 1 步**。

#### ✅ M1-1 · 引入"Home"屏作为默认首页

打开应用先看到 Home（不是 Library），包含：

```
┌──────────────────────────────────────────┐
│  Skill Desktop                         ⚙ │
│                                          │
│  Your skills, everywhere your AI is.     │
│                                          │
│  ┌──────────┐ ┌──────────┐  ┌─────────┐  │
│  │ + Skill  │ │ Browse   │  │ Drop    │  │
│  │ from a   │ │ Examples │  │ a file  │  │
│  │ folder   │ │          │  │         │  │
│  └──────────┘ └──────────┘  └─────────┘  │
│                                          │
│  Recently used                           │
│  ●  web-search       installed in Claude │
│  ●  code-formatter   installed in Cursor │
│                                          │
│  Detected AI tools                       │
│  □  Claude Code         (~/.claude/...) │
│  □  Cursor              (~/.cursor/...) │
│  □  OpenCode            (~/.config/...) │
└──────────────────────────────────────────┘
```

**已落地**：

- 新增 `src/views/HomeView.tsx`（~370 行）
- `appStore.currentView` 默认从 `"library"` 改为 `"home"`
- Sidebar/Header/快捷键（⌘1）全部接入新首页
- 后端新增 `detect_ai_tools` 命令（`src-tauri/src/commands/mod.rs`）：返回每个 AI 工具目录是否存在 + 内含 skill 数量
- 前端 `useDetectAiTools` / `useAllSkillInstallations` hooks
- 首页包含：Hero 标题 + 4 张 Quick Action 卡 + Detected AI Tools 卡阵 + Library 摘要卡 + Recent Skills 列表

#### ✅ M1-2 · "拖入即装"快速通道

在 Home 屏和 Library 屏，全局监听 `tauri://drag-drop`：

- 拖入 skill folder/zip/.skill 后弹一个轻量 sheet（不是 dialog）：
  ```
  ✓ Found 1 skill: web-search
  
  Install to:
  ☑ Claude Code
  ☐ Cursor
  ☐ OpenCode
  
  [ Install ]
  ```
- 默认勾选用户上次装到的 AI 工具
- 一键完成"import + install to tool"两步

**已落地**：

- 新增 `src/components/QuickInstallSheet.tsx`（~430 行）
- 在 App.tsx 顶层挂载，**全局**监听 `tauri://drag-drop`，bail 出 ImportSkillDialog 已开的情况避免双触发
- 拖入后自动 preview（multi-file 并行）→ 列出每个 skill + 风险等级 → 用户勾选目标 AI 工具 → 一键 import + 多个 `install_skill_to_tool`
- 用户选择会自动持久化到 `autoInstallTargets`，下次拖入直接默认勾选
- `appStore` 新增 `importDialogActive` flag，配合 ImportSkillDialog 协调

#### ✅ M1-3 · 默认 Library 路径智能匹配用户环境

启动时检测用户系统：

| 检测条件 | 默认 library_path |
|---------|-------------------|
| 装了 Claude Code 且 `~/.claude/skills/` 存在 | `~/.claude/skills/`（这样 library 就是 Claude 的目录，跳过 install 步骤） |
| 装了 Cursor 且 `~/.cursor/skills/` 存在 | `~/.cursor/skills/` |
| 都没装 / 多个都装了 | `~/.skill_desktop/`（v1.1 起，Skill Desktop 拥有的中央存储） |

**v1.1 已落地（最终方案）**：

- 默认 library path 改为 **`~/.skill_desktop/`**（Skill Desktop 拥有、与任何 AI 工具目录解耦的中央存储）
- 各 AI 工具目录通过软链接同步：`~/.claude/skills/`、`~/.cursor/skills/`、`~/.codex/skills/`、`~/.gemini/skills/`、`~/.agents/skills/` 等
- 后端 `AppSettings` 增加 `auto_install_targets: Vec<String>` 字段（向后兼容 `#[serde(default)]`），存储用户偏好的自动装机目标
- 前端 `AppSettings.autoInstallTargets?: string[]`
- 首页和 QuickInstallSheet 都通过 `useDetectAiTools` 展示用户系统的真实 AI 工具状态
- Onboarding 首启时把检测到的工具自动写入 `autoInstallTargets`，新技能落到 `~/.skill_desktop/` 后立即软链到这些目标

#### ✅ M1-4 · Skill 卡片显示"装在了哪"

每个 skill 卡片右上角加 4-6px 的小图标 row：

```
┌─────────────────────────────┐
│ web-search        🅒 🅒 _    │
│ Search the web and...        │
│ #search #web                 │
└─────────────────────────────┘
```

🅒 = 已装到 Claude，灰色 = 未装。点 badge 直接 toggle 安装状态。

**已落地**：

- 新增 `src/components/library/SkillInstallBadges.tsx`，按检测到的 AI 工具渲染圆点 badge，**点击直接切换** install / uninstall（不用跳 Install dialog）
- 接入到 `SkillCard.tsx`（grid 视图）和 `SkillListItem.tsx`（list 视图，compact 模式）
- 复用单次 `useAllSkillInstallations` 全量查询，避免每张卡 N+1
- 圆点颜色：已装=蓝色填充、未装=灰色描边

---

### M2 · IA 瘦身（W3，~5 天）  ✅ 已完成

**目标**：把 5 个顶层 Tab 砍到 3 个 + 抽屉，把 11 个子 Tab 砍到 5 个。

#### ✅ M2-1 · 顶层导航重排

```
当前                  → 改造后
─────────────────────────────────
Library              → Skills          （唯一主线）
Spaces               → (折叠到 Skills 顶部的下拉切换器)
Sandbox              → (移到每个 skill detail 的 Run 按钮)
AI Tools             → Integrations    （只剩 config 不剩 install）
Settings             → ⚙ Icon Drawer
                      + Home            （新主页）
```

最终：**Home / Skills / Integrations**（3 个），齿轮在右上角。

**已落地**：`src/components/layout/Sidebar.tsx` 删除 Spaces / Sandbox 顶层项；Header 子标题改为 view-aware；语义保留 spaces / sandbox 视图但只能通过 SkillDetail 的 Play 按钮 / WorkspaceSwitcher 的 Manage… 进入。

#### ✅ M2-2 · Spaces 改成"切换器"而非 Tab

在 Skills 视图顶部加一个 dropdown："`Default Workspace ▾`"，里面：
- 列出所有 spaces，点击切换
- "+ New Workspace" 在底部
- 高级用户的功能不打扰新手

**已落地**：新增 `src/components/spaces/WorkspaceSwitcher.tsx`，嵌入 LibraryView header；"Manage workspaces..." 跳回完整 SpacesView。

#### ✅ M2-3 · Sandbox 收敛到 Skill Detail

skill detail 页面加 "Run" Tab（与 Overview / Security 并列）：
- 点 Run，加载该 skill 的 scripts
- 输入参数 → Execute（同当前 SandboxView 逻辑）
- 删除 Top-level Sandbox Tab

**已落地（轻量方案）**：
- SkillDetail 加入 Play (▶) 按钮，点击后通过 `appStore.pendingSandboxSkillHash` 把当前 skill 预选给 SandboxView，再 `setCurrentView("sandbox")` 跳过去
- Sidebar 已删除 sandbox 顶层项
- 保留 SandboxView 整套调试逻辑（参数 / scripts / history / 高风险确认）—— 全部精力放在主流程而不重写 Sandbox

#### ✅ M2-4 · AI Tools 拆分

当前 AI Tools 同时管 2 件事：
- **A. Config 文件管理**（编辑 `CLAUDE.md` / Cursor rules / OpenCode `AGENTS.md`） → 放到 `Integrations`
- **B. Skill 装机** → 已经在 SkillCard / SkillDetail 里了，删掉重复入口

`Integrations` 视图只剩：
- 每个 AI 工具一张卡，显示 "Configured / Not Configured"
- 点进去能编辑该工具的 system prompt / rules
- 显示该工具当前装的 skill 数

**已落地**：
- i18n `nav.aitools` 改为 "Integrations" / "集成"
- Header 子标题 / Sidebar / CommandPalette 全部展示新名字
- 安装重复入口已经在 M1-4 SkillCard badges 收敛，AIToolsView 内容保持纯 config 编辑

#### ✅ M2-5 · Import dialog 6 Tab → 2 Tab

```
当前                       → 改造后
──────────────────────────────────
Local · Examples · URL ·   → Local   （folder/zip/.skill/md, 含拖拽）
GitHub · MCP · Registry      Discover（URL + GitHub + MCP + Registry 合并搜索）
```

`Discover` 是一个统一的搜索框 + 标签筛选：

```
[search bar: anthropics, mcp.so, glama, github...]

[Tag: Featured · MCP · GitHub · Url · ...]

(grid of cards)
```

**已落地（稳妥方案）**：保留 6 个 panel 的底层逻辑（每个 panel 的 URL / GitHub / MCP / Registry / Examples 接入差异较大，强行合并代码会破坏现有正常逻辑），但在 dialog sidebar 把它们视觉上压成两个分组标题（Local / Discover），降低用户的认知负担。后续如需要可单独做 DiscoverPanel 统一搜索。

---

### M3 · 视觉与交互打磨（W4，~5 天）  ✅ 已完成

**目标**：用户用 5 分钟就有 "wow, this feels like a real Apple app" 的感觉。

#### ✅ M3-1 · Header 重做：从 10px 小标题 → iOS Large Title

```
当前 Header (h-10, 10px font)：
┌──────────────────────────────┐
│ Library    [search][grid][⟳]│  ← 紧凑、灰、扁
└──────────────────────────────┘

iOS-Style：
┌──────────────────────────────┐
│                              │
│  Skills                      │  ← 28pt semibold, 黑
│  127 in your library         │  ← 13pt regular, 灰
│                              │
│              [search] [⟳] [+]│  ← actions 右对齐
└──────────────────────────────┘
```

- Large Title 高度 64-80px
- 列表滚动时 Large Title 收起，title 移到中间小条（iOS 标准 collapse 行为）

**已落地**：Header 改为两行布局，顶部 40px 紧凑栏（search / 视图切换 / rescan），底部 Large Title 行（24pt semibold + 视图相关副标题，例如 "127 skills in your library"）。Home 视图已自带 hero 区域，因此在 Home 自动隐藏 Hero 行避免重复。

> Note：滚动时折叠到中间小条的行为暂未实现（需要 IntersectionObserver / 自定义 scrollbox），后续可作单独 polish。

#### ✅ M3-2 · 卡片重做：从扁卡 → 立体卡

- 阴影：当前 `border` 改为 `shadow-sm + border-bottom`，hover 时变 `shadow-md`
- 圆角：4px → 12px
- 留白：内边距 12px → 16px
- 字号：title 14px → 15px medium，desc 13px

**已落地**：SkillCard 圆角从 `rounded-lg`（8px）改为 `rounded-xl`（12px），shadow `sm` → hover 时 `shadow-lg` + 上移 `translate-y -0.5`；transition 加上 `ease-out` 150ms 让上浮有物理感。

#### ✅ M3-3 · 空状态有温度

每个空状态都做一个"有人物 / 有动作"的提示：

```
当前：
   📁
   No library directory set

iOS-Style：
   ┌──────────────┐
   │      ✨      │   ← 大插画或大 emoji
   └──────────────┘

   No skills yet

   Drag a folder here to get started, or
   browse our examples to see what skills look like.

   [Drop area]                    [Browse Examples]
```

**已落地**：`EmptyState` 圆形 icon 容器换上了 `bg-gradient-to-br from-accent-blue/15 via-accent-purple/10` + shadow-sm + ring，整体语感从"灰色提示"变"轻盈引导"。Home 上的空 recent skills 区块也写了温暖文案 ("No skills yet — import one above to get started.")。

#### ✅ M3-4 · 过渡动效

使用 `framer-motion` 或 CSS `transition`：

| 场景 | 动效 |
|------|------|
| Tab 切换 | 180ms fade + 8px slide |
| Dialog 打开 | 250ms scale 0.96→1 + fade |
| 卡片 hover | 120ms shadow transition |
| Detail panel 滑入 | 220ms slide-from-right |
| Success toast | 1.5s spring scale + fade out |

**已落地**：`src/index.css` 新增 motion tokens (`--motion-fast/base/slow`, `--ease-ios`) + utility classes (`.transition-ios`, `.animate-view-in`)。MainLayout 通过 `key={currentView}` 让 view 切换触发 fade + translate-y 重新播放（180ms）。卡片 hover 已经在 SkillCard 用了 ease-out 150ms。复杂的滚动折叠 / spring toast 留待后续 polish。

#### ✅ M3-5 · 全局命令面板（⌘K）

不管在哪个 Tab，按 ⌘K 弹出全屏半透明的 command palette：

```
[ ▢ Search skills, spaces, settings... ]

   Skills (3)
   ▢  web-search
   ▢  code-formatter
   ▢  ai-summarizer

   Actions
   ▢  Import a skill...
   ▢  New workspace...
   ▢  Open settings...

   Spaces (2)
   ▢  Default
   ▢  My SaaS project
```

Raycast 式的快速访问。比当前的 search 框强 10 倍。

**已落地**：新增 `src/components/CommandPalette.tsx`（~330 行）—— 自研轻量实现（不引入 cmdk），支持：fuzzy 子序列匹配 / 上下方向键导航 / Enter 执行 / Esc 关闭 / Skills + Workspaces + Go to (views) + Actions 四组结果 / 命令计数。挂载在 App.tsx，⌘K 在任何视图都能召唤。

#### ✅ M3-6 · 首启 Onboarding

第一次启动除了选语言（已有），再加 3 步：

1. **"Where do you want your skills to live?"** 自动推荐路径，一键确认
2. **"Which AI tools do you use?"** 显示检测到的 AI 工具，让用户勾选默认装机目标
3. **"Try a sample skill"** 一键导入 anthropics/skills 里的 `frontend-design`，让用户感受到"哦原来这样"

**已落地**：
- 新增 `src/components/onboarding/OnboardingWizard.tsx`（~470 行）
- 三步精确对应规划：library 路径 / AI 工具勾选 / 一键导入 frontend-design 并自动安装到选中的 AI 工具
- App.tsx 启动逻辑改为：语言已选 + setup 未完成 → 直接跳到 onboarding（崩溃恢复友好）
- 用户选择会持久化到 `auto_install_targets` —— 后续每次 QuickInstallSheet 默认勾选同一组

---

### 优先级矩阵

按 ROI（产品价值 / 工程量）排序：

| # | 项目 | 价值 | 工程量 | 优先级 | 状态 |
|---|------|------|--------|--------|------|
| 1 | M1-2 拖入即装 | ⭐⭐⭐⭐⭐ | 中 | **P0** | ✅ 完成 |
| 2 | M1-1 Home 屏 | ⭐⭐⭐⭐⭐ | 中 | **P0** | ✅ 完成 |
| 3 | M1-3 智能默认路径 | ⭐⭐⭐⭐ | 小 | **P0** | ✅ 完成 |
| 4 | M1-4 卡片 install badge | ⭐⭐⭐⭐ | 小 | **P0** | ✅ 完成 |
| 5 | M3-6 首启 onboarding | ⭐⭐⭐⭐ | 中 | P1 | ✅ 完成 |
| 6 | M2-1 顶层导航瘦身 | ⭐⭐⭐⭐ | 大 | P1 | ✅ 完成 |
| 7 | M3-5 全局命令面板 | ⭐⭐⭐ | 中 | P1 | ✅ 完成 |
| 8 | M3-1 Large Title | ⭐⭐⭐ | 中 | P1 | ✅ 完成 |
| 9 | M2-5 Import dialog 合并 | ⭐⭐⭐ | 中 | P2 | ✅ 完成（分组方案）|
| 10 | M2-2 Spaces 改 switcher | ⭐⭐⭐ | 中 | P2 | ✅ 完成 |
| 11 | M2-3 Sandbox 收敛 | ⭐⭐ | 中 | P2 | ✅ 完成（轻量方案）|
| 12 | M2-4 AI Tools 拆分 | ⭐⭐ | 大 | P2 | ✅ 完成（命名收敛）|
| 13 | M3-2/3/4 视觉细节 | ⭐⭐ | 中 | P3 | ✅ 完成 |

---

## 第三部分 · 成功指标

不能凭感觉判断改完是否成功。下面是可量化的指标，全部在客户端埋点（不上传）即可观测：

| 指标 | 当前 | 目标 |
|------|------|------|
| **TTI**：首次启动到第一个 skill 装到 AI 工具的耗时 | 估计 5-8 分钟（含猜测、试错） | < 60 秒 |
| **入门完成率**：onboarding 走到底的比例 | N/A（没 onboarding） | > 70% |
| **重复访问率**：7 天内打开 ≥ 3 次的用户占比 | 未知 | > 40% |
| **核心动作占比**：drag-drop 导入占所有导入操作的比例 | 0%（刚刚加） | > 50% |
| **错误退出**：用户在哪个屏放弃使用 | 未知 | 监控 60s 内无操作的退出页 |

---

## 第四部分 · 一句话总结

> 当前的 Skill Desktop 是一个**功能完整的开发者工具**，缺一步成为**所有 AI 用户都能用的官方级产品**。
>
> 改进的方向不是"加更多功能"，而是"少 = 多"：
>
> - 把"管理"重写成"开关"
> - 把"5 个 Tab"压到"3 个 Tab + 1 个抽屉"
> - 把"6 步流程"压到"1 个拖拽"
> - 把"扁平 UI"换成"iOS 级视觉"
>
> 这是一份"砍掉 30% 表面、突显 100% 内核"的计划。

---

## 第五部分 · 落地实况（截至 2026-05-21）

13 个规划项已全部完成。Backend 50/50 测试通过，frontend TypeScript 0 error。

### 5.1 首轮交付（M1-M3 全部完成）

```
新增文件
  src/views/HomeView.tsx
  src/components/QuickInstallSheet.tsx
  src/components/CommandPalette.tsx
  src/components/onboarding/OnboardingWizard.tsx
  src/components/onboarding/index.ts
  src/components/spaces/WorkspaceSwitcher.tsx
  src/components/library/SkillInstallBadges.tsx

修改文件
  src-tauri/src/commands/mod.rs   (+detect_ai_tools, AppSettings.auto_install_targets)
  src-tauri/src/lib.rs            (register detect_ai_tools command)
  src/App.tsx                     (CommandPalette + Onboarding wiring)
  src/stores/appStore.ts          (importDialogActive / pendingSandboxSkillHash / commandPaletteOpen / view "home")
  src/components/layout/Sidebar.tsx       (从 5 Tab 砍到 3 Tab)
  src/components/layout/Header.tsx        (iOS Large Title)
  src/components/layout/MainLayout.tsx    (view-switch fade-in)
  src/components/library/SkillCard.tsx        (+install badges, 圆角 12px, hover 上浮)
  src/components/library/SkillListItem.tsx    (+install badges)
  src/components/library/SkillDetail.tsx      (+Play 按钮)
  src/components/library/ImportSkillDialog.tsx (+defaultSource prop, sidebar 分组)
  src/views/LibraryView.tsx       (+WorkspaceSwitcher)
  src/views/SandboxView.tsx       (消费 pendingSandboxSkillHash)
  src/hooks/useInstall.ts         (+useAllSkillInstallations, useDetectAiTools)
  src/hooks/useAppSettings.ts     (+autoInstallTargets 字段)
  src/components/ui/empty-state.tsx (gradient halo)
  src/index.css                   (motion tokens + view-fade-in 动效)
  src/i18n/locales/{en,zh-CN}.json (~80 个新 key)
```

> 整个改动**严格保留了既有功能**：Spaces / Sandbox / 6 个 Import panel 全部继续可用，只是隐藏到次要路径，让主流程变得"打开即懂"。

### 5.2 二轮深化（把"轻量方案"重构为正经实现）

第一轮里有 4 个项目是为了不破坏现有逻辑做的"压缩方案"。第二轮把它们做到位，并且补了 1 个新的体验项：

| ID | 第一轮做了什么（轻量） | 第二轮做了什么（深化） |
|---|---|---|
| **Toast 系统**（新） | 无 | `src/components/ui/toast.tsx` 全局 toast 栈（Zustand 驱动，可在 React 外通过 `toast.success/error()` 调用）。QuickInstall 完成 / SkillInstallBadges 装卸载 / RunTab 跑脚本 / DiscoverPanel 导入 / HomeView 批量装机：所有原先 `console.error` 的位置现在都浮出可见反馈 |
| **M2-3 Run Tab** | SkillDetail Play 按钮跳到 SandboxView | SkillDetail 直接新增 Run Tab：内联脚本选择 + 参数表单 + 高风险确认 + 结果显示。Play 按钮改为切到 Run Tab；保留"Open full sandbox view"链接让重度用户继续走 SandboxView |
| **M2-4 Integrations** | 仅重命名 AI Tools → Integrations | ToolHeader 升级为带状态条的卡片：显示当前工具检测状态（Detected / Not installed）+ 已装机 skill 数 + 打开 `~/.X/skills/` 目录的快捷按钮。复用 `detect_ai_tools` + `useAllSkillInstallations` |
| **M2-5 Discover** | 6 Tab 视觉分两组（Local / Discover） | 新增 `DiscoverPanel`：把 Examples 和 Registry 真正合并成一个统一搜索框，跨源联邦搜索（输入关键字同时过滤 Anthropic Examples + MCP 注册表），用 filter chip 切来源；GitHub / URL / MCP 仍是独立 panel（它们的交互不是搜索而是粘 URL）。Import dialog Sidebar 从 6 项压到 5 项（Local / Discover / GitHub / URL / MCP） |
| **M3-1 Header 滚动收起** | 仅渲染 Large Title 静态布局 | 加入 iOS 标准的"滚动折叠"行为：用 capture-phase 滚动监听追任意 `<main>` 内的滚动容器，scrollTop>6 时 hero 段 max-height/opacity 渐隐，紧凑 title 滑入 utility 栏，反之恢复。无需视图改造 |
| **HomeView 智能建议**（新） | 无 | 检测到"用户有 skill 但未装到任何 AI 工具" + "用户在 QuickInstallSheet 里保存过偏好" 时，Home 顶部出现一张 gradient 卡片：「N skills are not yet installed → Install all」，一键批量装机+toast 汇总 |

#### 5.2 涉及文件

```
新增文件
  src/components/ui/toast.tsx                       (Toaster + imperative `toast.*` API)
  src/components/library/detail/RunTab.tsx          (SkillDetail 内联 Run 视图)
  src/components/hub/DiscoverPanel.tsx              (统一搜索 / 联邦结果)

修改文件
  src/App.tsx                                       (挂载 Toaster)
  src/components/ui/index.ts                        (导出 toast)
  src/components/QuickInstallSheet.tsx              (完成汇总 toast)
  src/components/library/SkillInstallBadges.tsx     (装卸载 toast)
  src/components/library/SkillDetail.tsx            (Run tab 接入 + Play 按钮改为切 tab)
  src/components/library/detail/index.ts            (导出 RunTab)
  src/components/library/ImportSkillDialog.tsx      (Discover 替代 Examples+Registry，删 200+ 行)
  src/components/hub/index.ts                       (导出 DiscoverPanel)
  src/views/HomeView.tsx                            (智能建议 banner + 批量装机)
  src/views/AIToolsView.tsx                         (ToolHeader 加状态条 + 装机数 + 打开目录)
  src/components/layout/Header.tsx                  (滚动折叠 Large Title)
  src/i18n/locales/{en,zh-CN}.json                  (+~40 个新 key: discover.*, integrations.*, home.suggestion.*, skillCard.toast.*, quickInstall.toast.*, skillDetail.run.*, skillDetail.tabs.run)
```

### 5.3 三轮深化（围绕"更可发现 / 更可控 / 更可访"的体验补完）

第二轮把核心交互做厚之后，第三轮针对"普通用户摸不到的高价值能力"做主动暴露，并对刚做完的体验做一遍 a11y / 动效审计：

| ID | 触发动机 | 这一轮实现 |
|---|---|---|
| **HomeView Updates Banner**（新） | 用户从 GitHub / URL 导入的 skill 永远不知道有没有新版本 | Library 卡片加一个第三按钮 (Download)，触发 `check_all_skill_updates`，结果做成 Home 顶部 collapsible 卡，按 skill 名/sourceUrl 列出 + "全部更新"；检查结果和 `checkedAt` 写入 Zustand store（`skillUpdates / appliedUpdateHashes`），所以 HomeView / SettingsView 之间共享同一份缓存，切回 Home 仍能看到上次结果 |
| **后端 `update_skill_from_url`**（新） | `import_skill_from_url` 在目录已存在时直接报错，所有"应用更新"路径在它之上都是坏的 | 新增独立 Tauri 命令 `update_skill_from_url(current_hash, source_url)`：根据 hash 在 library 里定位现有目录、覆盖 SKILL.md、保留原目录名（让 AI 工具上的 symlinks 继续生效）、重新 scan 出新 hash；SkillDetail / HomeView Updates Banner / SettingsView UpdatesPanel 全部迁到 `useUpdateSkillFromUrl` hook |
| **Onboarding 零工具引导**（新） | 第一次开 App 但本机没装任何 AI CLI 时，Step 2 是死路 | StepTools 在每个 `!exists` 的行渲染"Install" 链接，点击调 `plugin:opener|open_url` 开官方安装指引（Claude Docs / Cursor 下载页 / Codex repo / Gemini CLI repo）；列表下方追加"没工具也没关系：技能仍会落到 `~/.skill_desktop/`，之后随时同步到任意 AI 工具"的 fallback banner |
| **? 快捷键速查表**（新） | ⌘K / ⌘1-6 等已经实现但没人发现 | 新增 `<ShortcutsHelp />` 组件挂在 App 根，全局 keydown 拦截 `?`（非输入焦点时）打开 Dialog；按平台显示 `⌘` vs `Ctrl`；Settings 也新加 Shortcuts 类目，按钮链接到同一个 Dialog |
| **Settings 类目分组**（新） | 6 个原始类目是平铺的，扫不出主次 | sidebar 改为 General / Integrations / System 三段；新增 Updates（独立面板：手动 Check + 上次时间 + 可更新/已是最新/失败三栏）和 Shortcuts 两个类目；总条目 6→8，但视觉密度反而更轻 |
| **Library 批量装机**（新） | 已有批量删除/隔离/导出，唯独缺批量"装到 AI 工具" | Selection toolbar 新增 "Install to…" 按钮，弹出选 AI 工具的 dialog，逐条 install + toast 汇总（成功 N 个 / 失败 M 个）；只显示 `exists` 的工具，避免装到空目录 |
| **Toast Spring 物理动画** | view-fade-in 是 4px translate + opacity，所有 surface 都用它，toast 看起来像普通弹层 | 新增 `@keyframes spring-in-right`，分 4 段（28px → -4px overshoot → 1.5px settle → 0），cubic-bezier(0.22, 1, 0.36, 1) 380ms；`prefers-reduced-motion` 自动降级为 160ms fade |
| **A11y 一轮** | 多个 icon-only Button 没 aria-label，screen reader 念出来是空白 | Button 组件 dev 模式下侦测 icon-only 缺 aria-label/title/aria-labelledby 时 console.warn；Header / SkillDetail / Toaster / SpacesView / GitHubImportPanel / FileEditorDialog / SkillPreviewPanel 全量补 aria-label + aria-hidden；Toast `tone="error"` 用 `role=alert`/`aria-live=assertive`，其他用 `role=status`/`aria-live=polite`；关闭按钮 focus-visible 加 ring |

#### 5.3 涉及文件

```
新增文件
  src/components/ShortcutsHelp.tsx                  (? 快捷键速查表 Dialog)

修改文件
  src-tauri/src/commands/mod.rs                     (新增 update_skill_from_url 命令)
  src-tauri/src/lib.rs                              (invoke_handler 注册 update_skill_from_url)
  src/hooks/useImport.ts                            (新增 useUpdateSkillFromUrl)
  src/hooks/index.ts                                (导出 useUpdateSkillFromUrl)
  src/components/library/SkillDetail.tsx            (Update 按钮迁到 useUpdateSkillFromUrl，修原本就 broken 的"目录已存在"错误)
  src/App.tsx                                       (挂载 ShortcutsHelp + ? keydown 处理)
  src/stores/appStore.ts                            (shortcutsHelpOpen state + skillUpdates 跨视图缓存)
  src/views/HomeView.tsx                            (Updates banner + Check 按钮)
  src/views/LibraryView.tsx                         (Selection 加 Install + batchInstall dialog)
  src/views/SettingsView.tsx                        (类目分组 + UpdatesPanel + ShortcutsPanel)
  src/components/onboarding/OnboardingWizard.tsx    (StepTools 加 Install 链接 + 零工具 banner)
  src/components/ui/toast.tsx                       (spring 动画 + a11y 角色细化)
  src/components/ui/button.tsx                      (dev-only icon-only a11y warn)
  src/index.css                                     (@keyframes spring-in-right + prefers-reduced-motion 降级)
  src/components/layout/Header.tsx                  (viewMode / rescan 按钮 aria-label)
  src/components/library/SkillDetail.tsx            (copy / close / quarantine / delete 按钮 aria-label)
  src/components/hub/SkillPreviewPanel.tsx          (close aria-label)
  src/components/hub/GitHubImportPanel.tsx          (back aria-label)
  src/components/editor/FileEditorDialog.tsx        (close aria-label)
  src/views/SpacesView.tsx                          (new-space aria-label)
  src/i18n/locales/{en,zh-CN}.json                  (~50 个新 key: shortcuts.*, home.updates.*, settings.updates.*, settings.shortcuts.*, settings.group.*, library.batchInstall.*, library.selection.install, onboarding.step2.installCli/noneInstalled*, skillDetail.copyName*)
```

### 5.4 当前体验地图

| 用户目标 | 现在的路径 |
|---|---|
| 安装一个新 skill | 拖任意文件到窗口 → QuickInstallSheet → 一键搞定 |
| 浏览推荐 skill | 任何"Import"入口 → Discover Tab → 统一搜索 |
| 装到 AI 工具 | SkillCard 上点字母 badge ✓ 或 Detail Install 按钮 |
| 批量装到 AI 工具 | LibraryView Selection mode → "Install to…" → 选工具 |
| 卸载 | 同一个 badge 再点一下，toast 确认 |
| 运行脚本验证 | SkillDetail Run Tab，内联参数 + 一键 Execute |
| 检查 / 应用更新 | Home Library 卡 Download 按钮 → Updates banner，或 Settings → Updates 看完整列表 |
| 快速跳转 / 全局命令 | ⌘K，输入 skill / space / 操作名 |
| 查看所有快捷键 | 按 `?` 或 Settings → Shortcuts |
| 切换工作空间 | LibraryView 顶部 WorkspaceSwitcher dropdown |
| 编辑 Claude/Cursor/OpenCode 配置 | Integrations 视图（每个工具页面顶部有装机数 + 打开目录） |
| 第一次开还没装 AI CLI | Onboarding Step 2 行内"Install" 链接打开官方安装指引 |

所有"我没看到"的功能（Sandbox / Spaces / OpenCode config）都通过更合理的路径保留，主导航只剩 **Home · Skills · Integrations · Settings** 4 项。

---

## 附录：交付清单（M1 落地后该有的代码增量）

预估每个 milestone 的代码变更范围（供工程排期参考）：

```
M1（最高 ROI）
  src/views/HomeView.tsx                       (新增 ~250 行)
  src/components/QuickInstallSheet.tsx         (新增 ~180 行)
  src/components/library/SkillCard.tsx         (改 ~30 行)
  src-tauri/src/lib.rs                         (改 ~20 行：智能默认路径)
  src/i18n/locales/*.json                      (新增 ~50 key)
  ─────────────────────────────────────────────
  总计：~500 行新增、~50 行修改

M2（结构性重构）
  src/components/layout/Sidebar.tsx            (-spaces, -sandbox)
  src/views/AIToolsView.tsx                    (拆分为 IntegrationsView + 移到 SkillDetail.RunTab)
  src/components/library/ImportSkillDialog.tsx (Discover 合并)
  src/views/SpacesView.tsx                     (改为 dialog + switcher，去除 top-level view)
  ─────────────────────────────────────────────
  约 -800 行（删除重复）+~400 行（新组件）

M3（打磨）
  src/components/layout/Header.tsx             (Large Title)
  src/components/CommandPalette.tsx            (新增 ~300 行)
  src/components/Onboarding/                   (新增 ~400 行)
  src/index.css                                (新增 transition tokens)
  ─────────────────────────────────────────────
  约 ~800 行新增
```

总变更预算：**~2000 行**，分 4 周完成，每个 milestone 都能独立 release（保证主干始终可用）。
