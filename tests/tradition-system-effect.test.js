import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// updateTradition looked the tradition up with `i.category = "tradition"`: an assignment, so the
// first system effect won whatever it was, and its category was overwritten in passing.
describe("SR5_CharacterUtility.updateTradition", () => {
  const makeActor = () => ({
    system: {
      magic: {
        magicType: "magician", elements: {
        }, drainResistance: {
        },
      },
    },
  })
  const tradition = (systemEffects) => ({
    drainAttribute: "logic", systemEffects
  })

  it("reads the effect whose category is tradition, not the first one", () => {
    const actor = makeActor()
    const effects = [{
      category: "other", value: "wrong"
    }, {
      category: "tradition", value: "hermetic"
    }]
    SR5_CharacterUtility.updateTradition(actor, tradition(effects))
    expect(actor.system.magic.tradition).toBe("hermetic")
    expect(effects[0].category).toBe("other")
  })

  it("leaves the tradition alone when no effect carries one", () => {
    const actor = makeActor()
    expect(() => SR5_CharacterUtility.updateTradition(actor, tradition([{
      category: "other", value: "x"
    }]))).not.toThrow()
    expect(actor.system.magic.tradition).toBeUndefined()
  })
})
