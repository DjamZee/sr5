import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  harmoniousDefensePool, isStructuredSpell, pushedHits, STRUCTURED_DRAIN_FLOOR
} from "../modules/rolls/roll-helpers/arcana-metamagics.js"
import {
  drainFloor, maskedDrain
} from "../modules/entities/items/mentor-spirits.js"

describe("Harmonious Defense (Forbidden Arcana p. 45)", () => {
  it("gives Willpower + Magic + initiate grade spell defense dice", () => {
    expect(harmoniousDefensePool(4, 6, 2)).toBe(12)
    expect(harmoniousDefensePool(3, 5, undefined)).toBe(8)
  })

  it("is added to the spell defense pool when the metamagic is active", () => {
    const code = readFileSync("modules/entities/actors/utilityActor.js", "utf8")
    expect(code).toMatch(/metamagics\.harmoniousDefense\) SR5_EntityHelpers\.updateModifier\(magic\.counterSpellPool/)
  })
})

describe("Structured Spellcasting (Forbidden Arcana p. 43)", () => {
  const spell = {
    test: {
      type: "spell"
    }, magic: {
      structured: true
    }
  }

  it("only concerns spells cast with the metamagic", () => {
    expect(isStructuredSpell(spell)).toBe(true)
    expect(isStructuredSpell({
      test: {
        type: "spell"
      }, magic: {
      }
    })).toBe(false)
    expect(isStructuredSpell({
      test: {
        type: "ritual"
      }, magic: {
        structured: true
      }
    })).toBe(false)
  })

  it("brings the Drain floor of the spell down to 1, mask of the mentor included", () => {
    expect(STRUCTURED_DRAIN_FLOOR).toBe(1)
    expect(drainFloor(spell.test, spell.magic)).toBe(1)
    expect(drainFloor(spell.test, {
    })).toBe(2)
    expect(maskedDrain(2, drainFloor(spell.test, spell.magic))).toBe(1)
  })

  it("keeps the limit when Edge is used", () => {
    expect(pushedHits(4, 3, 5, true)).toBe(5)
    expect(pushedHits(4, 3, 5, false)).toBe(7)
    expect(pushedHits(4, 3, 0, true)).toBe(7)
  })

  it("takes reckless casting and the reagents limit out of the dialog", () => {
    expect(readFileSync("templates/rolls/rollDialogPartial/spellOptions.hbs", "utf8"))
      .toMatch(/\{\{#unless magic\.structured\}\}\s*\{\{> systems\/sr5\/templates\/rolls\/rollDialogPartial\/recklessSpellcasting\.hbs\}\}/)
    expect(readFileSync("modules/rolls/roll-prepare-case/rollData-Spell.js", "utf8")).toContain("rollData.dialogSwitch.reagents = false")
  })
})
