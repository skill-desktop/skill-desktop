import React from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { useAppStore } from "@/stores";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  // We key the <main> on the current view so React fully remounts the inner
  // tree on every view switch — that retriggers the `animate-view-in` keyframe
  // and gives us a free iOS-style fade-up between tabs (M3-4).
  const currentView = useAppStore((s) => s.currentView);
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Content */}
        <main
          key={currentView}
          className="flex-1 overflow-hidden animate-view-in"
        >
          {children}
        </main>

        {/* Status bar */}
        <StatusBar />
      </div>
    </div>
  );
};
