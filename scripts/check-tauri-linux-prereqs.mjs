#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.platform !== 'linux') {
  process.exit(0);
}

const REQUIRED_PC_MODULES = [
  { name: 'glib-2.0', aptPackage: 'libglib2.0-dev' },
  { name: 'gobject-2.0', aptPackage: 'libglib2.0-dev' },
  { name: 'gtk+-3.0', aptPackage: 'libgtk-3-dev' },
  { name: 'javascriptcoregtk-4.1', aptPackage: 'libwebkit2gtk-4.1-dev' },
  { name: 'libsoup-3.0', aptPackage: 'libsoup-3.0-dev' },
  { name: 'webkit2gtk-4.1', aptPackage: 'libwebkit2gtk-4.1-dev' },
];

const UBUNTU_BASE_PACKAGES = [
  'pkg-config',
  'build-essential',
  'curl',
  'wget',
  'file',
  'libssl-dev',
  'libxdo-dev',
  'libayatana-appindicator3-dev',
  'librsvg2-dev',
];

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readOsRelease() {
  try {
    const content = readFileSync('/etc/os-release', 'utf8');
    const values = new Map();

    for (const line of content.split('\n')) {
      if (!line || !line.includes('=')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      const key = line.slice(0, separatorIndex);
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^"|"$/g, '');
      values.set(key, value);
    }

    const ids = new Set();
    for (const key of ['ID', 'ID_LIKE']) {
      const value = values.get(key);
      if (!value) {
        continue;
      }

      for (const token of value.split(/\s+/)) {
        if (token) {
          ids.add(token.toLowerCase());
        }
      }
    }

    return {
      name: values.get('PRETTY_NAME') ?? values.get('NAME') ?? 'Linux',
      ids,
    };
  } catch {
    return {
      name: 'Linux',
      ids: new Set(),
    };
  }
}

function formatInstallCommand(osRelease, missingModules, missingPkgConfig) {
  const aptPackages = new Set(UBUNTU_BASE_PACKAGES);

  if (missingPkgConfig) {
    aptPackages.add('pkg-config');
  }

  for (const module of missingModules) {
    aptPackages.add(module.aptPackage);
  }

  if (osRelease.ids.has('ubuntu') || osRelease.ids.has('debian')) {
    return [
      'sudo apt update',
      `sudo apt install ${Array.from(aptPackages).join(' ')}`,
    ].join('\n');
  }

  return null;
}

function fail({ osRelease, missingPkgConfig, missingModules }) {
  const lines = ['Recall is missing Linux build prerequisites for Tauri.'];

  if (missingPkgConfig) {
    lines.push('', 'Missing command:', '  - pkg-config');
  }

  if (missingModules.length > 0) {
    lines.push('', 'Missing pkg-config modules:');
    for (const module of missingModules) {
      lines.push(`  - ${module.name} (Ubuntu package: ${module.aptPackage})`);
    }
  }

  const installCommand = formatInstallCommand(osRelease, missingModules, missingPkgConfig);
  if (installCommand) {
    lines.push('', `Detected distro: ${osRelease.name}`, '', 'Install the missing packages:', installCommand);
  } else {
    lines.push('', `Detected distro: ${osRelease.name}`, '', 'Install the corresponding GTK/WebKit development packages for your distro, then rerun the command.');
  }

  lines.push('', 'Reference: https://v2.tauri.app/start/prerequisites/');

  console.error(lines.join('\n'));
  process.exit(1);
}

const osRelease = readOsRelease();
const pkgConfig = run('pkg-config', ['--version']);

if (pkgConfig.status !== 0) {
  fail({
    osRelease,
    missingPkgConfig: true,
    missingModules: REQUIRED_PC_MODULES,
  });
}

const missingModules = REQUIRED_PC_MODULES.filter((module) => run('pkg-config', ['--exists', module.name]).status !== 0);

if (missingModules.length > 0) {
  fail({
    osRelease,
    missingPkgConfig: false,
    missingModules,
  });
}