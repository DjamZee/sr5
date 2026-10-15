import {
  describe, expect, it
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// P1-37 (relecture djamz.13): a vendor is a Grunt, and the Grunt sheet never listed its storages,
// so the + of the Storages block created one that nobody saw
describe('Grunt sheet storages', () => {
  it('lists its storages through the shared preparation', () => {
    const grunt = read('../modules/entities/actors/gruntSheet.js')
    expect(grunt).toContain('else if (i.type === "itemStorage") storages.push(i)')
    expect(grunt).toContain('actor.storages = this._prepareStorages(actor, storages)')
  })

  it('the preparation lives on the base sheet, shared with the character sheet', () => {
    expect(read('../modules/entities/actors/baseSheet.js')).toMatch(/\n {2}_prepareStorages\(actor, storages\) \{/)
    expect(read('../modules/entities/actors/characterSheet.js')).not.toMatch(/\n {2}_prepareStorages\(/)
  })
})
