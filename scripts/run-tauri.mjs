#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);

function run(command, commandArgs, env = process.env) {
  return spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env,
  });
}

function shouldStripLinuxPathSegment(value, homeDirectory) {
  return value.startsWith('/snap/') || value.startsWith(`${homeDirectory}/snap/`);
}

function sanitizeLinuxDesktopEnv(env) {
  if (process.platform !== 'linux') {
    return { env, changedKeys: [] };
  }

  const nextEnv = { ...env };
  const changedKeys = [];
  const homeDirectory = env.HOME ?? '';
  const pathLikeVariables = [
    'GTK_PATH',
    'GTK_EXE_PREFIX',
    'GTK_IM_MODULE_FILE',
    'GDK_PIXBUF_MODULEDIR',
    'GDK_PIXBUF_MODULE_FILE',
    'GI_TYPELIB_PATH',
    'GIO_EXTRA_MODULES',
    'GIO_MODULE_DIR',
    'GST_PLUGIN_PATH',
    'GST_PLUGIN_SYSTEM_PATH',
    'GST_PLUGIN_SYSTEM_PATH_1_0',
    'LD_LIBRARY_PATH',
    'XDG_DATA_DIRS',
  ];

  for (const key of pathLikeVariables) {
    const currentValue = nextEnv[key];
    if (!currentValue) {
      continue;
    }

    const filtered = currentValue
      .split(path.delimiter)
      .filter(Boolean)
      .filter((segment) => !shouldStripLinuxPathSegment(segment, homeDirectory));

    const normalized = filtered.join(path.delimiter);
    if (normalized === currentValue) {
      continue;
    }

    if (normalized) {
      nextEnv[key] = normalized;
    } else {
      delete nextEnv[key];
    }

    changedKeys.push(key);
  }

  return { env: nextEnv, changedKeys };
}

const prereqResult = run(process.execPath, ['scripts/check-tauri-linux-prereqs.mjs']);
if (prereqResult.status !== 0) {
  process.exit(prereqResult.status ?? 1);
}

const { env, changedKeys } = sanitizeLinuxDesktopEnv(process.env);
if (changedKeys.length > 0) {
  console.warn(
    `Stripped Snap-injected desktop runtime paths before launching Tauri: ${changedKeys.join(', ')}`,
  );
}

const tauriCommand = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const tauriResult = run(tauriCommand, args, env);

if (tauriResult.error) {
  console.error(tauriResult.error.message);
  process.exit(1);
}

if (tauriResult.signal) {
  process.kill(process.pid, tauriResult.signal);
}

process.exit(tauriResult.status ?? 0);