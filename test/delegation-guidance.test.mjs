// Unit verification for the host delegation-section rewrite. The host's stable
// sentence ends at "while they run."; some versions append more text after it,
// so the matcher must recognize the prefix without pinning the line end.
// Run: node test/delegation-guidance.test.mjs  (after `npm run build`)
import assert from 'node:assert/strict'
import { registerDelegationGuidance } from '../lib/delegation-guidance.js'

const ROSTER = 'use_agent'
const ASK = 'ask_agent'
const FORK_HINT = ' Use `subagent_fork` only when inheriting the current conversation is necessary.'
const GUIDANCE_WITH_FORK = [
  `When delegating, use a matching role from the \`${ROSTER}\` roster with a self-contained prompt.${FORK_HINT}`,
  'Start independent calls together; use `background=true` for custom agents and continue useful work. Wait in the foreground only when your next step depends on the result.',
  `Use \`${ASK}\` to follow up with a background custom agent and wait for its reply.`,
].join('\n\n')
const GUIDANCE_NO_FORK = GUIDANCE_WITH_FORK.replace(FORK_HINT, '')

// Fake only the ctx surface registerDelegationGuidance reads: the assemble
// listener plus the scoped tool-schema view used for visibility checks.
function makeHarness(visible = [ROSTER, 'subagent', 'subagent_fork', ASK]) {
  let handler
  const dispatch = { name: ROSTER }
  const ctx = {
    on(event, listener) {
      assert.equal(event, 'system-prompt/assemble')
      handler = listener
      return () => { handler = undefined }
    },
    tools: {
      schemas: () => visible.map(name => ({ name })),
      get: name => (name === ROSTER ? dispatch : undefined),
    },
  }
  const dispose = registerDelegationGuidance(ctx, dispatch, ASK)
  assert.ok(handler, 'guidance listener registered')
  return {
    dispose,
    async assemble(sections) {
      const assembly = { sections, tools: [], contexts: [], variables: {} }
      return handler(assembly, { scope: {} }, async () => assembly)
    },
  }
}

const BARE = 'Start independent subagent delegations together in one assistant message and continue useful work while they run.'
const BACKTICK_LIST = 'Start independent delegations with `subagent` or `subagent_fork` together in one assistant message and continue useful work while they run.'

// --- 0.2.0 bare-name section: recognized, no fork hint (fork name not named) ---

{
  const { dispose, assemble } = makeHarness()
  const result = await assemble([{ name: 'tool:subagent', text: BARE }])
  assert.equal(result.sections.length, 1, 'no fallback section when the native section is replaced')
  assert.equal(result.sections[0].text, GUIDANCE_NO_FORK, 'bare-name host section is replaced by roster guidance')
  assert.doesNotMatch(result.sections[0].text, /Use `subagent_fork` only/)
  dispose()
  console.log('PASS 0.2.0 bare-name section recognized, fork hint omitted')
}

// --- 0.2.1 backtick-list section: recognized, fork hint present ---

{
  const { dispose, assemble } = makeHarness()
  const result = await assemble([{ name: 'tool:subagent', text: BACKTICK_LIST }])
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0].text, GUIDANCE_WITH_FORK, 'backtick-list host section is replaced, fork hint kept')
  assert.match(result.sections[0].text, /Use `subagent_fork` only/)
  dispose()
  console.log('PASS 0.2.1 backtick-list section recognized, fork hint kept')
}

// --- rc.5 section with an appended tail: prefix still matches, tail replaced ---

{
  const tail = ' Additional host note about delegation that must not survive the rewrite.'
  const { dispose, assemble } = makeHarness()
  const result = await assemble([{ name: 'tool:subagent', text: BACKTICK_LIST + tail }])
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0].text, GUIDANCE_WITH_FORK, 'appended host tail is replaced by the roster guidance')
  assert.match(result.sections[0].text, /Use `subagent_fork` only/, 'fork hint survives the appended tail')
  assert.doesNotMatch(result.sections[0].text, /Additional host note/, 'appended tail is gone')
  dispose()
  console.log('PASS rc.5 appended tail replaced, fork hint still present')
}

// --- persona text that merely contains the sentence: never rewritten ---

{
  const personaText = `Per your persona: ${BACKTICK_LIST}`
  const { dispose, assemble } = makeHarness()
  const result = await assemble([{ name: 'tool:subagent', text: personaText }])
  const native = result.sections.find(section => section.name === 'tool:subagent')
  assert.equal(native.text, personaText, 'text not starting a section stays untouched')
  assert.doesNotMatch(native.text, /When delegating, use a matching role/)
  dispose()
  console.log('PASS non-section-start persona text left untouched')
}

// --- appended tail with backticks: does not leak into nativeNames ---

{
  const tail = ' Prefer `subagent_fork` when inheriting the current conversation.'
  const text = 'Start independent delegations with `subagent` together in one assistant message and continue useful work while they run.' + tail
  const { dispose, assemble } = makeHarness()
  const result = await assemble([{ name: 'tool:subagent', text }])
  const guidance = result.sections.find(section => section.text.startsWith('When delegating,'))
  assert.ok(guidance, 'native section still replaced')
  assert.equal(guidance.text, GUIDANCE_NO_FORK, 'backticks in the appended tail are not captured as native names')
  assert.doesNotMatch(guidance.text, /Use `subagent_fork` only/)
  dispose()
  console.log('PASS backticks in appended tail do not pollute nativeNames')
}

// --- fork tool hidden from the scope: no fork hint even though it is named ---

{
  const { dispose, assemble } = makeHarness([ROSTER, 'subagent', ASK])
  const result = await assemble([{ name: 'tool:subagent', text: BACKTICK_LIST }])
  const guidance = result.sections.find(section => section.text.startsWith('When delegating,'))
  assert.ok(guidance, 'section still replaced when fork is hidden')
  assert.equal(guidance.text, GUIDANCE_NO_FORK, 'hidden fork tool suppresses the fork hint')
  assert.doesNotMatch(guidance.text, /Use `subagent_fork` only/)
  dispose()
  console.log('PASS hidden subagent_fork suppresses fork hint')
}

console.log('\nAll assertions passed.')
