import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  masteryFreeSustainedSpells, magicForDrainType, combatSpellMasteryBonus
} from "../modules/entities/items/magic-masteries.js"
import {
  SR5
} from "../modules/config.js"

const read = path => readFileSync(path, "utf8")
const KEYS = ["archivist", "arcaneBodyguard", "conjuringSpecialist", "deathSower", "illusionist", "mageHunter", "masterManipulator"]

describe("Magical masteries: wiring (Forbidden Arcana p. 30-41)", () => {
  it("lists every mastery in SR5.magicMasteries, labelled in French and English", () => {
    const fr = JSON.parse(read("lang/fr.json")), en = JSON.parse(read("lang/en.json"))
    expect(Object.keys(SR5.magicMasteries).sort()).toEqual([...KEYS].sort())
    for (const label of [...Object.values(SR5.magicMasteries), "SR5.MagicMasteries"]) {
      expect(fr[label]).toBeTruthy()
      expect(en[label]).toBeTruthy()
    }
  })

  it("offers the magicMasteries effect category with system.magic.masteries targets", () => {
    const hbs = read("templates/items/_partial/effect/effect.hbs")
    expect(hbs).toContain('<option value="magicMasteries">')
    expect(hbs).toContain("system.magic.masteries.{{@key}}")
    expect(hbs).toMatch(/eq this\.category 'magicMasteries'/)
  })

  it("declares the actor fields and resets them", () => {
    const model = read("modules/datamodels/actors/partial/magic.js")
    for (const key of KEYS) expect(model).toContain(`"${key}"`)
    expect(model).toMatch(/masteries: new fields\.SchemaField/)
    expect(read("modules/entities/actors/utilityActor.js")).toMatch(/Reset magical masteries/)
  })

  it("doubles the spell defense pool for the Arcane Bodyguard", () => {
    expect(read("modules/entities/actors/utilityActor.js")).toMatch(/arcaneBodyguard > 0[\s\S]{0,200}updateModifier\(magic\.counterSpellPool/)
  })
})

describe("Mage Hunter and Death Sower (p. 34, 40)", () => {
  it("raise Drain (and DV for Death Sower) of combat spells by their level", () => {
    expect(combatSpellMasteryBonus("combat", 2, 3)).toEqual({
      drainMageHunter: 2, drainDeathSower: 3, damage: 3
    })
  })
  it("leave other spell categories alone", () => {
    expect(combatSpellMasteryBonus("illusion", 2, 3)).toEqual({
      drainMageHunter: 0, drainDeathSower: 0, damage: 0
    })
  })
  it("are wired in the spell roll and the spell card", () => {
    expect(read("modules/rolls/roll-prepare-case/rollData-Spell.js")).toMatch(/drain\.modifiers\.deathSower/)
    expect(read("modules/rolls/roll-test-case/test-Spell.js")).toMatch(/damageBonus/)
  })
})

describe("Illusionist and Master Manipulator (p. 37, 38)", () => {
  const spells = [
    {
      id: "a", category: "illusion", subCategory: "", force: 3
    },
    {
      id: "b", category: "illusion", subCategory: "", force: 5
    },
    {
      id: "c", category: "manipulation", subCategory: "mental", force: 4
    },
    {
      id: "d", category: "manipulation", subCategory: "physical", force: 2
    },
    {
      id: "e", category: "combat", subCategory: "", force: 1
    },
  ]
  it("frees one spell per level, most powerful eligible first", () => {
    expect([...masteryFreeSustainedSpells(spells, 6, {
      illusionist: 1
    })]).toEqual(["b"])
    expect([...masteryFreeSustainedSpells(spells, 6, {
      illusionist: 3, masterManipulator: 2
    })].sort()).toEqual(["a", "b", "c"])
  })
  it("never frees a spell whose Force exceeds Magic", () => {
    expect([...masteryFreeSustainedSpells(spells, 4, {
      illusionist: 1
    })]).toEqual(["a"])
    expect(masteryFreeSustainedSpells(spells, 2, {
      illusionist: 3, masterManipulator: 3
    }).size).toBe(0)
  })
  it("ignores physical Manipulation and other categories", () => {
    expect(masteryFreeSustainedSpells(spells, 6, {
      masterManipulator: 3
    })).toEqual(new Set(["c"]))
  })
  it("frees nothing without a mastery", () => {
    expect(masteryFreeSustainedSpells(spells, 6, {
    }).size).toBe(0)
  })
  it("is wired in the sustaining penalty", () => {
    expect(read("modules/entities/actors/utilityActor.js")).toMatch(/masteryFreeSustainedSpells\(/)
  })
})

describe("Archivist and Conjuring Specialist (p. 32, 40)", () => {
  it("counts Magic higher by the Archivist level, always", () => {
    expect(magicForDrainType(5, 2, 0, false)).toBe(7)
  })
  it("adds 1 for the Conjuring Specialist on a Conjuring test only", () => {
    expect(magicForDrainType(5, 0, 1, true)).toBe(6)
    expect(magicForDrainType(5, 0, 1, false)).toBe(5)
  })
  it("leaves Magic unchanged without mastery", () => {
    expect(magicForDrainType(5)).toBe(5)
  })
  it("is used for both drain type comparisons", () => {
    const code = read("modules/rolls/roll-prepare-case/rollData-Drain.js")
    expect(code.match(/> drainTypeMagic/g)).toHaveLength(2)
  })
})
