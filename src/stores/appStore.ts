import { create } from "zustand";
import type { SkillUpdateInfo } from "@/hooks/useSkills";

type View = "home" | "library" | "spaces" | "sandbox" | "aitools" | "settings";

interface AppState {
  // 当前视图
  currentView: View;
  setCurrentView: (view: View) => void;

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

  // 详情面板状态
  detailPanelOpen: boolean;
  setDetailPanelOpen: (open: boolean) => void;

  // 当 Import dialog (ImportSkillDialog) 处于前台时为 true。
  // QuickInstallSheet 的全局 drag-drop 监听检查这个 flag 来决定是否要让位 —
  // 不让位会和 LocalImportPanel 的同名监听双触发，结果是同一份文件被导入两次。
  importDialogActive: boolean;
  setImportDialogActive: (active: boolean) => void;

  // 从 SkillDetail 跳到 Sandbox 时携带的预选 skill hash。
  // SandboxView 挂载后会消费这个值并把自己的选中态设成对应 skill，然后
  // 把这里 reset 回 null —— 它是一次性的，类似 "意图传递"。
  pendingSandboxSkillHash: string | null;
  setPendingSandboxSkillHash: (hash: string | null) => void;

  // 全局命令面板 (⌘K) 状态。打开后用户可以在任何视图里搜索 skill、跳转
  // 视图、触发常用动作（new skill / import / open settings...）。
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // 快捷键参考表 (按 ? 打开)。iOS / macOS 用户的肌肉记忆是按 ? 看 cheatsheet，
  // 我们暴露这个 flag，全局 keydown 监听负责设值。
  shortcutsHelpOpen: boolean;
  setShortcutsHelpOpen: (open: boolean) => void;

  // Skill 更新检查结果缓存。HomeView / SettingsView 之间共享。
  // null = 还没检查过；空数组 = 检查过但没有可更新的；非空 = 有结果。
  // 直接复用 hook 层的 SkillUpdateInfo 避免两套近似类型在 store 和组件间漂移。
  skillUpdates: SkillUpdateInfo[] | null;
  skillUpdatesCheckedAt: string | null; // ISO 时间戳
  /** 已经应用过的更新（按 hash） —— 应用后从 banner 隐藏。 */
  appliedUpdateHashes: string[];
  setSkillUpdates: (
    updates: SkillUpdateInfo[],
    checkedAt: string
  ) => void;
  markUpdateApplied: (skillHash: string) => void;
  clearSkillUpdates: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "home",
  setCurrentView: (view) => set({ currentView: view }),

  // Default to "default" space to avoid null issues
  currentSpaceId: "default",
  setCurrentSpaceId: (id) => set({ currentSpaceId: id }),

  selectedSkillHash: null,
  setSelectedSkillHash: (hash) =>
    set({ selectedSkillHash: hash, detailPanelOpen: !!hash }),

  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  detailPanelOpen: false,
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),

  importDialogActive: false,
  setImportDialogActive: (active) => set({ importDialogActive: active }),

  pendingSandboxSkillHash: null,
  setPendingSandboxSkillHash: (hash) => set({ pendingSandboxSkillHash: hash }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  shortcutsHelpOpen: false,
  setShortcutsHelpOpen: (open) => set({ shortcutsHelpOpen: open }),

  skillUpdates: null,
  skillUpdatesCheckedAt: null,
  appliedUpdateHashes: [],
  setSkillUpdates: (updates, checkedAt) =>
    set({
      skillUpdates: updates,
      skillUpdatesCheckedAt: checkedAt,
      // Reset the applied list when we re-check; otherwise we'd hide updates
      // that the user already applied last session.
      appliedUpdateHashes: [],
    }),
  markUpdateApplied: (skillHash) =>
    set((state) => ({
      appliedUpdateHashes: state.appliedUpdateHashes.includes(skillHash)
        ? state.appliedUpdateHashes
        : [...state.appliedUpdateHashes, skillHash],
    })),
  clearSkillUpdates: () =>
    set({
      skillUpdates: null,
      skillUpdatesCheckedAt: null,
      appliedUpdateHashes: [],
    }),
}));
