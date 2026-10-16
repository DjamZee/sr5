import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  getDefaultLayout
} from '../modules/interface/default-layout.js'

// Relecture djamz.13, img 17 and 18: the spirit traits left the header for the Traits block, the bound switch sits
// beside the materialization one, and the vision types block says the spirit perceives astrally.

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const header = read('templates/actors/_partials/header/controls/actorSpirit.hbs')
const qualities = read('templates/actors/_partials/left-tabs/qualities/qualities.hbs')
const visions = read('templates/actors/_partials/left-tabs/qualities/visions.hbs')

describe('spirit traits', () => {
  it('are no longer in the header, which keeps room for the name', () => {
    expect(header).not.toContain('data-trait=')
  })

  it('are in the Traits block, for a spirit and the gamemaster only, through the ledger', () => {
    for (const trait of ['isElemental', 'isWild', 'hasDomain', 'magicPact', 'isFree', 'freeEdge']) {
      expect(qualities).toMatch(new RegExp(`sr5-spirit-ledger" data-trait="${trait}"`))
    }
    const block = qualities.slice(qualities.indexOf("{{#ife actor.type 'actorSpirit'}}"))
    expect(block).toContain('{{#if system.isGM}}')
  })

  it('the bound switch comes right before the materialization one', () => {
    const bound = header.indexOf('id="boundedIcon"')
    const materialize = header.indexOf('id="materializeIcon"')
    expect(bound).toBeGreaterThan(-1)
    expect(materialize).toBeGreaterThan(bound)
    expect(header.slice(bound, materialize)).not.toContain('SR-EspritType')
  })

  it('the default spirit layout shows the Traits and vision types blocks', () => {
    const blocks = JSON.stringify(getDefaultLayout('SR5SpiritSheet'))
    expect(blocks).toContain('"qualities"')
    expect(blocks).toContain('"visions"')
  })
})

describe('astral perception in the vision types block', () => {
  it('is always on for a spirit, with no switch', () => {
    const spirit = visions.slice(visions.indexOf("{{#ife actor.type 'actorSpirit'}}"), visions.indexOf('{{else}}'))
    expect(spirit).toContain("localize 'SR5.AstralPerception'")
    expect(spirit).not.toContain('vision-switch')
  })

  it('is a switch for whoever can perceive astrally', () => {
    expect(visions).toContain('{{#if canPerceiveAstral}}')
    expect(visions).toContain('class= "vision-switch" data-binding="astral"')
  })
})
