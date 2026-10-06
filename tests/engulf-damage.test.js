import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  engulfDamage
} from '../modules/rolls/roll-helpers/toxin-card.js'

// SR5 p. 399: an air engulf deals Magic × 2 Stun, AP −Magic, at each of the spirit's following phases (Ivo)
describe('engulfDamage', () => {
  it('is Magic × 2 Stun with AP −Magic', () => {
    expect(engulfDamage(5)).toEqual({
      value: 10, armorPenetration: -5, type: "stun"
    })
  })

  it('reads nothing but the Magic, and never goes below 0', () => {
    expect(engulfDamage(undefined)).toEqual({
      value: 0, armorPenetration: 0, type: "stun"
    })
    expect(engulfDamage(-3).value).toBe(0)
    expect(engulfDamage("4.7").value).toBe(8)
  })
})

describe('engulf resistance wiring', () => {
  const resistance = readFileSync(new URL('../modules/rolls/roll-prepare-case/rollData-Resistance.js', import.meta.url), 'utf8')
  const message = readFileSync(new URL('../modules/rolls/roll-message.js', import.meta.url), 'utf8')

  it('works the damage out again before reading the card', () => {
    const body = resistance.slice(resistance.indexOf('export default async function resistance'))
    expect(body.indexOf('engulfDamageOf(chatData.damage.engulfSourceId)')).toBeGreaterThan(-1)
    expect(body.indexOf('engulfDamageOf')).toBeLessThan(body.indexOf('rollData.damage.base = chatData.damage.value'))
  })

  // SR5 p. 399: resisted as a toxin by inhalation, armor does not protect; no second "continuous" button
  it('resists a following phase as a toxin, without the first hits nor the continuous damage buttons', () => {
    const block = resistance.slice(resistance.indexOf('if (rollType === "resistanceCard" && chatData.damage?.toxin?.type === "airEngulf")'))
    const body = block.slice(0, block.indexOf('//Transfert necessary info'))
    expect(body).toMatch(/rollType = "resistanceToxin"/)
    expect(body).toMatch(/chatData\.damage\.toxin\.power = engulf\.value/)
    expect(body).toMatch(/chatData\.roll\.netHits = 0/)
    expect(body).toMatch(/chatData\.damage\.isContinuous = false/)
  })

  it('shows on the button the damage worked out on the spirit, not the card', () => {
    const block = message.slice(message.indexOf('if (messageData.damage.toxin.type === "airEngulf"){'))
    expect(block.slice(0, 900)).toMatch(/engulfDamageOf\(messageData\.damage\.engulfSourceId\)/)
    expect(block.slice(0, 900)).not.toMatch(/messageData\.damage\.base/)
  })
})
