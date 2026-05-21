# Local Skill Import — Tech Design

> 版本: 1.0.0
> 状态: Draft
> 关联模块: `Library Manager` / `Skill Hub`

---

## 1. 背景

当前 `Skill Desktop` 已支持以下导入来源：

- URL（单个 SKILL.md）
- GitHub 仓库（单个 skill / 整个目录批量）
- MCP Server（拉取工具列表）
- MCP Registry（Glama 等）

但对**本地源**的支持还很弱：用户只能通过设置 Library 目录把已有的 skill 目录"放进来"，无法直接通过对话框：

- 选一个 **skill 文件夹**（包含 `SKILL.md`）导入
- 选一个 **`.zip`** 压缩包导入
- 选一个 **`.skill`** 后缀的打包文件导入（本质也是 zip）
- 一次性 **批量**选择多个上面所有格式 / 拖拽进来
- 选一个**父目录**，扫描里面的所有 skill 然后挑选导入

这份文档定义了上面这套"本地导入"能力的接口、UI 与数据流。

---

## 2. 文件格式约定

按 Agent Skills 规范 (<https://agentskills.io/specification>) ，一个 skill 在磁盘上的最小形态：

```
my-skill/
├── SKILL.md          # 必需，包含 YAML front matter
├── scripts/          # 可选
├── references/       # 可选
└── assets/           # 可选
```

本次新增支持的源格式：

| 格式 | 识别方式 | 处理策略 |
|------|---------|----------|
| **Folder** | `path.is_dir()` 且包含 `SKILL.md` | 直接复制到 library |
| **ZIP** | 扩展名 `.zip` | 解压到临时目录，找其中的 `SKILL.md` 然后复制 |
| **`.skill`** | 扩展名 `.skill` | 与 ZIP 同处理（按 zip 解压） |
| **Loose markdown** | 单个 `.md` 文件且有合法 front matter | 包装成 `<name>/SKILL.md` 再放进 library |

> 一个 ZIP/`.skill` 包**可以**包含多个独立的 skill 文件夹（每个里面都有 `SKILL.md`）；解压后我们会把所有命中的 skill 都导入。

### 2.1 ZIP 内结构兼容

```
case A: 单 skill / 单顶层文件夹
my-skill.zip
└── my-skill/
    └── SKILL.md

case B: 单 skill / SKILL.md 直接在根
my-skill.zip
└── SKILL.md            # 用文件名（去后缀）作为目录名

case C: 多 skill
bundle.zip
├── skill-a/SKILL.md
├── skill-b/SKILL.md
└── skill-c/SKILL.md
```

判定算法：解压后递归找 `SKILL.md`，每一个 `SKILL.md` 的**所在目录**就是一个 skill。如果 `SKILL.md` 直接在解压根目录，则用 zip 文件名作为 skill 名。

---

## 3. 安全约束

- 所有用户提供的 skill 名都要走现有的 `sanitize_skill_name()`（小写 + 仅 `[a-z0-9-]` + 长度 ≤ 64）。
- ZIP 解压必须防 zip-slip：每条目的目标路径必须仍在解压根内。
- 单个 zip 解压总字节数上限 **100 MB**，单文件上限 **20 MB**，超出报错。
- 导入完成后才把扫描结果写入 library；中途失败要清理临时目录。
- 已存在同名目录时**不覆盖**，按"已跳过"计数返回。
- 不静默执行 zip 中的 scripts，仅复制；后续在 Library 视图里跑现有的 `risk_analyzer`。

---

## 4. 后端设计

### 4.1 依赖

新增一个依赖（`src-tauri/Cargo.toml`）：

```toml
zip = { version = "2", default-features = false, features = ["deflate"] }
```

只启用 `deflate`，避免拉进 bzip2/zstd 等大依赖。

### 4.2 模块结构

新增 `src-tauri/src/scanner/local_import.rs`，作为纯逻辑层：

```rust
pub enum LocalSource {
    Folder(PathBuf),
    Markdown(PathBuf),
    Archive(PathBuf),  // .zip / .skill
}

pub struct LocalSkillCandidate {
    pub path: String,             // 原始路径或临时解压路径
    pub source_type: String,      // "folder" | "zip" | "skill" | "markdown"
    pub name: String,             // 来自 frontmatter 的原始名
    pub safe_name: String,        // sanitize 后的目录名
    pub description: String,
    pub valid: bool,
    pub error: Option<String>,
}

pub fn detect_source(path: &Path) -> Option<LocalSource>;
pub fn extract_archive(archive: &Path, dest: &Path) -> Result<(), String>;
pub fn discover_candidates_in(dir: &Path) -> Vec<LocalSkillCandidate>;
pub fn ingest_one(source: LocalSource, library: &Path) -> Result<Skill, String>;
```

`Tauri` 命令在 `src-tauri/src/commands/mod.rs` 里：

```rust
preview_local_skill(path)              // -> SkillPreview（已有结构复用）
import_local_skill(path)               // -> Skill
import_local_skills_batch(paths)       // -> ImportResult { imported, skipped, errors }
scan_directory_for_skills(path)        // -> Vec<LocalSkillCandidate>
```

### 4.3 ZIP 解压策略

1. 创建临时目录：`std::env::temp_dir().join(format!("skill-import-{}", uuid))`
2. 用 `zip::ZipArchive` 遍历，每条目：
    - 用 `entry.enclosed_name()` 拒绝 zip-slip
    - 累计字节超 `MAX_TOTAL_BYTES (100 MB)` 报错
    - 单条目超 `MAX_FILE_BYTES (20 MB)` 跳过
    - 写到 `tmp/<entry_path>`
3. 在解压目录里跑 `discover_candidates_in()`
4. 对每个 candidate 调 `ingest_one()` 复制到 library
5. 删除临时目录

### 4.4 名字冲突

- 默认策略：**跳过**（与 `import_github_skill_inner` 行为一致），并把目录名作为 `skipped` 返回。
- 不做自动 rename（避免悄悄产生 `my-skill-2`，让用户糊涂）。
- 前端通过返回的 `errors` / `skipped` 数提示用户。

---

## 5. 前端设计

### 5.1 在 Import 对话框中新增 "Local" 来源

`ImportSkillDialog.tsx` 的左侧 Source 列表新增第一个 tab `Local`（图标用 `lucide-react` 的 `HardDrive`），位置在 `Examples` 之前。

```
Local        <-- NEW
Examples
URL
GitHub
MCP
Registry
```

### 5.2 LocalImportPanel 操作流程

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│   [drag & drop zone]   "Drop folders, .zip or         │
│                          .skill files here"            │
│                                                        │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│   │ Select Files │ │Select Folder │ │ Scan Folder  │   │
│   └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                        │
│   ── Candidates ───────────────────────────────────    │
│   ☑ frontend-design     folder   ./skills/frontend...  │
│   ☑ mcp-builder         zip      ./bundle.zip          │
│   ☐ webapp-testing      .skill   ~/Downloads/web...    │
│                                                        │
│   [Import All Selected]                                │
└────────────────────────────────────────────────────────┘
```

三种入口：

1. **Select Files**：`@tauri-apps/plugin-dialog.open({ multiple: true, filters: [{ name: 'Skill', extensions: ['zip', 'skill', 'md'] }] })`
2. **Select Folder**：`open({ directory: true, multiple: true })` → 每个目录会先尝试当成 single skill，如果不是再变成"扫描候选源"
3. **Scan Folder**：`open({ directory: true })` → 调用 `scan_directory_for_skills` → 列出所有 SKILL.md 候选给用户勾选
4. **Drag & Drop**：监听 Tauri 的 `tauri://drag-drop` 事件，拿到文件路径数组后走同一条逻辑

候选列表每行展示：
- 复选框
- skill name（来自 frontmatter）
- source type badge（folder / zip / skill / markdown）
- 源路径（缩略显示，hover 全路径）
- 校验状态（有效 / 错误信息）

点 `Import All Selected` 走 `import_local_skills_batch`，导入完成显示 toast：`Imported {n}, Skipped {m}, Failed {k}`。

### 5.3 与 Preview Panel 的关系

为了和现有 URL/GitHub 的"右侧预览面板"风格一致：

- 列表行有 "Preview" 按钮（眼睛图标）→ 调 `preview_local_skill(path)` → 填充右侧 `SkillPreviewPanel`
- 在预览面板里也可以单独点 "Import to Library"（走 `import_local_skill`）
- 列表上的批量"Import All Selected"按钮独立于预览，可直接批量入库

### 5.4 Hook

`src/hooks/useLocalImport.ts`：

```ts
usePreviewLocalSkill()              // mutation
useImportLocalSkill()               // mutation, invalidates skillKeys.all
useImportLocalSkillsBatch()         // mutation, invalidates skillKeys.all
useScanDirectoryForSkills()         // mutation（用 mutation 而非 query，避免重复扫）
```

类型在文件顶部 export：`LocalSkillCandidate`, `LocalSourceType`。

---

## 6. 数据流时序

```
User drops bundle.zip
        │
        ▼
[FE]  resolves dropped paths via tauri://drag-drop event
        │
        ▼
[FE]  setCandidates([{ path, source_type: 'zip', valid: ?, ... }])
        │  对单个文件可以马上 preview_local_skill 获取 metadata
        ▼
[BE]  preview_local_skill:
        - detect_source(path) -> Archive(zip)
        - extract to tmp
        - discover SKILL.md
        - parse frontmatter
        - 返回 SkillPreview（与现有结构一致，sourceUrl 用 file:// 前缀）
        │
        ▼
[FE]  user clicks "Import All Selected"
        │
        ▼
[BE]  import_local_skills_batch(paths):
        for each path:
          - detect_source
          - if zip/skill: extract tmp -> ingest each candidate
          - if folder: ingest directly
          - if md: wrap and ingest
          - collect (imported|skipped|error)
        │
        ▼
[FE]  toast 结果 + invalidate skillKeys.all
        │
        ▼
[FE]  Library 视图自动刷新（已有 React Query）
```

---

## 7. 测试要点

后端 unit test（`#[cfg(test)]`）：

- `detect_source` 对每种扩展名返回正确变体
- ZIP slip 攻击被拒绝（条目名含 `../` 或绝对路径）
- 超大文件被跳过
- 多 skill ZIP 解压后能列出全部 candidates
- 同名冲突走 skipped 而非 error

前端：

- 拖拽 + 文件选择 + 文件夹选择都能产生 candidates
- 候选行的 Preview / 批量 Import 按钮按钮状态切换正确
- Scan Folder 在扫到很多 skill 时 UI 不卡死（列表用 ScrollArea）

---

## 8. 与现有系统的交互

| 现有点 | 交互 |
|--------|------|
| `sanitize_skill_name` | 复用做名字归一化 |
| `rewrite_skill_md_name` | ZIP 内 SKILL.md 名字可能和 sanitize 后不一样，要 patch |
| `create_skill_from_directory` | 复制完成后调用，产出与现有 `Skill` 结构一致 |
| `risk_analyzer` | 不变；导入后在 Library 视图按现有流程触发分析 |
| `FileWatcher` | 库目录被修改时自动触发刷新，本地导入完成后利于即时显示 |
| `dialog:allow-open` | 已开启，复选/多选/目录选择都支持 |

不需要新增 capabilities 权限。

---

## 9. 路线图与本期范围

本期（v0.5.0）：

- [x] Folder / ZIP / `.skill` / loose `.md` 四种本地源
- [x] 单选 + 多选 + 拖拽 + 文件夹扫描
- [x] 批量导入 + 结果汇总
- [x] 与现有 Preview 面板复用

下期可做（不在本期范围）：

- 自动检测同名 skill 并提供"覆盖/版本化/跳过"三选项
- 导入历史和回滚
- `.tar.gz` 等其他压缩格式
