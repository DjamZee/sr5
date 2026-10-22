#!/usr/bin/env node
// npm run build:megapack [-- --complet <full Megapack repository>]
// Builds the Lite's four packs into this checkout (megapack/ and packs/sr5-megapack-*, outside Git) from the full
// Megapack's sources, by its tools/build-lite.py --cible systeme, which runs verify-lite before it is done. About
// 3 min. No Foundry may serve this checkout meanwhile: the compiled packs are replaced.

const {
  spawnSync,
} = require('child_process')
const {
  ROOT, completRepo,
} = require('./megapack-paths.js')

const complet = completRepo()
if (!complet) {
  console.error('Mégapack complet introuvable : npm run build:megapack -- --complet <dépôt megapack-sr5-foundry-vtt>')
  process.exit(2)
}
console.log(`Mégapack complet : ${complet}`)
const python = process.platform === 'win32' ? 'python' : 'python3'
const result = spawnSync(python, ['-I', 'tools/build-lite.py', '--cible', 'systeme', '--sortie', ROOT], {
  cwd: complet, stdio: 'inherit',
})
process.exit(result.status ?? 1)
