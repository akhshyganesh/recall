# Changelog

All notable changes to Recall will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.3]

- Fixed the macOS release workflow to choose ad-hoc signing via step outputs, so Apple certificate secrets are not accidentally forwarded into ad-hoc builds.
- Shipped the recovery release after the `v1.0.2` macOS GitHub Actions run failed during certificate import.

## [1.0.2]

- Allowed the macOS release workflow to fall back to ad-hoc signing when Apple certificate secrets are not configured.
- Added early validation for Apple signing certificate configuration when the release workflow is set up for notarized builds.

## [1.0.1]

- Reduced release output to the common desktop targets only: macOS Apple Silicon DMG, Ubuntu 22.04 DEB, and Windows NSIS installer.
- Fixed the Windows Tauri launcher path used during release builds.
- Added Apple signing and notarization workflow support for macOS release builds.
