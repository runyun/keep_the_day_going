---
name: ship
description: Ship the current changes - create a branch, commit in this project's style, push, and open a GitHub pull request with gh.
argument-hint: "[short description of the change]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh pr create *), Bash(gh pr view *)
---

# /ship — branch, commit, push, pull request

The user wants to ship their current changes. Extra description from the user (may be empty): **$ARGUMENTS**

Explain each step in plain, simple English as you go — the user is learning how this works.

## 1. Check the current state

Run:
- `git status`
- `git diff` (and `git diff --staged`)
- `git log -5 --oneline`
- `git branch --show-current`

If there are no changes to commit, stop and tell the user there is nothing to ship.

## 2. Choose names

Using the diff and the description above:
- **Type**: `feat` for a new feature, `fix` for a bug fix, `docs` for documentation only.
- **Branch**: `<type>/<short-kebab-name>`, e.g. `feat/export-data`.
- **Commit message**: `<type>: <short description>` (lower case, no period), the style used in this repo. Add a short body if the change needs explaining. End the message with the Co-Authored-By attribution line.
- **PR title**: same as the commit subject.

## 3. Ask before doing anything

Show the user, in a short list:
- branch name (or "stay on current branch `<name>`" if not on `main`)
- the files that will be committed
- the commit message
- the PR title

Then ask for their OK and **wait**. Do not commit, push, or open the PR until they agree. If they want changes, update the names and ask again.

## 4. Ship it

After the user agrees:
1. If on `main`, run `git checkout -b <branch>`. If already on a feature branch, stay on it.
2. `git add` the specific changed files by name. Never add `.claude/settings.local.json`, `.env`, or anything that looks like a secret — warn the user if such a file is in the changes.
3. `git commit` with the agreed message.
4. `git push -u origin <branch>`.
5. `gh pr create --base main --title "<title>" --body "<body>"`. The body should have:
   - `## Summary` — 1–3 bullets on what changed and why
   - `## How to test` — steps such as "Open `index.html`, reload, and ..."
   - the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` line at the end

If any step fails, stop, show the error, and explain it simply. Do not use `--force` or skip hooks.

## 5. Report

Print the PR link. Remind the user that the pull request is now waiting on GitHub, and that **they** decide when to merge it (on GitHub, or with `gh pr merge`).
