import {
  describe, it, expect
} from 'vitest'
import {
  negotiatedValue, equipmentValue, contactValue, serviceValue, informationValue, lineValue, remainder,
  intimidationValue, intimidationFallout
} from '../modules/system/barter-rules.js'

// Advanced Social Skill rules, Cutting Aces p. 160-165 (VF): the book's own examples
describe('the negotiated value, p. 161', () => {
  it('Jimmy No sells for 5,000 with 5 net hits: 7,500', () => {
    expect(negotiatedValue(5000, 5, 'receive')).toBe(7500)
  })

  it('Haze pays a guide 2,000 a day with 1 net hit: 1,800', () => {
    expect(negotiatedValue(2000, 1, 'pay')).toBe(1800)
  })

  it('the NPC who wins moves the offer the other way, never below 0', () => {
    expect(negotiatedValue(1000, -2, 'pay')).toBe(1200)
    expect(negotiatedValue(1000, 12, 'pay')).toBe(0)
  })
})

describe('the Bartering table, p. 161-162', () => {
  it('equipment: the SM-5 at 28,000, Availability 16, is worth 36,400', () => {
    expect(equipmentValue(28000, 16)).toBe(36400)
  })

  it('equipment: deepweed at 400, Availability 4, is worth 280 a dose; a fake SIN 2 at 5,000 is worth 3,000', () => {
    expect(equipmentValue(400, 4, 3)).toBe(840)
    expect(equipmentValue(5000, 2)).toBe(3000)
  })

  it('a contact: Influence 6 is worth 6,000', () => {
    expect(contactValue(6)).toBe(6000)
  })

  it('a service: 12 dice for half an hour is worth 450', () => {
    expect(serviceValue(12, 0.5)).toBe(450)
    expect(serviceValue(8, 3)).toBe(900)
  })

  it('information: dice pool × 100', () => {
    expect(informationValue(9)).toBe(900)
  })

  it('Haze settles 3,600 with a fake SIN and 600 in cash', () => {
    const lines = [{
      kind: 'equipment', cost: 5000, availability: 2
    }, {
      kind: 'cash', amount: 600
    }]
    expect(lines.map(lineValue)).toEqual([3000, 600])
    expect(remainder(3600, lines)).toBe(0)
  })
})

describe('Intimidation, p. 164', () => {
  it('3 net hits against an offer of 2,000 take 600 off', () => {
    expect(intimidationValue(3, 2000)).toBe(600)
  })

  it('without an offer, 250 per net hit', () => {
    expect(intimidationValue(2, 0)).toBe(500)
    expect(intimidationValue(-1, 0)).toBe(0)
  })

  it('a glitch makes a grudge, a critical glitch an enemy', () => {
    expect(intimidationFallout({
      glitchRoll: true
    })).toBe('grudge')
    expect(intimidationFallout({
      criticalGlitchRoll: true
    })).toBe('enemy')
    expect(intimidationFallout({
    })).toBe(null)
  })
})
