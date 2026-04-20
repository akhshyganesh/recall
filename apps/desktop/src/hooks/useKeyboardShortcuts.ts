/**
 * `useKeyboardShortcuts` — wires the global keybindings:
 *
 *  - `Cmd/Ctrl + K`: focus the passed-in search input
 *  - `Escape`: first closes the mobile sidebar, then exits the current
 *    session/search view (in that order of precedence)
 */
import { useEffect, type RefObject } from 'react';

interface Options {
  searchInputRef: RefObject<HTMLInputElement | null>;
  sidebarOpen: boolean;
  closeSidebar: () => void;
  onExitSession: () => void;
  onExitSearch: () => void;
  view: string;
}

export function useKeyboardShortcuts({
  searchInputRef,
  sidebarOpen,
  closeSidebar,
  onExitSession,
  onExitSearch,
  view,
}: Options): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key !== 'Escape') return;

      if (sidebarOpen) {
        closeSidebar();
        return;
      }

      if (view === 'session') {
        onExitSession();
        return;
      }

      if (view === 'search') {
        onExitSearch();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeSidebar, onExitSearch, onExitSession, searchInputRef, sidebarOpen, view]);
}
