import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { PresetsController, saveRequest, isDirty } from '../src/client/presets-state.ts'

const original = { id: 'engineer', version: 'v1', fields: { name: 'engineer', display_name: 'Engineer', model: 'custom/unlisted', thinking: 'high' }, body: 'Persona\n\n', source: '---\nname: engineer\n# comment\n---\nPersona\n\n', structured: true }
const list = { directory: 'isolated/agents', entries: [original] }
const requests = []
let saveReply = { ok: true, value: original }
let listReply = { ok: true, value: list }
let modelError
const controller = new PresetsController({
  async call(endpoint, payload) { requests.push({ endpoint, payload }); return endpoint === 'list' ? listReply : endpoint === 'save' ? saveReply : { ok: true, value: null } },
  async models() { if (modelError) throw new Error(modelError); return { default: { provider: 'p', model: 'm' }, groups: [], failures: [], routableProviders: [] } },
})
await controller.load()
assert.equal(controller.getSnapshot().status, 'ready')
controller.start('edit', original)
assert.equal(isDirty(controller.getSnapshot().draft), false)
controller.field('name', 'renamed')
assert.equal(controller.getSnapshot().draft.fields.name, 'engineer')
controller.field('description', 'Only changed field')
assert.deepEqual(saveRequest(controller.getSnapshot().draft), { id: 'engineer', version: 'v1', patch: { description: 'Only changed field' } })
assert.equal(controller.getSnapshot().draft.body, 'Persona\n\n')
controller.field('deep', '')
assert.equal(saveRequest(controller.getSnapshot().draft).patch.deep, undefined)
controller.discard('refresh')
assert.equal(controller.getSnapshot().confirmation.kind, 'discard')
controller.cancelConfirmation()
const draft = controller.getSnapshot().draft
// Losing all React subscribers represents the host switching to another panel.
const unmount = controller.subscribe(() => {})
unmount()
controller.open()
await controller.load()
assert.equal(controller.getSnapshot().draft, draft)
modelError = 'catalog offline'
await controller.loadModels()
assert.equal(controller.getSnapshot().catalogStatus, 'error')
assert.equal(controller.getSnapshot().draft.fields.model, 'custom/unlisted')
saveReply = { ok: false, code: 'conflict', error: 'External edit', field: 'description' }
await controller.save()
assert.equal(controller.getSnapshot().draft, draft)
assert.equal(controller.getSnapshot().failure.field, 'description')
controller.field('display_name', '')
const beforeConfirm = requests.length
await controller.save()
assert.equal(requests.length, beforeConfirm)
assert.equal(controller.getSnapshot().confirmation.kind, 'display')
const confirmedDraft = controller.getSnapshot().draft
controller.field('description', 'Changed after confirmation')
controller.text('body', 'Changed after confirmation')
assert.equal(controller.getSnapshot().draft, confirmedDraft)
controller.cancelConfirmation()
assert.equal(requests.length, beforeConfirm)
await controller.save()
await controller.confirm()
assert.equal(requests.at(-1).payload.confirmDisplayName, true)
assert.equal(requests.at(-1).payload.patch.display_name, null)
controller.discard('list')
await controller.confirm()
controller.start('copy', original)
assert.equal(controller.getSnapshot().draft.fields.name, undefined)
controller.field('name', 'engineer-copy')
assert.deepEqual(saveRequest(controller.getSnapshot().draft), { id: 'engineer-copy', version: null, patch: { name: 'engineer-copy', display_name: 'Engineer', model: 'custom/unlisted', thinking: 'high' }, body: 'Persona\n\n' })
assert.equal(original.fields.name, 'engineer')
controller.discard('list')
await controller.confirm()
controller.start('create')
assert.equal(isDirty(controller.getSnapshot().draft), false)
assert.deepEqual(saveRequest(controller.getSnapshot().draft), { id: '', version: null })
controller.field('deep', '0')
controller.field('background', 'false')
controller.field('maxRounds', '3')
assert.deepEqual(saveRequest(controller.getSnapshot().draft).patch, { deep: '0', background: 'false', maxRounds: '3' })
controller.discard('list')
await controller.confirm()
const broken = { ...original, structured: false, error: 'Full parser diagnostic\nsecond line' }
controller.start('edit', broken)
assert.equal(controller.getSnapshot().draft.mode, 'repair')
assert.equal(controller.getSnapshot().draft.source, broken.source)
controller.text('source', broken.source + 'Repair')
assert.deepEqual(saveRequest(controller.getSnapshot().draft), { id: 'engineer', version: 'v1', source: broken.source + 'Repair' })
saveReply = { ok: false, code: 'confirmation_required', error: 'Display label changed' }
await controller.save()
assert.equal(controller.getSnapshot().confirmation.kind, 'display')
const repairDraft = controller.getSnapshot().draft
controller.cancelConfirmation()
assert.equal(controller.getSnapshot().draft, repairDraft)
await controller.save()
saveReply = { ok: true, value: original }
await controller.confirm()
assert.equal(requests.at(-2).payload.source, broken.source + 'Repair')
assert.equal(requests.at(-2).payload.confirmDisplayName, true)
assert.equal(controller.getSnapshot().draft, undefined)
controller.askDelete(original)
controller.cancelConfirmation()
assert.equal(requests.at(-1).endpoint, 'list')
controller.askDelete(original)
await controller.confirm()
assert.deepEqual(requests.at(-2), { endpoint: 'remove', payload: { id: 'engineer', version: 'v1' } })
listReply = { ok: false, error: 'Permission denied', code: 'directory' }
await controller.load()
assert.equal(controller.getSnapshot().status, 'error')
assert.equal(controller.getSnapshot().list, list)
listReply = { ok: true, value: { directory: list.directory, entries: [] } }
await controller.load()
assert.equal(controller.getSnapshot().status, 'ready')
assert.equal(controller.getSnapshot().list.entries.length, 0)
controller.dispose()
assert.equal(controller.getSnapshot().listError, undefined)

// Compile the actual components and mount their public slot registrations with a tiny host face.
// This checks component props and lifecycle wiring; it is not a real browser/React renderer.
const root = fileURLToPath(new URL('../', import.meta.url))
const bundled = await build({ absWorkingDir: root, entryPoints: ['src/client/index.ts'], outfile: resolve(root, 'client-test.js'), bundle: true, write: false, format: 'cjs', platform: 'browser', packages: 'external', jsx: 'automatic', loader: { '.module.css': 'local-css' } })
const css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text
const js = bundled.outputFiles.find(file => file.path.endsWith('.js')).text
assert.match(css, /--dsw-alias-label-primary/)
const mountedEffects = []
const element = (type, props) => ({ type, props })
const react = { createElement: element, useEffect: effect => { mountedEffects.push(effect) }, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useId: () => 'test-field', useRef: () => ({ current: null }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] }
const module = { exports: {} }
const styleNodes = []
const document = { createElement: () => ({ dataset: {}, remove() { styleNodes.splice(styleNodes.indexOf(this), 1) } }), head: { append(node) { styleNodes.push(node) } } }
runInNewContext(js, { module, exports: module.exports, __PRESETS_CSS__: css, document, require(id) {
  if (id === 'react') return react
  if (id === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Button: 'HostButton', Input: 'HostInput', Modal: 'HostModal' }
  throw new Error(`Unexpected bundled dependency ${id}`)
} })
const registrations = new Map()
const cleanups = []
const navigation = []
module.exports.apply({
  effect(effect) { cleanups.push(effect()) },
  slots: { inject(_slot, callback) { cleanups.push(callback()) }, register(options, component) { registrations.set(options.name, { options, component }); return () => registrations.delete(options.name) } },
  layout: { selectPanel(id) { navigation.push(id) } },
  connection: { rpc: { async call(channel, endpoint, payload) { assert.equal(channel, '/api'); if (endpoint === 'subagent-presets/save') return { ok: true, value: { ok: false, code: 'invalid_id', field: 'id', error: 'Unsafe name' } }; assert.equal(endpoint, 'subagent-presets/list'); assert.equal(payload, null); return { ok: true, value: { ok: true, value: list } } } } },
  remote: {
    session: {
      async modelCatalog() {
        return {
          ok: true,
          value: {
            default: { provider: 'openai', model: 'gpt-6.1-sol' },
            groups: [
              {
                id: 'openai',
                name: 'OpenAI',
                models: [
                  {
                    id: 'gpt-6.1-sol',
                    name: 'GPT-6.1 Sol',
                    reasoning: {
                      efforts: [
                        { id: 'off', name: 'Off' },
                        { id: 'low', name: 'Low' },
                        { id: 'medium', name: 'Medium' },
                        { id: 'high', name: 'High' },
                        { id: 'xhigh', name: 'Xhigh' },
                        { id: 'max', name: 'Max' },
                      ],
                      defaultEffort: 'medium',
                    },
                  },
                  { id: 'gpt-4o', name: 'GPT-4o' },
                ],
              },
              {
                id: 'deepseek',
                name: 'DeepSeek',
                models: [
                  {
                    id: 'deepseek-flash',
                    name: 'DeepSeek V4.1 Flash',
                    reasoning: {
                      efforts: [
                        { id: 'off', name: 'Off' },
                        { id: 'low', name: 'Low' },
                        { id: 'high', name: 'High' },
                        { id: 'max', name: 'Max' },
                      ],
                    },
                  },
                ],
              },
            ],
            failures: [],
          },
        }
      },
    },
  },
})
assert.equal(styleNodes.length, 1)
assert.equal(styleNodes[0].textContent, css)
const main = registrations.get('main')
const sidebar = registrations.get('sidebar.panellist')
assert.equal(main.options.key, 'subagent-presets')
assert.equal(sidebar.options.id, 'subagent-presets')
assert.equal(sidebar.options.label, '子智能体')
assert.equal(sidebar.options.order, 50)
const icon = sidebar.component({ size: 16 })
assert.equal(icon.type, 'svg')
assert.equal(icon.props.width, 16)
assert.equal(icon.props.height, 16)
const pageController = main.options.inject().controller
await pageController.load()
await pageController.loadModels()
pageController.start('edit', original)
const tree = main.component({ controller: pageController })
const nodes = []
function collect(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(collect); return } nodes.push(node); collect(node.props?.children) }
collect(tree)
const byId = id => nodes.find(node => node.props?.id === `test-field-${id}`)
assert.equal(byId('name').props.readOnly, true)
assert.equal(byId('model').props.value, 'custom/unlisted')
assert.equal(byId('body').props.value, 'Persona\n\n')
assert.equal(byId('deep').props.value, '')
assert.equal(byId('maxRounds').props.value, '')
assert.equal(byId('thinking').type, 'select')
assert.equal(byId('background').type, 'select')
assert.ok(nodes.some(node => node.type === 'details' && node.props.open === false))
for (const id of ['name', 'display_name', 'description', 'model', 'thinking', 'body', 'deep', 'background', 'maxRounds']) assert.ok(nodes.some(node => node.type === 'label' && node.props.htmlFor === `test-field-${id}`))

// Verify dynamic model selection and reasoning efforts
pageController.field('model', 'openai/gpt-6.1-sol')
nodes.length = 0
collect(main.component({ controller: pageController }))
const solThinking = Array.from(byId('thinking').props.children.map(opt => opt.props.value))
assert.deepEqual(solThinking, ['', 'off', 'low', 'medium', 'high', 'xhigh', 'max'])
assert.equal(byId('thinking').props.disabled, false)

pageController.field('model', 'deepseek/deepseek-flash')
nodes.length = 0
collect(main.component({ controller: pageController }))
const flashThinking = Array.from(byId('thinking').props.children.map(opt => opt.props.value))
assert.deepEqual(flashThinking, ['', 'off', 'low', 'high', 'max'])
assert.equal(byId('thinking').props.disabled, false)

pageController.field('model', 'openai/gpt-4o')
nodes.length = 0
collect(main.component({ controller: pageController }))
assert.equal(byId('thinking').props.disabled, true)
assert.equal(byId('thinking').props.children[0].props.children, '不支持思考强度（继承/关闭）')

pageController.discard('list')
if (pageController.getSnapshot().confirmation) await pageController.confirm()

// Verify card presentation and thinking intensity in list view
nodes.length = 0
collect(main.component({ controller: pageController }))
const card = nodes.find(node => node.type === 'article')
assert.ok(card, 'Card article must be rendered for preset entries')
const thinkingChip = nodes.find(node => node.props?.['data-kind'] === 'thinking')
assert.ok(thinkingChip, 'Thinking chip must be present in card meta')
assert.equal(thinkingChip.props?.['data-active'], 'true')
assert.equal(thinkingChip.props?.['data-level'], 'high')
assert.ok(nodes.some(node => node.props?.children === '思考强度：'))
assert.ok(nodes.some(node => node.props?.children === 'high'))
assert.ok(nodes.some(node => node.props?.['data-kind'] === 'model'))
assert.ok(nodes.some(node => node.props?.children === 'engineer.md'))
assert.ok(nodes.some(node => node.props?.['data-status'] === 'ready'))

pageController.start('create')
pageController.field('name', '../unsafe')
await pageController.save()
nodes.length = 0
collect(main.component({ controller: pageController }))
assert.equal(byId('name').props['aria-invalid'], true, 'backend file id errors must target the internal-name input')
assert.ok(nodes.some(node => node.props?.id === 'test-field-name-error' && node.props.children === 'Unsafe name'))
for (const cleanup of cleanups.reverse()) cleanup()
assert.equal(styleNodes.length, 0)
assert.equal(registrations.size, 0)
console.log('Client state and compiled slot/component checks passed (patches, draft lifetime, confirmations, failures, fields, launcher effect, scoped styles and disposal).')
