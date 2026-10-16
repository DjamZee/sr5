import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  rapidFireRemaining, rapidFireAfterUse, RAPID_FIRE_DAY, electromancerInitiative, guruBonus
} from "../modules/entities/items/magic-masteries.js"
import {
  astralProjectionLimit, isRapidNecroSummoning, RAPID_NECRO_DRAIN_FLOOR
} from "../modules/rolls/roll-helpers/arcana-metamagics.js"
import {
  SR5
} from "../modules/config.js"

const read = path => readFileSync(path, "utf8")

describe("Rapid-Fire Caster (Forbidden Arcana p. 38)", () => {
  it("gives one use per level and per day", () => {
    expect(rapidFireRemaining(3, null, 0)).toBe(3)
    const once = rapidFireAfterUse(null, 1000)
    expect(once).toEqual({
      used: 1, since: 1000
    })
    expect(rapidFireRemaining(3, once, 2000)).toBe(2)
    const thrice = rapidFireAfterUse(rapidFireAfterUse(once, 1500), 1600)
    expect(rapidFireRemaining(3, thrice, 2000)).toBe(0)
  })

  it("gives the uses back a day of world time after the first one", () => {
    const record = {
      used: 2, since: 100
    }
    expect(rapidFireRemaining(2, record, 100 + RAPID_FIRE_DAY - 1)).toBe(0)
    expect(rapidFireRemaining(2, record, 100 + RAPID_FIRE_DAY)).toBe(2)
    expect(rapidFireAfterUse(record, 100 + RAPID_FIRE_DAY)).toEqual({
      used: 1, since: 100 + RAPID_FIRE_DAY
    })
  })

  it("is offered beside reckless casting and counted when the spell is cast", () => {
    expect(read("templates/rolls/rollDialogPartial/spellOptions.hbs")).toContain('data-modifier="rapidFireCaster"')
    expect(read("modules/rolls/roll-test.js")).toContain('setFlag("sr5", "rapidFireCaster"')
  })
})

describe("Electromancer (Forbidden Arcana p. 35)", () => {
  it("takes half the excess hits, rounded up, off the Initiative", () => {
    expect(electromancerInitiative(0)).toBe(0)
    expect(electromancerInitiative(1)).toBe(1)
    expect(electromancerInitiative(4)).toBe(2)
    expect(electromancerInitiative(5)).toBe(3)
    expect(electromancerInitiative(-2)).toBe(0)
  })
})

describe("Guru (Forbidden Arcana p. 37)", () => {
  it("gives +1 per (60 / Charisma) ordinary participants, at most the Ritual Spellcasting rank", () => {
    // Charisma 6: one bonus per 10 participants
    expect(guruBonus(9, 6, 5)).toBe(0)
    expect(guruBonus(10, 6, 5)).toBe(1)
    expect(guruBonus(35, 6, 5)).toBe(3)
    expect(guruBonus(200, 6, 5)).toBe(5)
    expect(guruBonus(50, 0, 5)).toBe(0)
  })
})

describe("Projection metamagics (Forbidden Arcana p. 43, SR5 p. 317)", () => {
  it("lasts Magic x 2 hours, + grade with Improved Astral Form, in days for an Astralnaut", () => {
    expect(astralProjectionLimit(5, 2, false, false)).toEqual({
      value: 10, unit: "hours", wake: ""
    })
    expect(astralProjectionLimit(5, 2, true, false)).toEqual({
      value: 12, unit: "hours", wake: "minute"
    })
    expect(astralProjectionLimit(5, 2, true, true)).toEqual({
      value: 12, unit: "days", wake: "day"
    })
  })
})

describe("Rapid Necro-Summoning (Forbidden Arcana p. 44)", () => {
  it("raises the Drain floor to 4 for a necromantic magician who knows it", () => {
    expect(RAPID_NECRO_DRAIN_FLOOR).toBe(4)
    expect(isRapidNecroSummoning({
      tradition: "necroMagic", metamagics: {
        rapidNecroInvocation: true
      }
    })).toBe(true)
    expect(isRapidNecroSummoning({
      tradition: "hermeticism", metamagics: {
        rapidNecroInvocation: true
      }
    })).toBe(false)
    expect(isRapidNecroSummoning({
      tradition: "necroMagic", metamagics: {
      }
    })).toBe(false)
  })
})

describe("Wiring", () => {
  it("lists the new metamagics, labelled in French and English", () => {
    const fr = JSON.parse(read("lang/fr.json")), en = JSON.parse(read("lang/en.json"))
    for (const key of ["improvedAstralForm", "astralnaut", "rapidNecroInvocation", "essenceExpansion", "improvedMistForm"]) {
      expect(SR5.metamagics[key]).toBeTruthy()
      expect(fr[SR5.metamagics[key]]).toBeTruthy()
      expect(en[SR5.metamagics[key]]).toBeTruthy()
    }
  })
})
