import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

await build({
  entryPoints: ['src/host/entry.js'],
  outfile: 'index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@deepseek-ai/*'],
  logLevel: 'info',
})

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const client = await build({
  entryPoints: ['src/client/index.jsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs',
  target: ['chrome120'],
  external: ['react'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.css': 'text', '.js': 'jsx' },
  logLevel: 'info',
})

const code = client.outputFiles[0].text
const handoff = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  },
});
`
await writeFile('client.js', handoff)
