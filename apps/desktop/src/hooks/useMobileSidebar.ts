/**
 * `useMobileSidebar` — tracks the mobile breakpoint and owns the
 * `sidebarOpen` flag. Automatically closes the sidebar when the viewport
 * leaves the mobile breakpoint.
 */
import { useCallback, useEffect, useState } from 'react';

const MOBILE_SIDEBAR_QUERY = '(max-width: 900px)';

export interface UseMobileSidebarResult {
  isMobileSidebar: boolean;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

export function useMobileSidebar(): UseMobileSidebarResult {
  const [isMobileSidebar, setIsMobileSidebar] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mq = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const sync = (matches: boolean) => {
      setIsMobileSidebar(matches);
      if (!matches) setSidebarOpen(false);
    };

    const handleChange = (event: MediaQueryListEvent) => sync(event.matches);
    sync(mq.matches);

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }

    // Safari < 14 fallback
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return { isMobileSidebar, sidebarOpen, openSidebar, closeSidebar };
}
