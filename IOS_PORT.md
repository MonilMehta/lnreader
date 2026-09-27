# Experimental iOS port

This branch ports the Android LNReader app to iOS. Upstream code and licensing
are retained. This is not full feature parity or a production release.

## Status

| Area                                                               | Status                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App startup, library and chapter reader                            | Development and standalone Release builds exercised on an iPhone 17 Pro simulator running iOS 26.4.                                                                                                      |
| Plugin repositories and installed plugins                          | Repository index fetched; 30 restored plugin bundles loaded. Individual source websites may change and have not all been tested.                                                                         |
| EPUB import and export                                             | Imported a local EPUB, read its chapter, exported it, and verified the exported file can be parsed.                                                                                                      |
| Local backup and restore                                           | Restored a legacy folder ZIP with 17 novels and 30 plugins. A new full backup restored with unchanged database counts; all 74 original downloaded chapters matched byte for byte.                        |
| Native files, HTTP downloads and ZIP archives                      | Implemented and exercised on the simulator, including overwrite and HTTP-failure behavior.                                                                                                               |
| Downloads, manual library updates, imports and backups             | Foreground task worker implemented with persisted checkpoints and pause/resume/cancel. Keep the app open while work runs.                                                                                |
| Automatic updates/backups with the app closed                      | Not implemented; scheduling controls are hidden on iOS.                                                                                                                                                  |
| Google Drive backup                                                | Disabled on iOS; requires iOS OAuth configuration and testing.                                                                                                                                           |
| Sharing into the app and volume-button page navigation             | Not implemented on iOS. Android APK updates are also hidden.                                                                                                                                             |
| Self-hosted backup, TTS/background audio and other reader settings | Existing integrations remain, but have not been verified end to end on iOS.                                                                                                                              |
| External tracking                                                  | Tracking settings and per-novel tracker controls are hidden in this fork at the user’s request. Tracker services and stored backup data are retained.                                                    |
| Global search                                                      | Live source results and novel chapter lists exercised on the simulator; the search header has a back button.                                                                                             |
| Physical iPhone and signed Release build                           | Standalone signed Release build with bundled JavaScript installed on a connected iPhone 17. Database and reader assets initialize successfully; full physical-device feature testing remains incomplete. |

Local backups are saved in the app's Documents folder, accessible through Files.
Generated iOS projects, signing credentials, user libraries and backups are not
included in the repository. Expo prebuild generates the Xcode project.

## Simulator

Install Node 22.11 or newer, pnpm, Xcode and CocoaPods, then run:

```sh
pnpm install --frozen-lockfile
pnpm run dev:ios --device "iPhone 17 Pro" --port 8082
```

Choose an available simulator if that model is not installed.

## Physical iPhone

Connect and trust the iPhone, enable Developer Mode, and configure your Apple
developer team under Signing & Capabilities in `ios/LNReader.xcworkspace`.
For a standalone build with bundled JavaScript:

```sh
pnpm run generate:env:release
pnpm exec expo run:ios --device --configuration Release
```

The simulator build cannot be installed on an iPhone. Device installation needs
a separately compiled and signed build. Signing/profile expiry controls how
long a directly installed build remains usable.

## Checks

```sh
pnpm run lint
pnpm run type-check
pnpm test --runInBand
```

Automated checks do not prove every feature works on a physical phone.

The iOS database lives in `Library/SQLite`. The Android `../files/SQLite` path
cannot be created on a physical iPhone and caused the initial Release build
to remain on its splash screen.

Novel migration returns to Library after the task is queued, clearing the source
screen from navigation. Reproduced and verified with temporary simulator novels.
