import React from "react";
import { useTranslation } from "react-i18next";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Kbd,
} from "@/components/ui";
import { useAppStore } from "@/stores";

// ────────────────────────────────────────────────────────────────────────────
// Shortcut catalogue
// ────────────────────────────────────────────────────────────────────────────

interface ShortcutEntry {
  /** What the user sees on the left side of the row. */
  labelKey: string;
  /** Sequence of keys for this binding. Each element is one chord; multiple
   *  chords get separated by "then". For most shortcuts it's a single chord. */
  keys: string[];
}

interface ShortcutGroup {
  titleKey: string;
  items: ShortcutEntry[];
}

// Detect platform once. We can't reliably know the modifier name at runtime
// (no Tauri API for it) so we use UA — accurate enough since this UI is
// only ever shown to the user themselves.
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const META = isMac ? "⌘" : "Ctrl";

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: "shortcuts.group.navigation",
    items: [
      { labelKey: "shortcuts.commandPalette", keys: [`${META}+K`] },
      { labelKey: "shortcuts.home", keys: [`${META}+1`] },
      { labelKey: "shortcuts.skills", keys: [`${META}+2`] },
      { labelKey: "shortcuts.spaces", keys: [`${META}+3`] },
      { labelKey: "shortcuts.sandbox", keys: [`${META}+4`] },
      { labelKey: "shortcuts.integrations", keys: [`${META}+5`] },
      { labelKey: "shortcuts.settings", keys: [`${META}+,`] },
    ],
  },
  {
    titleKey: "shortcuts.group.actions",
    items: [
      { labelKey: "shortcuts.rescan", keys: [`${META}+R`] },
      { labelKey: "shortcuts.newSpace", keys: [`${META}+N`] },
      { labelKey: "shortcuts.help", keys: ["?"] },
      { labelKey: "shortcuts.dismiss", keys: ["Esc"] },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

/**
 * `<ShortcutsHelp />` — mounted once in App.tsx. Driven by `appStore.
 * shortcutsHelpOpen`; the global keydown listener flips that flag whenever
 * the user presses `?` (Shift+/) outside an input.
 */
export const ShortcutsHelp: React.FC = () => {
  const { t } = useTranslation();
  const shortcutsHelpOpen = useAppStore((s) => s.shortcutsHelpOpen);
  const setShortcutsHelpOpen = useAppStore((s) => s.setShortcutsHelpOpen);

  return (
    <Dialog open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-accent-blue" />
            {t("shortcuts.title")}
          </DialogTitle>
          <DialogDescription>{t("shortcuts.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.titleKey}>
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {t(group.titleKey)}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.labelKey}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-bg-tertiary"
                  >
                    <span className="text-sm text-text-secondary">
                      {t(item.labelKey)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.keys.map((chord, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <span className="text-[10px] text-text-muted">
                              {t("shortcuts.then")}
                            </span>
                          )}
                          <ShortcutKeys chord={chord} />
                        </React.Fragment>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Split a chord like "⌘+K" into individual <Kbd /> tiles.
// ────────────────────────────────────────────────────────────────────────────

interface ShortcutKeysProps {
  chord: string;
}

const ShortcutKeys: React.FC<ShortcutKeysProps> = ({ chord }) => {
  const parts = chord.split("+");
  return (
    <span className="flex items-center gap-0.5">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="text-[10px] text-text-muted">+</span>
          )}
          <Kbd>{part}</Kbd>
        </React.Fragment>
      ))}
    </span>
  );
};
