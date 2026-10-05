import {
  describe, it, expect, beforeEach
} from 'vitest'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  thresholdModifierOf, applyThresholdModifier
} from '../modules/rolls/roll-helpers/threshold.js'
import {
  isReplaceEffectType, replacedValue, replaceModifierValue
} from '../modules/entities/actors/effect-replace.js'
import {
  SR5
} from '../modules/config.js'

beforeEach(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = k => k
})

//Bliss (SR5 p. 412) and Purple Orchid (Chrome Flesh p. 190): "+1 to all thresholds"
describe("threshold modifier", () => {
  const actorData = mods => ({
    specialProperties: {
      thresholdModifier: {
        base: 0, value: 0, modifiers: mods
      }
    }
  })
  it("adds to a test that has a threshold", () => {
    const mod = thresholdModifierOf(actorData([{
      source: "Bliss", value: 1
    }]))
    const t = applyThresholdModifier({
      value: 2, type: null
    }, mod)
    expect([t.value, t.base, t.modifier]).toEqual([3, 2, 1])
    expect(t.modifierSources).toEqual([{
      source: "Bliss", value: 1
    }])
  })
  it("leaves a test without threshold alone", () => {
    const mod = thresholdModifierOf(actorData([{
      source: "Bliss", value: 1
    }]))
    expect(applyThresholdModifier({
      value: 0, type: null
    }, mod)).toEqual({
      value: 0, type: null
    })
  })
  it("adds up two sources", () => {
    const mod = thresholdModifierOf(actorData([{
      source: "Bliss", value: 1
    }, {
      source: "Orchidée pourpre", value: 1
    }]))
    expect(applyThresholdModifier({
      value: 4
    }, mod).value).toBe(6)
  })
  it("does nothing without modifier", () => {
    const threshold = {
      value: 3
    }
    expect(applyThresholdModifier(threshold, thresholdModifierOf(actorData([])))).toBe(threshold)
    expect(thresholdModifierOf({
    }).value).toBe(0)
  })
  it("is a property an effect can target", () => {
    expect(SR5.specialPropertiesList.thresholdModifier).toBe("SR5.ThresholdModifier")
    expect(SR5.specialProperties.thresholdModifier).toBe("SR5.ThresholdModifier")
  })
})

//Animal Sense, Eyes of the Pack (Street Grimoire p. 106), No Future instruments (No Future p. 152)
describe("replacing effects", () => {
  it("knows the replacing types", () => {
    expect(["valueReplace", "ratingReplace", "hitsReplace", "netHitsReplace"].every(isReplaceEffectType)).toBe(true)
    expect(["value", "hits", "netHits", "rating"].some(isReplaceEffectType)).toBe(false)
    expect(SR5.customEffectsTypes.netHitsReplace).toBe("SR5.NetHitsReplace")
  })
  it("reads back the replacing modifier", () => {
    expect(replacedValue([{
      value: 2
    }, {
      value: 4, replace: true
    }])).toBe(4)
    expect(replacedValue([{
      value: 2
    }])).toBeUndefined()
  })
  it("keeps − base + value on a numeric target, the value on a text one", () => {
    expect(replaceModifierValue(3, 5)).toBe(2)
    expect(replaceModifierValue("socialLimit", 5)).toBe(5)
  })

  const applyOn = (target, effect, itemSystem = {
  }) => {
    SR5_CharacterUtility.applyCustomEffects({
      name: "Instruments Big time", type: "itemGear", system: {
        isActive: true, ...itemSystem, customEffects: [{
          category: "skills", wifi: false, multiplier: 1, ...effect
        }]
      }
    }, {
      system: {
        skills: {
          performance: {
            limit: target
          }
        }
      }
    })
    return target
  }

  it("gives a skill Limit its value, though its base is the key of the linked Limit", () => {
    const limit = applyOn({
      base: "socialLimit", value: 0, modifiers: [{
        value: 1, source: "other"
      }]
    }, {
      target: "system.skills.performance.limit", type: "valueReplace", value: 8
    })
    //The other effect stays: a Synthlink still adds to the instrument (No Future p. 152)
    expect(limit.modifiers.map(m => [m.value, !!m.replace])).toEqual([[1, false], [8, true]])
    expect(replacedValue(limit.modifiers)).toBe(8)
    expect(limit.base).toBe("socialLimit")
  })
  it("keeps the highest of two replacing values", () => {
    expect(replacedValue([{
      value: 8, replace: true
    }, {
      value: 4, replace: true
    }])).toBe(8)
  })
  it("still replaces a numeric target as before", () => {
    const limit = applyOn({
      base: 3, value: 3, modifiers: []
    }, {
      target: "system.skills.performance.limit", type: "valueReplace", value: 5
    })
    expect(limit.base + limit.modifiers[0].value).toBe(5)
  })
  it("takes the hits of a sustained item for hitsReplace", () => {
    const limit = applyOn({
      base: "mentalLimit", value: 0, modifiers: []
    }, {
      target: "system.skills.performance.limit", type: "hitsReplace"
    }, {
      hits: 3
    })
    expect(replacedValue(limit.modifiers)).toBe(3)
  })
  it("leaves an additive effect additive (counter-proof)", () => {
    const limit = applyOn({
      base: "socialLimit", value: 0, modifiers: []
    }, {
      target: "system.skills.performance.limit", type: "value", value: 2
    })
    expect(replacedValue(limit.modifiers)).toBeUndefined()
    expect(limit.modifiers[0].value).toBe(2)
  })
})

//Trauma damper (Chrome Flesh p. 123): reduces the wound modifier by its rating, never into a bonus
describe("wound modifier never turns into a bonus", () => {
  const pc = (physical, stun, damper) => {
    const pen = () => ({
      step: {
        base: 3, value: 3, modifiers: []
      }, boxReduction: {
        base: 0, value: 0, modifiers: []
      }, actual: {
        base: 0, value: 0, modifiers: []
      }
    })
    const penalties = {
      physical: pen(), stun: pen(), condition: pen(), matrix: pen(), magic: pen(), special: pen()
    }
    if (damper) penalties.condition.actual.modifiers.push({
      source: "Réducteur de trauma", value: damper
    })
    return {
      type: "actorPc", items: [], name: "pc", system: {
        penalties, specialProperties: {
        },
        conditionMonitors: {
          physical: {
            actual: {
              value: physical
            }
          }, stun: {
            actual: {
              value: stun
            }
          }
        }
      }
    }
  }
  const modifier = (physical, stun, damper) => {
    const actor = pc(physical, stun, damper)
    SR5_CharacterUtility.updatePenalties(actor)
    return actor.system.penalties.condition.actual.value
  }
  it("is 0 when unharmed, with a rating 3 damper", () => {
    expect(modifier(0, 0, 3)).toBe(0)
  })
  it("reduces the modifier by the rating", () => {
    //3 boxes: −1, 6 boxes: −2, 9 boxes: −3
    expect(modifier(3, 0, 1)).toBe(0)
    expect(modifier(6, 0, 1)).toBe(-1)
    expect(modifier(9, 0, 1)).toBe(-2)
    expect(modifier(6, 3, 2)).toBe(-1)
  })
  it("is unchanged without a damper (counter-proof)", () => {
    expect(modifier(9, 0, 0)).toBe(-3)
    expect(modifier(0, 0, 0)).toBe(0)
  })
})
