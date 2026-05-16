# TODO

Deferred features for future milestones.

## Userscript API Integration

- [ ] Settings: API token input (UI exists, backend integration pending)
- [ ] POST `/api/tasks` — submit userscript request with URL, prompt, and captured page HTML
- [ ] Capture page HTML from active webview via `webview.executeJavaScript('document.documentElement.outerHTML')`
- [ ] Polling loop — GET `/api/tasks/status/{submission_token}` every 5 seconds
- [ ] Persist `submission_token` in store for session recovery
- [ ] Price approval dialog — modal shown when `status == "awaiting_approval"`, displays price + rationale, approve/reject actions
- [ ] POST `/api/me/tasks/{id}/approve` and `/api/me/tasks/{id}/reject`
- [ ] Download and cache `script_code` when `status == "done"` → `app.getPath('userData')/scripts/{script_name}.js`

## Script Injection

- [ ] Match pattern engine — convert `https://example.com/*` glob to RegExp
- [ ] Auto-inject on `did-finish-load` — check cached scripts whose `match_pattern` matches current URL
- [ ] Send matching scripts to webview via `webview.send('inject-scripts', scripts)` (hook already in `webview-preload.js`)

## UI / UX

- [ ] Userscript manager panel — list, enable/disable, and delete cached scripts
- [ ] Toast / notification system for task lifecycle events (pending, approved, done, failed)
- [ ] Keyboard shortcuts: `Cmd/Ctrl+[` back, `Cmd/Ctrl+]` forward, `Cmd/Ctrl+R` reload, `Cmd/Ctrl+,` settings
- [ ] Right-click context menu in webview: "Request userscript for this page"
- [ ] Drag-to-reorder pages in settings
- [ ] Request userscript prompt UI (sidebar or floating panel)

## Build / Release

- [ ] macOS notarization — Apple Developer account, `@electron/notarize` post-build hook, entitlements plist
- [ ] Auto-updater — `electron-updater` integration with GitHub releases feed
- [ ] Universal macOS binary (arm64 + x64 combined `.dmg`) vs separate arch builds
