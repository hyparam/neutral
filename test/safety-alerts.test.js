// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { reportSafety } from '../docker/outage-sentinel.js'

// @ref LLP 0072#evidence-alerts [tests] — direct alert does not need a model, gateway, or silence threshold
// Only in-memory HTTP responses are used here; no Slack messages are sent.
test('safety alerts dedupe a held boot and distinguish rearm from successful usage', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  /** @type {{ text: string, ts: string }[]} */
  const messages = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').at(-1)
    if (method === 'conversations.history') return new Response(JSON.stringify({ ok: true, messages }))
    assert.equal(method, 'chat.postMessage')
    const body = JSON.parse(String(init?.body))
    messages.push({ text: body.text, ts: `${messages.length + 1}.0` })
    return new Response(JSON.stringify({ ok: true, ts: '1.0' }))
  }
  const hold = { id: 'incident-1', at: 1_800_000_000_000, reason: 'second failure within 60 minutes' }
  const env = { SLACK_BOT_TOKEN: 'fake-test-token', SLACK_CHANNEL_ID: 'fake-test-channel' }
  const status = { held: true, hold, counts: { failuresHour: 2, failuresDay: 2 } }
  await reportSafety(status, env)
  await reportSafety(status, env)
  assert.equal(messages.length, 1)
  assert.match(messages[0].text, /safety-hold@incident-1/)
  assert.match(messages[0].text, /Model launches are disabled/)
  assert(!messages[0].text.includes('fake-test-token'))
  await reportSafety({ held: false, lastHold: hold }, env)
  assert.equal(messages.length, 2)
  assert.match(messages[1].text, /safety-rearmed@incident-1/)
  assert.match(messages[1].text, /new model usage is verified separately/)
})

test('no Slack configuration requires no network activity', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => { throw new Error('unexpected network') }
  await reportSafety({ held: true, hold: { id: 'incident' } }, {})
})
