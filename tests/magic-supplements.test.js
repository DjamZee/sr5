import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  isElementalBody, elementalAttunementDue, isTransmutation, transmutationImplants, transmutationDamage,
  isPetrification, petrifies, petrificationArmor, PETRIFICATION_ARMOR_TARGET
} from "../modules/system/magic-supplements-rules.js"
import {
  SR5
} from "../modules/config.js"

const read = path => readFileSync(path, "utf8")
const fr = JSON.parse(read("lang/fr.json"))
const en = JSON.parse(read("lang/en.json"))
const special = value => [{
  category: "specialCase", value
}]

describe("Harmonie élémentaire (Better Than Bad p. 145)", () => {
  const body = (isActive) => ({
    type: "itemAdeptPower", system: {
      isActive, systemEffects: special("elementalBody")
    }
  })
  const adept = (level, items) => ({
    system: {
      magic: {
        masteries: {
          elementalAttunement: {
            value: level
          }
        }
      }
    }, items
  })

  it("knows Corps élémentaire by its systemEffect, never by its name", () => {
    expect(isElementalBody(body(true))).toBe(true)
    expect(isElementalBody({
      type: "itemAdeptPower", name: "Corps élémentaire", system: {
        systemEffects: []
      }
    })).toBe(false)
  })

  it("deals the box only with the mastery and Corps élémentaire active", () => {
    expect(elementalAttunementDue(adept(1, [body(true)]))).toBe(true)
    expect(elementalAttunementDue(adept(0, [body(true)]))).toBe(false)
    expect(elementalAttunementDue(adept(1, [body(false)]))).toBe(false)
    expect(elementalAttunementDue(adept(1, []))).toBe(false)
  })

  it("is a mastery of the system, labelled", () => {
    expect(SR5.magicMasteries.elementalAttunement).toBe("SR5.MagicMasteryElementalAttunement")
    expect(read("modules/datamodels/actors/partial/magic.js")).toContain('"elementalAttunement"')
    expect(read("templates/items/_partial/effect/systemEffect.hbs")).toContain('<option value="elementalBody">')
  })
})

describe("Transmutation (Aetherologie p. 39)", () => {
  const implant = (id, essence, grade, more = {
  }) => ({
    id, name: id, type: "itemAugmentation", system: {
      grade, essenceCost: {
        value: essence
      }, ...more
    }
  })

  it("rejects every installed implant but deltaware, accessories and stored ones aside", () => {
    const list = transmutationImplants([
      implant("a", 0.2, "standard"), implant("b", 1, "alphaware"), implant("c", 0.5, "deltaware"),
      implant("d", 0.1, "standard", {
        isAccessory: true
      }), implant("e", 0.3, "used", {
        storedIn: "x"
      }), {
        id: "w", type: "itemWeapon", system: {
        }
      },
    ])
    expect(list.map(i => [i.id, i.rejected])).toEqual([["a", true], ["b", true], ["c", false]])
  })

  it("deals Essence × 10 rounded down, the kept deltaware not counted", () => {
    expect(transmutationDamage([{
      essence: 0.2, rejected: true
    }, {
      essence: 1.05, rejected: true
    }, {
      essence: 0.5, rejected: false
    }])).toBe(12)
    expect(transmutationDamage([{
      essence: 0.1, rejected: true
    }, {
      essence: 0.2, rejected: true
    }])).toBe(3)
  })

  it("is a spirit power of the system", () => {
    expect(SR5.AllSpiritPowers.transmutation).toBe("SR5.SpiritPowerTransmutation")
    expect(isTransmutation({
      type: "itemPower", system: {
        systemEffects: [{
          category: "spiritPower", value: "transmutation"
        }]
      }
    })).toBe(true)
  })
})

describe("Pétrification (Street Grimoire p. 117)", () => {
  it("needs a Force at least equal to the Body", () => {
    expect(petrifies(4, 4)).toBe(true)
    expect(petrifies(3, 4)).toBe(false)
  })

  it("gives a barrier armor of Body + net hits", () => {
    expect(petrificationArmor(4, 3)).toBe(7)
    expect(petrificationArmor(4, -1)).toBe(4)
  })

  it("is known by the spell's systemEffect and wired in the effect application", () => {
    expect(isPetrification({
      type: "itemSpell", system: {
        systemEffects: special("petrification")
      }
    })).toBe(true)
    const helpers = read("modules/entities/actors/entityActor-helpers.js")
    expect(helpers).toContain("petrificationArmor(subjectBody, data.roll.netHits)")
    expect(helpers).toContain('origin: "petrification"')
    expect(PETRIFICATION_ARMOR_TARGET).toBe("system.specialProperties.hardenedArmors.normalWeapon")
    //A transferred hardened armor keeps its value (it read 0 before)
    expect(read("modules/entities/actors/utilityActor.js")).toMatch(/case "value":\s*\n\s*m\.value = Number\(m\.details\.value\) \|\| 0/)
  })
})

describe("Labels", () => {
  it("are in French and English", () => {
    for (const key of ["SR5.MagicMasteryElementalAttunement", "SR5.ElementalAttunementTitle", "SR5.ElementalAttunementRow",
      "SR5.ElementalAttunementPhysical", "SR5.ElementalAttunementStun", "SR5.Petrified", "SR5.TransmutationTitle",
      "SR5.TransmutationDamage", "SR5.TransmutationRejected", "SR5.TransmutationKept", "SR5.TransmutationDeltaNote",
      "SR5.TransmutationApply", "SR5.TransmutationConfirm", "SR5.SpiritPowerTransmutation", "SR5.WARN_PetrificationForce",
      "SR5.SpecialCaseElementalBody", "SR5.SpecialCasePetrification"]) {
      expect(fr[key], key).toBeTruthy()
      expect(en[key], key).toBeTruthy()
    }
  })
})
