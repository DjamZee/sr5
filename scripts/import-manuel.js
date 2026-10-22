#!/usr/bin/env node
// Brings a new edition of the user manual into the system, from the manuel-sr5 repository where it is written:
// its journal sources (src/packs/manuel/*.json for the French edition, src/packs/manual/*.json for the English one,
// made by its `npm run journal` and `npm run journal:en`) and the captures they cite (captures/*.webp, shared by
// both editions). Every folder is mirrored: a page or a capture gone from the manual leaves the system too.
// Then `npm run build:packs` compiles the compendiums, and the result is committed like any other change.
//
//   npm run import:manuel -- "<path to manuel-sr5>"

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CAPTURES_URL = 'systems/sr5/manuel/captures/'
// French edition first: it is required; the English one is imported when manuel-sr5 has built it
const EDITIONS = [{
  pack: 'manuel', required: true
}, {
  pack: 'manual', required: false
}]

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
  const capturesDir = path.join(repo, 'captures')
  const cited = new Set()
  const editions = []
  for (const {
    pack, required
  } of EDITIONS) {
    const journalDir = path.join(repo, 'src', 'packs', pack)
    if (!fs.existsSync(journalDir)) {
      if (required) throw new Error(`${journalDir} introuvable : lancer « npm run journal » dans manuel-sr5`)
      console.log(`  ${pack} : absent de manuel-sr5, non importé`)
      continue
    }
    const journals = fs.readdirSync(journalDir).filter(f => f.endsWith('.json')).sort()
    for (const f of journals) {
      const text = fs.readFileSync(path.join(journalDir, f), 'utf8')
      for (const m of text.matchAll(/systems\/sr5\/manuel\/captures\/([^"'\s)<>\\]+)/g)) cited.add(m[1])
    }
    editions.push({
      pack, journalDir, journals
    })
  }
  const missing = [...cited].filter(c => !fs.existsSync(path.join(capturesDir, c)))
  if (missing.length) throw new Error(`captures citées absentes de manuel-sr5 : ${missing.join(', ')}`)

  for (const {
    pack, journalDir, journals
  } of editions) {
    const removed = mirror(journals, journalDir, path.join(ROOT, 'src', 'packs', pack))
    console.log(`  ${pack} : ${journals.length} fichiers de journal ; retirés : ${removed} fichiers`)
  }
  const captures = [...cited].sort()
  const removedCaptures = mirror(captures, capturesDir, path.join(ROOT, 'manuel', 'captures'))
  console.log(`  ${captures.length} captures (${CAPTURES_URL}) ; retirées : ${removedCaptures} captures`)
  console.log(`  Ensuite : npm run build:packs, puis git add ${editions.map(e => `src/packs/${e.pack}`).join(' ')} manuel/captures`)
}

try {
  main()
} catch (err) {
  console.error(`  ${err.message}`)
  process.exit(1)
}
