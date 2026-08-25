// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// @ref LLP 0066#invocation-and-packaging [tests] — the mayor can discover the read-only process skill in the loop image
test('the mayor process-question skill is present, invokable, and installed in the image', () => {
  const processSkillPath = join(root, '.claude/skills/neutral-process/SKILL.md')
  const mayorSkill = readFileSync(join(root, '.claude/skills/neutral-mayor/SKILL.md'), 'utf8')
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')

  assert.equal(existsSync(processSkillPath), true)
  assert.match(readFileSync(processSkillPath, 'utf8'), /^---\nname: neutral-process\n/m)
  assert.match(mayorSkill, /^allowed-tools: .*\bSkill\b/m)
  assert.match(mayorSkill, /Skill tool[\s\S]*?with `neutral-process`/)
  assert.match(dockerfile, /\.claude\/skills\/neutral-process \/home\/neutral\/\.claude\/skills\/neutral-process/)
})
