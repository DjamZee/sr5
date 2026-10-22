#!/usr/bin/env node
// Brings a new edition of the user manual into the system, from the manuel-sr5 repository where it is written:
// its journal sources (src/packs/manuel/*.json, made by its `npm run journal`) and the captures they cite
// (captures/*.webp). Both folders are mirrored: a page or a capture gone from the manual leaves the system too.
// Then `npm run build:packs` compiles the compendium, and the result is committed like any other change.
//
//   npm run import:manuel -- "<path to manuel-sr5>"

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CAPTURES_URL = 'systems/sr5/manuel/captures/'

function mirror(files, fromDir, toDir) {
  fs.mkdirSync(toDir, {
    recursive: true
  })
  const keep = new Set(files)
  let removed = 0
  for (const f of fs.readdirSync(toDir)) {
    if (!keep.has(f)) {
      fs.rmSync(path.join(toDir, f))
      removed++
    }
  }
  for (const f of files) fs.copyFileSync(path.join(fromDir, f), path.join(toDir, f))
  return removed
}

function main() {
  const repo = process.argv[2]
  if (!repo) throw new Error('chemin du dépôt manuel-sr5 attendu : npm run import:manuel -- "<chemin>"')
  const journalDir = path.join(repo, 'src', 'packs', 'manuel')
  const capturesDir = path.join(repo, 'captures')
  if (!fs.existsSync(journalDir)) throw new Error(`${journalDir} introuvable : lancer « npm run journal » dans manuel-sr5`)

  const journals = fs.readdirSync(journalDir).filter(f => f.endsWith('.json')).sort()
  const cited = new Set()
  for (const f of journals) {
    const text = fs.readFileSync(path.join(journalDir, f), 'utf8')
    for (const m of text.matchAll(/systems\/sr5\/manuel\/captures\/([^"'\s)<>\\]+)/g)) cited.add(m[1])
  }
  const missing = [...cited].filter(c => !fs.existsSync(path.join(capturesDir, c)))
  if (missing.length) throw new Error(`captures citées absentes de manuel-sr5 : ${missing.join(', ')}`)

  const removedJournals = mirror(journals, journalDir, path.join(ROOT, 'src', 'packs', 'manuel'))
  const captures = [...cited].sort()
  const removedCaptures = mirror(captures, capturesDir, path.join(ROOT, 'manuel', 'captures'))
  console.log(`  ${journals.length} fichiers de journal, ${captures.length} captures (${CAPTURES_URL}) ; ` +
    `retirés : ${removedJournals} fichiers, ${removedCaptures} captures`)
  console.log('  Ensuite : npm run build:packs, puis git add src/packs/manuel manuel/captures')
}

try {
  main()
} catch (err) {
  console.error(`  ${err.message}`)
  process.exit(1)
}
