import type { Tab } from "@/modules/tabs";
import { leafIds } from "@/modules/terminal";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

export function useTabClosing({
  tabs,
  disposeTab,
}: {
  tabs: Tab[];
  disposeTab: (id: number) => void;
}) {
  const [pendingCloseTab, setPendingCloseTab] = useState<number | null>(null);
  const [pendingDeleteTabs, setPendingDeleteTabs] = useState<number[] | null>(
    null,
  );
  const [pendingRunningTab, setPendingRunningTab] = useState<number | null>(null);

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && t.dirty) {
        setPendingCloseTab(id);
        return;
      }
      if (t?.kind === "terminal") {
        const tabLeafIds = leafIds(t.paneTree);
        void (async () => {
          for (const leafId of tabLeafIds) {
            const hasChild = await invoke<boolean>("pty_has_child", { id: leafId }).catch(() => false);
            if (hasChild) {
              setPendingRunningTab(id);
              return;
            }
          }
          disposeTab(id);
        })();
        return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab],
  );

  const confirmClose = useCallback(() => {
    if (pendingCloseTab !== null) {
      disposeTab(pendingCloseTab);
      setPendingCloseTab(null);
    }
  }, [pendingCloseTab, disposeTab]);

  const cancelClose = useCallback(() => {
    setPendingCloseTab(null);
  }, []);

  const confirmRunningClose = useCallback(() => {
    if (pendingRunningTab !== null) {
      disposeTab(pendingRunningTab);
      setPendingRunningTab(null);
    }
  }, [pendingRunningTab, disposeTab]);

  const cancelRunningClose = useCallback(() => {
    setPendingRunningTab(null);
  }, []);

  const confirmDeleteClose = useCallback(() => {
    if (pendingDeleteTabs !== null) {
      for (const id of pendingDeleteTabs) disposeTab(id);
      setPendingDeleteTabs(null);
    }
  }, [pendingDeleteTabs, disposeTab]);

  const cancelDeleteClose = useCallback(() => {
    setPendingDeleteTabs(null);
  }, []);

  const handlePathDeleted = useCallback(
    (path: string) => {
      const dirty: number[] = [];
      for (const t of tabs) {
        if (t.kind !== "editor" && t.kind !== "media") continue;
        if (t.path !== path && !t.path.startsWith(`${path}/`)) continue;
        if (t.kind === "editor" && t.dirty) {
          dirty.push(t.id);
        } else {
          disposeTab(t.id);
        }
      }
      if (dirty.length > 0) setPendingDeleteTabs(dirty);
    },
    [tabs, disposeTab],
  );

  return {
    pendingCloseTab,
    pendingDeleteTabs,
    pendingRunningTab,
    handleClose,
    confirmClose,
    cancelClose,
    confirmRunningClose,
    cancelRunningClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  };
}
