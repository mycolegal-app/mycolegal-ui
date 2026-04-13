"use client";

import { useEffect } from "react";

export interface KeyboardShortcut {
  /** Key to listen for (e.g. "k", "n") */
  key: string;
  /** Require Cmd (Mac) / Ctrl (Win) */
  cmdOrCtrl?: boolean;
  /** Action to execute */
  action: () => void;
  /** Skip if focus is in an input/textarea/select */
  ignoreInputs?: boolean;
}

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const cmdMatch = shortcut.cmdOrCtrl
          ? e.metaKey || e.ctrlKey
          : true;

        if (cmdMatch && e.key === shortcut.key) {
          if (shortcut.ignoreInputs !== false) {
            const tag = (e.target as HTMLElement)?.tagName;
            if (INPUT_TAGS.has(tag)) continue;
          }
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}
