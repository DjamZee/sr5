#!/usr/bin/env node
// npm run verify:megapack [-- --complet <full Megapack repository>]
// The guard of the Lite inside the system: the full Megapack's verify-lite on this checkout's copy (no book text, no
// Catalyst image, same documents and _id as the full one). A checkout where build:megapack never ran has nothing to
// ship and nothing to check: it says so and passes. A partial or unverifiable copy fails.

const {
  spawnSync,
} = require('child_process')
const fs = require('fs')
const path = require('path')
const {
  ROOT, megapackPacks, lastBuild, completRepo, headOf, sameSources,
} = require('./megapack-paths.js')

const packs = megapackPacks()
const built = packs.filter(p => fs.existsSync(path.join(ROOT, p.path, 'CURRENT')))
if (!built.length) {
  console.log('Mégapack Lite : packs non construits dans ce dossier (npm run build:megapack), contrôle sauté')
  process.exit(0)
}
if (built.length < packs.length) {
  console.error(`Mégapack Lite : ${built.length}/${packs.length} packs construits ; relancer npm run build:megapack`)
  process.exit(1)
}
const build = lastBuild()
if (!build) {
  console.error('Mégapack Lite : packs présents sans megapack/BUILD.json ; relancer npm run build:megapack')
  process.exit(1)
}
const complet = completRepo()
if (!complet) {
  console.error('Mégapack Lite : packs présents mais Mégapack complet introuvable (-- --complet <dépôt>) : verify-lite impossible')
  process.exit(1)
}
// The full Megapack's sources moved since the build (not only its commit): they are no longer those of the copy. Text
// and images are still checked; the comparison (same documents, same _id) is skipped, and the output says so.
const head = headOf(complet)
const compare = !build.sourcesModifiees && sameSources(complet, build)
if (!compare) {
  console.log(`Mégapack Lite : complet à ${head?.slice(0, 8) ?? '?'}, copie construite depuis ${build.commit.slice(0, 8)}` +
    `${build.sourcesModifiees ? ' (sources modifiées)' : ''}, sources différentes : comparaison au complet sautée`)
}
const result = spawnSync('node', [path.join(complet, 'tools', 'verify-lite.mjs'), '--cible', 'systeme', '--lite', ROOT,
  '--complet', complet, ...(compare ? [] : ['--sans-complet'])], {
  cwd: complet, stdio: 'inherit',
})
process.exit(result.status ?? 1)
