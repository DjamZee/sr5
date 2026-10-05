import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  masteryFreeSustainedSpells, illusionistLevelsByType
} from "../modules/entities/items/magic-masteries.js"

// Review M2: Illusionist (Forbidden Arcana p. 37) frees only Illusions of the type chosen with each level
describe("Illusionist spell type", () => {
  const quality = (option, rating = 1) => ({
    type: "itemQuality", system: {
      isActive: true, itemRating: rating, masteryOption: option, customEffects: [{
        target: "system.magic.masteries.illusionist", type: "rating", multiplier: 1
      }]
    }
  })
  const spells = [
    {
      id: "p", category: "illusion", type: "physical", force: 4
    },
    {
      id: "m", category: "illusion", type: "mana", force: 3
    },
  ]

  it("counts the levels by type, untyped ones apart", () => {
    expect(illusionistLevelsByType([quality("mana"), quality("physical", 2), quality("")])).toEqual({
      physical: 2, mana: 1, any: 1
    })
    expect(illusionistLevelsByType([{
      ...quality("mana"), system: {
        ...quality("mana").system, isActive: false
      }
    }])).toEqual({
      physical: 0, mana: 0, any: 0
    })
  })

  it("frees only the Illusions of the chosen type", () => {
    const freed = masteryFreeSustainedSpells(spells, 6, {
      illusionistByType: {
        physical: 0, mana: 1, any: 0
      }
    })
    expect([...freed]).toEqual(["m"])
  })

  it("lets an untyped level free either type", () => {
    expect([...masteryFreeSustainedSpells(spells, 6, {
      illusionistByType: {
        physical: 0, mana: 0, any: 1
      }
    })]).toEqual(["p"])
  })

  it("is chosen on the quality and read by the sustaining code", () => {
    expect(readFileSync("modules/datamodels/items/itemQuality.js", "utf8")).toMatch(/masteryOption: new fields\.StringField/)
    expect(readFileSync("templates/items/blocks/quality/quality-stat.hbs", "utf8")).toContain('name="system.masteryOption"')
    expect(readFileSync("modules/entities/actors/utilityActor.js", "utf8")).toContain("illusionistByType: illusionistLevelsByType(actor.items)")
  })
})
