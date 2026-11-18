---
name: verify
description: How to run and drive this app in a visible Chrome window to verify a change (Playwright + installed Chrome on Windows).
---

# Verifying changes in Keep The Day Going

No build step. Drive the real page in a visible Chrome window (the user wants to watch; never headless) with `playwright-core` (no browser download needed).

## Setup (in the session scratchpad, not the repo)
```bash
mkdir -p pw && cd pw && npm init -y && npm i playwright-core@1.47.2
```

## Launch
- Serve the repo folder with a tiny `http.createServer` inside the script (listen on port 0) rather than `file://`, so `localStorage` has a normal origin.
- `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, slowMo: 150 })` (visible window; slowMo so actions are easy to follow)
- A fresh browser context starts with empty `localStorage` (`dailyQuestState`), so the user's real data is never touched.
- Phone-ish viewport `420x820` matches the app's layout.

## Driving
- Menu: `#menuBtn`, then `#menuDropdown button[data-action="<add|history|rewards|rules|todo|backup|reset>"]`.
- Add an activity: `#addName` → `#addConfirmBtn` (no time = unscheduled, avoids the spin flow).
- Rules: `#newRuleInput` → `#addRuleBtn`.
- Hidden file inputs: `Promise.all([page.waitForEvent('filechooser'), page.click(<button>)])`, then `setFiles`.
- Downloads: `newContext({ acceptDownloads: true })` + `page.waitForEvent('download')`.
- `confirm()` dialogs: handle with `page.on('dialog', ...)`.
- Collect `page.on('pageerror')`: a throw during startup (e.g. in `recalcPoints()`) leaves the page half-rendered (`--/--` date, empty timeline) but no visible error.
- Read stored state: `page.evaluate(() => JSON.parse(localStorage.getItem('dailyQuestState')))`.
- Closing modals: set the `hidden` class through `evaluate`; Escape doesn't close them.
