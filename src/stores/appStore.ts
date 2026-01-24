import { create } from "zustand";

type View = "library" | "spaces" | "hub" | "settings";

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
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "library",
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
}));
