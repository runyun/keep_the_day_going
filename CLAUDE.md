# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Keep The Day Going" — a gamified daily-routine tracker (activities on a 24h timeline, XP/levels, momentum, points, bonus spins, rewards, rules board, to-dos). Plain HTML/CSS/JS with no dependencies, no build step, no package manager, no tests, and no linter.

## Running

Open `index.html` directly in a browser (or serve the folder with any static server). There is nothing to build. Verify changes by reloading the page; all data lives in the browser's `localStorage` under the key `dailyQuestState`, so use the in-app "Reset All Data" menu item (or clear that key) to start fresh.

Commit messages follow the `feat: <description>` style.

## Architecture

Everything is in three files: `index.html` (static markup for the main screen and every modal), `app.js` (all logic), `style.css`. `app.js` is a single classic script loaded at the end of `<body>`; it attaches event listeners at top level by element ID, so IDs in `index.html` and `app.js` must stay in sync.

### State

A single global `state` object is loaded once by `loadState()` and persisted in full by `saveState()`. The pattern everywhere is: mutate `state` → `saveState()` → call the relevant `render*()` functions (or `renderAll()`). There is no reactive layer; forgetting a render call leaves the UI stale.

When adding a new field to `state`, add it to the default object in `loadState()` **and** add a backfill line right after `let state = loadState();` (see `rewardPresets`, `todos`, `skipDay`) so existing saved data keeps working.

### Derived vs. stored values

- **Points and level/XP are derived**, not sources of truth. `recalcPoints()` and `recalcLevel()` recompute them from `activities[].completions[]` (including each completion's `spin` bonus) minus `redemptions[]`. Call both after any change to completions. Level thresholds start at 70 XP and grow ×1.2 per level.
- **Momentum (0–100) is stored and mutated incrementally.** Each completion records its own `momentumGained` so `deleteCompletion()` can reverse it exactly. Keep that pairing intact if momentum rules change.

### Activities are daily-recurring

An activity is a single record (`{id, name, memo, time, duration, completions[]}`) that reappears every day; "done today" is computed by filtering `completions` on today's date. Activities with `time: null` are "unscheduled" — they render in the sticky top section rather than the timeline, and are deliberately **excluded** from the daily momentum ratio and the spin `taskCount` (see `getScheduledActivities()`).

### Completion flow

`completeActivity()` → `openSpinFlow()` → `resolveSpinResult()` → `openSummaryModal()` is a chained modal sequence coordinated through the module-level `pendingSpin` object. The completion is saved immediately with a `miss` spin and then patched once the spin resolves. The spin and summary modals set `data-no-outside-close="true"` so the sequence can't be dismissed midway.

Spin odds are documented in the comment above `getSpinProbabilities()` (momentum, scheduled-task count, and star difficulty all feed the win chance).

### Daily rollover

`applyDailyMomentumUpdate()` runs once at page load. If `state.lastActiveDate` isn't today, it scores yesterday's completion ratio over scheduled activities via `computeMomentumShift()` and shows a popup. `state.skipDay` (toggled from the menu) suppresses the next rollover's adjustment and then clears itself. Rollover only happens on load — a page left open across midnight will not trigger it.

### Date handling

All `YYYY-MM-DD` date strings come from `dateStr(d = new Date())`, which uses the **local** calendar day. Do not use `toISOString()` for dates — it is UTC and reintroduces an off-by-one-day bug outside UTC. Completions saved before this helper existed may carry UTC dates.

### Rendering

Render functions rebuild their container's `innerHTML` from `state` and re-attach listeners each time. User-entered text (names, memos, rules, to-dos) is interpolated into `innerHTML` unescaped. The timeline is absolutely positioned at `HOUR_HEIGHT` (60) px per hour, matching the fixed `height:1440px` on `#timeline` in `style.css` — change them together.

Modals are shown/hidden by toggling the `hidden` class via `openModal(id)` / `closeModal(id)`; close buttons use `data-close="<modalId>"`.
