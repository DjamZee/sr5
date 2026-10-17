import {
  describe, it, expect
} from "vitest"
import {
  sizeMismatchModifier, hasDelicateFingers, holderMetatype, DELICATE_FINGERS_EFFECT
} from "../modules/system/size-mismatch.js"

// SR5 p. 423, Utiliser de l'équipement inadapté: -2 dice, the reverse too; The Complete Trog p. 179, Doigts délicats:
// a troll does not suffer it.

const unfitted = {
  notSizeAdapted: true
}
const fingers = (isActive = true) => ({
  type: "itemQuality", system: {
    isActive, systemEffects: [{
      category: "specialCase", value: DELICATE_FINGERS_EFFECT
    }]
  }
})

describe("Gear not made for its holder's size (SR5 p. 423)", () => {
  it("costs nothing when the box is unticked: the lifestyle paid for the fitted gear", () => {
    expect(sizeMismatchModifier({
      notSizeAdapted: false
    }, "troll", [])).toBe(0)
    expect(sizeMismatchModifier({
    }, "dwarf", [])).toBe(0)
  })

  it("costs 2 dice to a dwarf or a troll, and the reverse to an elf", () => {
    expect(sizeMismatchModifier(unfitted, "troll", [])).toBe(-2)
    expect(sizeMismatchModifier(unfitted, "dwarf", [])).toBe(-2)
    expect(sizeMismatchModifier(unfitted, "elf", [])).toBe(-2)
  })

  it("is lifted for a troll with Doigts délicats (The Complete Trog p. 179), not for a dwarf", () => {
    expect(sizeMismatchModifier(unfitted, "troll", [fingers()])).toBe(0)
    expect(sizeMismatchModifier(unfitted, "dwarf", [fingers()])).toBe(-2)
  })

  it("reads an inactive quality as absent", () => {
    expect(hasDelicateFingers([fingers(false)])).toBe(false)
    expect(sizeMismatchModifier(unfitted, "troll", [fingers(false)])).toBe(-2)
  })

  it("reads the legacy metatype key of an actor not migrated yet", () => {
    expect(holderMetatype({
      system: {
        biography: {
          characterMetatype: "troll"
        }
      }
    })).toBe("troll")
  })
})
