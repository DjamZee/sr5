#!/usr/bin/env node
// Compiles the system's compendiums from their JSON sources (src/packs/<name>) into the LevelDB folders that
// system.json declares (packs/<name>); a pack with no sources here must arrive compiled. The LevelDB folders are not tracked by Git: Foundry writes into them
// as soon as it serves them, so every checkout builds its own, here or through `npm run check`.
//
// A pack is rebuilt only when its sources changed (fingerprint kept inside the LevelDB folder), so a checkout
// served by an open Foundry still passes the check once its pack is built. Rebuilding goes through a fresh
// folder swapped in place: compilePack never removes the entries of a page that left the sources.

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STAMP = 'SR5-SOURCES-SHA256'

function sourceFiles(dir) {
  return fs.readdirSync(dir, {
    recursive: true
  }).filter(f => /\.(json|ya?ml)$/.test(f)).map(f => f.split(path.sep).join('/')).sort()
}

function fingerprint(dir) {
  const hash = crypto.createHash('sha256')
  for (const f of sourceFiles(dir)) hash.update(f).update('\0').update(fs.readFileSync(path.join(dir, f))).update('\0')
  return hash.digest('hex')
}

function readStamp(dest) {
  try {
    if (!fs.existsSync(path.join(dest, 'CURRENT'))) return null
    return fs.readFileSync(path.join(dest, STAMP), 'utf8').trim()
  } catch (_) {
    return null
  }
}

async function buildPack(compilePack, pack) {
  const source = path.join(ROOT, 'src', 'packs', pack.name)
  const dest = path.join(ROOT, pack.path)
  // A pack built by its own step (flags.sr5.build, e.g. "megapack" for npm run build:megapack) is left to it
  const builder = pack.flags?.sr5?.build
  if (builder) return console.log(`  ${pack.name}: construit par npm run build:${builder} : ${fs.existsSync(path.join(dest, 'CURRENT')) ? 'présent' : 'absent'}, sauté`)
  // A pack without JSON sources here is copied in already compiled: it only has to be there
  if (!fs.existsSync(source)) {
    if (fs.existsSync(path.join(dest, 'CURRENT'))) return console.log(`  ${pack.name}: compilé ailleurs, présent`)
    throw new Error(`${pack.name}: ni sources (${path.relative(ROOT, source)}) ni compendium compilé (${pack.path})`)
  }
  const sha = fingerprint(source)
  if (readStamp(dest) === sha) return console.log(`  ${pack.name}: à jour`)

  const fresh = `${dest}.build-${process.pid}`
  const old = `${dest}.old-${process.pid}`
  fs.rmSync(fresh, {
    recursive: true, force: true
  })
  await compilePack(source, fresh, {
    recursive: true, log: false
  })
  fs.writeFileSync(path.join(fresh, STAMP), `${sha}\n`)
  try {
    if (fs.existsSync(dest)) fs.renameSync(dest, old)
  } catch (err) {
    fs.rmSync(fresh, {
      recursive: true, force: true
    })
    throw new Error(`${pack.name}: ${path.relative(ROOT, dest)} est ouvert (Foundry le sert ?) : fermez Foundry, ` +
      `puis relancez « npm run build:packs » (${err.code})`, {
      cause: err
    })
  }
  fs.renameSync(fresh, dest)
  fs.rmSync(old, {
    recursive: true, force: true
  })
  console.log(`  ${pack.name}: compilé (${sourceFiles(source).length} documents) → ${path.relative(ROOT, dest)}`)
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'))
  const {
    compilePack
  } = await import('@foundryvtt/foundryvtt-cli')
  for (const pack of manifest.packs ?? []) await buildPack(compilePack, pack)
}

main().catch(err => {
  console.error(`  ${err.message}`)
  process.exit(1)
})
