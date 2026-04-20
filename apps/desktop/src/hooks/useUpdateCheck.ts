/**
 * `useUpdateCheck` — encapsulates the GitHub-releases update probe and
 * the `AppInfo` fetch that feeds it. Supports in-app download & install
 * via the Tauri updater plugin.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { AppInfo, UpdateStatus } from '@recall/shared-types';

import * as api from '../api';
import { fetchLatestRelease, isNewerVersion } from '../lib/release-check';

const INITIAL_UPDATE_STATUS: UpdateStatus = {
  state: 'idle',
  current_version: null,
  latest_version: null,
  release_url: null,
  release_date: null,
  release_notes: null,
  checked_at: null,
  error: null,
  download_progress: null,
};

export interface UseUpdateCheckResult {
  appInfo: AppInfo | null;
  updateStatus: UpdateStatus;
  checkForUpdates: (info?: AppInfo | null) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
}

export function useUpdateCheck(): UseUpdateCheckResult {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(INITIAL_UPDATE_STATUS);
  const appInfoRef = useRef<AppInfo | null>(null);

  const loadAppInfo = useCallback(async () => {
    try {
      const info = await api.getAppInfo();
      appInfoRef.current = info;
      setAppInfo(info);
      setUpdateStatus((current) => ({ ...current, current_version: info.current_version }));
      return info;
    } catch (error) {
      console.error('Failed to load app info:', error);
      return null;
    }
  }, []);

  const checkForUpdates = useCallback(async (info?: AppInfo | null) => {
    const currentInfo = info ?? appInfoRef.current;
    const currentVersion = currentInfo?.current_version ?? null;

    setUpdateStatus((current) => ({
      ...current,
      state: 'checking',
      current_version: currentVersion,
      error: null,
      download_progress: null,
    }));

    try {
      const release = await fetchLatestRelease();
      const checkedAt = new Date().toISOString();

      const isAvailable =
        currentVersion !== null && isNewerVersion(release.version, currentVersion);

      setUpdateStatus({
        state: isAvailable ? 'available' : 'up-to-date',
        current_version: currentVersion,
        latest_version: release.version,
        release_url: release.release_url,
        release_date: release.release_date,
        release_notes: release.release_notes,
        checked_at: checkedAt,
        error: null,
        download_progress: null,
      });
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus((current) => ({
        ...current,
        state: 'error',
        checked_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Failed to check for updates.',
      }));
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setUpdateStatus((current) => ({
      ...current,
      state: 'downloading',
      download_progress: 0,
      error: null,
    }));

    try {
      const update = await check();

      if (!update) {
        setUpdateStatus((current) => ({
          ...current,
          state: 'up-to-date',
          error: null,
          download_progress: null,
        }));
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const progress = Math.min(Math.round((downloaded / contentLength) * 100), 100);
              setUpdateStatus((current) => ({
                ...current,
                state: 'downloading',
                download_progress: progress,
              }));
            }
            break;
          case 'Finished':
            setUpdateStatus((current) => ({
              ...current,
              state: 'installing',
              download_progress: 100,
            }));
            break;
        }
      });

      await relaunch();
    } catch (error) {
      console.error('Failed to download and install update:', error);
      setUpdateStatus((current) => ({
        ...current,
        state: 'error',
        download_progress: null,
        error: error instanceof Error ? error.message : 'Failed to install update.',
      }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadAppInfo();
      if (!cancelled && info) {
        await checkForUpdates(info);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkForUpdates, loadAppInfo]);

  return { appInfo, updateStatus, checkForUpdates, downloadAndInstall };
}
