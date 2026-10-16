import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  spellAreaRadius
} from '../modules/rolls/roll-helpers/spell-area.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// Rodolphe's survey of spell shaping (lot 3, 08/10)
describe('the radius of an area spell as cast', () => {
  it('an area spell: Force + the metres of shaping (SR5 p. 329)', () => {
    expect(spellAreaRadius({
      force: 6
    })).toBe(6)
    expect(spellAreaRadius({
      force: 6, shaping: 3
    })).toBe(9)
  })

  it('a detection spell: Force × Magic [× 10], then + 1 m per die of shaping, not × Magic', () => {
    expect(spellAreaRadius({
      force: 4, magic: 5, detection: true
    })).toBe(20)
    expect(spellAreaRadius({
      force: 4, magic: 5, detection: true, shaping: 2
    })).toBe(22)
    expect(spellAreaRadius({
      force: 4, magic: 5, detection: true, extended: true, shaping: 2
    })).toBe(202)
  })

  it('the cast reads it, and the template takes the card\'s area', () => {
    expect(read('../modules/rolls/roll-test-case/test-Spell.js')).toContain('cardData.magic.spell.area = spellAreaRadius({')
    const template = read('../modules/interface/canvas-template.js')
    expect(template).toMatch(/game\.messages\?\.get\(messageId\)\?\.flags\?\.sr5data\?\.magic\?\.spell\?\.area/)
    expect(template).toContain('target = cardArea > 0 ? cardArea : item.system.spellAreaOfEffect.value')
  })
})
