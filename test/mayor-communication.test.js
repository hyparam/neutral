// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mayorSkill = readFileSync(join(root, '.claude/skills/neutral-mayor/SKILL.md'), 'utf8')

// @ref LLP 0068#plain-language [tests] — the always-loaded mayor prompt carries the small, plain voice
test('mayor answers are plain and brief by default', () => {
  assert.match(mayorSkill, /Use very simple language/)
  assert.match(mayorSkill, /everyday words, short sentences, and[\s\S]*concrete verbs/)
  assert.match(mayorSkill, /Most replies fit in 1–3[\s\S]*short paragraphs or a small list/)
  assert.match(mayorSkill, /add detail only when the human asks/)
  assert.match(mayorSkill, /explain it in plain[\s\S]*words the first time/)
})

// @ref LLP 0068#show-me [tests] — visual asks load the copied skill instead of growing prose
// @ref LLP 0068#packaging [tests] — the loop image exposes the skill to the mayor
test('show-me is present, invoked by the mayor, and installed in the image', () => {
  const showMePath = join(root, '.claude/skills/show-me/SKILL.md')
  const showMeExamplesPath = join(root, '.claude/skills/show-me/EXAMPLES.md')
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')

  assert.equal(existsSync(showMePath), true)
  assert.equal(existsSync(showMeExamplesPath), true)
  const showMeSkill = readFileSync(showMePath, 'utf8')
  assert.match(showMeSkill, /^---\nname: show-me\n/m)
  assert.match(showMeSkill, /^description: .*Use when /m)
  assert.ok(showMeSkill.split('\n').length <= 100)
  assert.match(showMeSkill, /Slack-native output/)
  assert.match(showMeSkill, /`<url\|label>`/)
  assert.match(showMeSkill, /fenced code blocks/)
  assert.doesNotMatch(showMeSkill, /```mermaid|Bash\(open|focused HTML/)
  assert.match(mayorSkill, /says \*\*“show me”\*\*[\s\S]*Skill tool with `show-me`/)
  assert.match(mayorSkill, /smallest useful text visual/)
  assert.match(dockerfile, /\.claude\/skills\/show-me \/home\/neutral\/\.claude\/skills\/show-me/)
})
