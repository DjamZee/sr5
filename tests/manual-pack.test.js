import {
  describe, it, expect
} from 'vitest'
import fs from 'fs'
import path from 'path'

// The user manual ships inside the system (DjamZ, 23/10): its journal sources live in src/packs/manuel (French) and
// src/packs/manual (English) and are compiled by `npm run build:packs`; the captures both editions cite live in
// manuel/captures, served as systems/sr5/…
const ROOT = path.resolve(import.meta.dirname, '..')

describe.each(['manuel', 'manual'])('manual compendium sources (%s)', name => {
  const SOURCES = path.join(ROOT, 'src', 'packs', name)
  const docs = fs.readdirSync(SOURCES).filter(f => f.endsWith('.json'))
    .map(f => ({
      file: f, ...JSON.parse(fs.readFileSync(path.join(SOURCES, f), 'utf8'))
    }))
  const journals = docs.filter(d => d._key?.startsWith('!journal!'))
  const pageIds = new Map(journals.map(j => [j._id, new Set(j.pages.map(p => p._id))]))
  const contents = journals.flatMap(j => j.pages.map(p => ({
    journal: j, page: p, html: p.text?.content ?? ''
  })))
  const ownLink = new RegExp(`@UUID\\[Compendium\\.sr5\\.${name}\\.JournalEntry\\.(\\w+)\\.JournalEntryPage\\.(\\w+)\\]`, 'g')
  const foreignLink = new RegExp(`@UUID\\[(?!Compendium\\.sr5\\.${name}\\.|\\.)[^\\]]*\\]`, 'g')

  it('is declared by system.json and has its sources', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'))
    const pack = manifest.packs.find(p => p.name === name)
    expect(pack).toMatchObject({
      path: `packs/${name}`, type: 'JournalEntry'
    })
    expect(journals.length).toBeGreaterThan(0)
  })

  it('gives every document a unique id and a key matching it', () => {
    const ids = docs.map(d => d._id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of docs) expect(d._key.endsWith(`!${d._id}`)).toBe(true)
    for (const j of journals) for (const p of j.pages) expect(p._key).toBe(`!journal.pages!${j._id}.${p._id}`)
  })

  it('cites only files shipped with the system', () => {
    const missing = new Set()
    for (const {
      html
    } of contents) {
      for (const [, file] of html.matchAll(/systems\/sr5\/([^"'\s)<>\\]+)/g)) {
        if (!fs.existsSync(path.join(ROOT, decodeURI(file)))) missing.add(file)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('links only to pages that exist in the same edition', () => {
    const broken = []
    for (const {
      journal, page, html
    } of contents) {
      for (const [link, entry, target] of html.matchAll(ownLink)) {
        if (!pageIds.get(entry)?.has(target)) broken.push(`${journal.name} / ${page.name}: ${link}`)
      }
      for (const [link, target] of html.matchAll(/@UUID\[\.(\w+)\]/g)) {
        if (!pageIds.get(journal._id).has(target)) broken.push(`${journal.name} / ${page.name}: ${link}`)
      }
      // A link to another compendium (the other edition included) or to the world would break elsewhere
      for (const [link] of html.matchAll(foreignLink)) broken.push(`${journal.name} / ${page.name}: ${link}`)
    }
    expect(broken).toEqual([])
  })
})
