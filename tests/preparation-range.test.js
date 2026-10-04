import {
  describe, it, expect, beforeAll
} from "vitest"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"

// SR5 p. 309, Using a preparation: its Force stands for the caster's Magic, and an area preparation is the
// center of a radius equal to its Potency in metres. The bearer's Magic plays no part: a mundane holding it
// used to get a detection range of 0.
beforeAll(() => {
  globalThis.game = {
    ...globalThis.game, i18n: {
      localize: k => k
    }
  }
})
const prep = (props) => ({
  force: 4, potency: 3, spellAreaExtended: false, range: "area", category: "combat", spellAreaOfEffect: {
    base: 0, value: 0, modifiers: []
  }, ...props
})
const range = (data) => {
  SR5_UtilityItem._handleSpellRange(data, data.force, data.potency)
  return data.spellAreaOfEffect.value
}

describe("Portée d'une préparation", () => {
  it("préparation de zone : rayon = Potentiel", () => {
    expect(range(prep())).toBe(3)
  })
  it("préparation de détection : Puissance × Puissance, quel que soit le porteur", () => {
    expect(range(prep({
      category: "detection", range: "lineOfSight"
    }))).toBe(16)
  })
  it("détection étendue : × 10", () => {
    expect(range(prep({
      category: "detection", range: "lineOfSight", spellAreaExtended: true
    }))).toBe(160)
  })
  it("préparation sans zone : 0", () => {
    expect(range(prep({
      range: "lineOfSight"
    }))).toBe(0)
  })
  it("un sort garde Puissance × Magie du lanceur", () => {
    const spell = prep({
      category: "detection", range: "lineOfSight"
    })
    SR5_UtilityItem._handleSpellRange(spell, 6)
    expect(spell.spellAreaOfEffect.value).toBe(24)
  })
})
