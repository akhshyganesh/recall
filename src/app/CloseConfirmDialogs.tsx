import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Tab } from "@/modules/tabs";

type Props = {
  tabs: Tab[];
  pendingCloseTab: number | null;
  confirmClose: () => void;
  cancelClose: () => void;
  pendingDeleteTabs: number[] | null;
  confirmDeleteClose: () => void;
  cancelDeleteClose: () => void;
  pendingRunningTab: number | null;
  confirmRunningClose: () => void;
  cancelRunningClose: () => void;
};

export function CloseConfirmDialogs({
  tabs,
  pendingCloseTab,
  confirmClose,
  cancelClose,
  pendingDeleteTabs,
  confirmDeleteClose,
  cancelDeleteClose,
  pendingRunningTab,
  confirmRunningClose,
  cancelRunningClose,
}: Props) {
  return (
    <>
      <AlertDialog
        open={pendingCloseTab !== null}
        onOpenChange={(open) => !open && cancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              {tabs.find((t) => t.id === pendingCloseTab)?.title
                ? `"${
                    tabs.find((t) => t.id === pendingCloseTab)?.title
                  }" has unsaved changes. Close anyway?`
                : "This file has unsaved changes. Close anyway?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>
              Close Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteTabs !== null}
        onOpenChange={(open) => !open && cancelDeleteClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTabs?.length === 1
                ? (() => {
                    const title = tabs.find(
                      (t) => t.id === pendingDeleteTabs[0],
                    )?.title;
                    return title
                      ? `"${title}" has unsaved changes. The file has been deleted. Close anyway?`
                      : "This file has unsaved changes. The file has been deleted. Close anyway?";
                  })()
                : `${pendingDeleteTabs?.length ?? 0} files have unsaved changes. They have been deleted. Close all anyway?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteClose}>
              Close Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingRunningTab !== null}
        onOpenChange={(open) => !open && cancelRunningClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Running Process</AlertDialogTitle>
            <AlertDialogDescription>
              A process is running in this terminal. Close it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelRunningClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmRunningClose}>
              Close Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
