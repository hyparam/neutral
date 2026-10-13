// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mayorSkill = readFileSync(join(root, '.claude/skills/neutral-mayor/SKILL.md'), 'utf8')

// @ref LLP 0067#rendered-view [tests] — the model-rendered canvas has a static, source-grounded slot contract
test('mayor renders linked admission-slot consumers as the first canvas section', () => {
  const canvas = mayorSkill.slice(mayorSkill.indexOf('### 3. Repaint the channel canvas'))

  assert.match(canvas, /1\. \*\*Work slots\*\*[\s\S]*2\. \*\*Fleet at a glance\*\*/)
  assert.match(canvas, /use the `admission` object from[\s\S]*`neutral observe --json`/)
  assert.match(canvas, /never recount PRs, branches, or issues/)
  assert.match(canvas, /`admission\.active` in its emitted order/)
  assert.match(canvas, /kind: "pr"[\s\S]*GitHub PR/)
  assert.match(canvas, /kind: "issue"[\s\S]*GitHub issue/)
  assert.match(canvas, /kind: "changeset"[\s\S]*GitHub tree/)
  assert.match(canvas, /artifact-root `\[thread\]\(\.\.\.\)` permalink/)
})

// @ref LLP 0067#rendered-view [tests] — every configured slot stays visible without misclassifying frozen work
test('mayor accounts for available, overflow, zero-limit, and frozen admission states', () => {
  assert.match(mayorSkill, /remaining configured slot[\s\S]*`available`/)
  assert.match(mayorSkill, /`admission\.used > admission\.limit`[\s\S]*`overflow`/)
  assert.match(mayorSkill, /zero limit[\s\S]*`0\/0 occupied — paused`/)
  assert.match(mayorSkill, /Do not put `admission\.frozen` in Work slots/)
})

// @ref LLP 0082#dialog-wedge [tests] — a visible dialog is reported and healed even when the transcript is fresh
test('watchdog and mayor treat a visible confirmation dialog as a wedge', () => {
  const watchdogSkill = readFileSync(join(root, '.claude/skills/neutral-watchdog/SKILL.md'), 'utf8')
  assert.match(watchdogSkill, /Dialog on screen — overrides freshness[\s\S]*\*\*every\*\* session on every\s+tick/)
  assert.match(watchdogSkill, /log `state=dialog`[\s\S]*even when the\s+transcript is fresh/)
  assert.match(watchdogSkill, /Never\s+type into the pane/)
  assert.match(watchdogSkill, /Second consecutive tick\*\* showing the same dialog: respawn/)
  assert.match(watchdogSkill, /state=<healthy\|busy\|dialog\|/)
  assert.match(mayorSkill, /\*\*Dialog on screen\*\* \(LLP 0082\)[\s\S]*Key: `\[neutral session=<name> dialog\]`/)
  assert.match(mayorSkill, /`🔴 dialog`/)
})
