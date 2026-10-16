import {
  describe, it, expect, beforeAll
} from "vitest"
import complexForm from "../modules/rolls/roll-prepare-case/rollData-ComplexForm.js"

// SR5 p. 252: Thread Complex Form, Software + Resonance [Level]. The level stays the base of the limit (roll-test.js);
// an effect on the threading limit (Delphi, Kill Code p. 114: +1) reaches the roll as a limit modifier.

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
})

const technomancer = (limitModifiers) => ({
  items: [],
  system: {
    specialAttributes: {
      resonance: {
        augmented: {
          value: 5
        }
      }
    },
    matrix: {
      userGrid: "local",
      resonanceActions: {
        threadComplexForm: {
          test: {
            modifiers: [{
              source: "Résonance", type: "linkedAttribute", value: 5
            }]
          },
          ...(limitModifiers ? {
            limit: {
              base: "", value: 0, modifiers: limitModifiers
            }
          } : {
          }),
        }
      }
    }
  }
})

const form = {
  name: "Pic de résonance", uuid: "Item.f",
  system: {
    systemEffects: [], customEffects: {
    }, itemEffects: {
    }, defenseAttribute: "", defenseMatrixAttribute: "", fadingModifier: 0, target: "device"
  }
}

const rollData = () => ({
  test: {
  }, dicePool: {
    modifiers: {
    }
  }, limit: {
    modifiers: {
    }
  }, matrix: {
    fading: {
      modifiers: {
      }
    }
  }, various: {
  }, owner: {
  }, combat: {
    actions: []
  }, dialogSwitch: {
  }, effects: {
  },
})

describe("Threading limit (SR5 p. 252, Kill Code p. 114)", () => {
  it("adds the effects on the threading limit, the level staying the base", () => {
    const data = complexForm(rollData(), technomancer([{
      source: "Parangon (Delphe, l’Oracle)", type: "itemQuality", value: 1
    }]), form)
    expect(data.limit.modifiers.itemQuality).toEqual({
      label: "Parangon (Delphe, l’Oracle)", value: 1
    })
    expect(data.matrix.level).toBe(5)
  })

  it("adds nothing for an actor prepared before the field existed", () => {
    const data = complexForm(rollData(), technomancer(), form)
    expect(data.limit.modifiers).toEqual({
    })
  })
})
