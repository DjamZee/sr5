import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

vi.mock('../modules/rolls/roll-prepare.js', () => ({
  SR5_PrepareRollTest: {
    rollTest: vi.fn()
  },
}))

const {
  SR5_RitualCircle
} = await import('../modules/rolls/roll-helpers/ritualCircle.js')

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// Relecture du 21/10 (Apolline), D9: the touches left over
describe('relecture du 21/10, D9', () => {
  it('an @UUID link on an actor sheet: no grey written out, a broken one struck through, as on the item sheet', () => {
    const less = read('styles/actor-sheet.less')
    const block = less.slice(less.indexOf('&.content-link, &.inline-roll {'))
    expect(block).not.toMatch(/^[^}]*rgb\(221, 221, 221\)/)
    expect(block).toMatch(/^[^}]*background: var\(--sr-text-color-light\);\s*&\.broken \{[^}]*text-decoration: line-through;/)
  })
  it('the texts: « repérés », « Spell information »', () => {
    const fr = JSON.parse(read('lang/fr.json')), en = JSON.parse(read('lang/en.json'))
    expect(fr['SR5.ToxinBookCreateHint']).toContain('(repérés par leur nom)')
    expect(en['SR5.SpellInformation']).toBe('Spell information')
  })
  it('the ritual circle card: a title band, its buttons in a spaced row', () => {
    const circle = {
      ritualName: 'Cercle <b>', force: 4, leaderName: 'Ana & Bo', sealed: false
    }
    const html = SR5_RitualCircle.circleContent(circle)
    expect(html).toMatch(/^<div class="sr5-ritual-circle"><h3>/)
    expect(html).toMatch(/<div class="sr5-card-buttons"><button[^>]*data-ritual-action="join"[\s\S]*data-ritual-action="seal"[^<]*<\/button><\/div><\/div>$/)
    const sealed = SR5_RitualCircle.circleContent({
      ...circle, sealed: true
    })
    expect(sealed).toMatch(/^<div class="sr5-ritual-circle"><h3>/)
    expect(sealed).not.toContain('<button')
    expect(read('styles/components/chat-cards.less')).toMatch(/\.sr5-card-buttons \{[^}]*display: flex;[^}]*gap: 4px;/)
  })
  it('the comment of the sheet\'s Essence hook ends its sentence', () => {
    expect(read('modules/entities/items/utilityItem.js')).toContain("Without a subscriber, the book's cost\n    // is kept")
  })
})
