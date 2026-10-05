import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'

//Street Cred = Karma gained / 10 (SR5 p. 372); Consummate Professional divides by 20 (Assassin's Primer p. 15)
beforeAll(() => {
  globalThis.game = globalThis.game || {
  }
  globalThis.game.i18n = globalThis.game.i18n || {
    localize: k => k 
  }
})

const pc = (karmaGained, divisorModifiers = []) => ({
  system: {
    karma: {
      base: 0, value: 0, modifiers: [{
        source: "run", type: "karma_gain", value: karmaGained 
      }] 
    },
    streetCred: {
      base: 0, value: 0, modifiers: [] 
    },
    specialProperties: {
      streetCredDivisor: {
        value: 0, modifiers: divisorModifiers 
      } 
    },
  }
})
const credOf = actor => actor.system.streetCred.modifiers.reduce((s, m) => s + m.value, 0)

describe("Street Cred from Karma", () => {
  it("divides by 10 by default", () => {
    const actor = pc(45)
    SR5_CharacterUtility.updateKarmas(actor)
    expect(credOf(actor)).toBe(4)
  })
  it("divides by 20 with Consummate Professional", () => {
    const actor = pc(45, [{
      source: "Professionnel accompli", type: "itemQuality", value: 10 
    }])
    SR5_CharacterUtility.updateKarmas(actor)
    expect(credOf(actor)).toBe(2)
  })
  it("gives nothing below the divisor", () => {
    const actor = pc(15, [{
      source: "Professionnel accompli", type: "itemQuality", value: 10 
    }])
    SR5_CharacterUtility.updateKarmas(actor)
    expect(credOf(actor)).toBe(0)
  })
})
