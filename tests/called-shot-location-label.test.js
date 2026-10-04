import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

// N96: an untargeted called shot carries location = null, which "isdefined" accepted, so the card showed "()"
describe('Attack card: called shot location', () => {
  const template = readFileSync(new URL('../templates/rolls/rollCardPartial/attackRoll.hbs', import.meta.url), 'utf8')

  it('shows the location only when it has a value', () => {
    expect(template).not.toMatch(/isdefined combat\.calledShot\.location/)
    expect(template).toMatch(/{{#if combat\.calledShot\.location}}/)
  })
})
