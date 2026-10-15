import { build } from 'esbuild'
import ts from 'typescript'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const check = args.includes('--check')
const sdkArg = args.indexOf('--sdk')
const sdk = sdkArg < 0 ? undefined : resolve(args[sdkArg + 1])
const outArg = args.indexOf('--outdir')
const outdir = outArg < 0 ? resolve(root, 'lib') : resolve(args[outArg + 1])

const config = ts.readConfigFile(resolve(root, 'tsconfig.client.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { outDir: resolve(outdir, 'types'), noEmit: check })
const host = ts.createCompilerHost(parsed.options)
// --sdk selects one published closure for every SDK import, including Context merges.
if (sdk) host.resolveModuleNames = (names, containingFile) => names.map(name => ts.resolveModuleName(
  name, name.startsWith('@deepseek-ai/') ? resolve(sdk, '__client-types__.ts') : name === 'react' || name.startsWith('react/') ? resolve(root, 'src/client/index.ts') : containingFile, parsed.options, ts.sys,
).resolvedModule)
const program = ts.createProgram(parsed.fileNames, parsed.options, host)
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: value => value, getCurrentDirectory: () => root, getNewLine: () => '\n' }))
  process.exitCode = 1
} else {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/client/index.ts'],
    outfile: resolve(outdir, 'client.js'),
    bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022',
    packages: 'external', jsx: 'automatic', legalComments: 'none',
    loader: { '.module.css': 'local-css' },
    metafile: true,
  })
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text
  const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''
  const factory = `window.__ModuleLoader__.load({id:"@aiwayds/dsh-subagent-registry",factory:(require)=>{const __PRESETS_CSS__=${JSON.stringify(css)};const module={exports:{}};const exports=module.exports;\n${js}\nreturn module.exports;}});\n`
  // Assert the artifact protocol and that host singletons remain require() edges.
  if (!css || !js.includes('require("react') || !js.includes('require("@deepseek-ai/dsh-client-ui-primitives")')) throw new Error('Missing scoped CSS or host singleton externals')
  if (check) console.log(`Client types and factory build passed${sdk ? ` against ${sdk}` : ''}; ${Buffer.byteLength(factory)} bytes (no files written).`)
  else {
    const emitted = program.emit()
    if (emitted.emitSkipped) throw new Error('Client declaration emit failed')
    await mkdir(outdir, { recursive: true })
    await writeFile(resolve(outdir, 'client.js'), factory)
    console.log(`Built ${resolve(outdir, 'client.js')} and ${resolve(outdir, 'types/client/index.d.ts')}`)
  }
}
