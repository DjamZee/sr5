import {
  describe, it, expect, beforeAll, vi
} from "vitest"
import resonanceAction from "../modules/rolls/roll-prepare-case/rollData-ResonanceAction.js"
import {
  SR5_PrepareRollHelper
} from "../modules/rolls/roll-prepare-helpers.js"

// SR5 p. 252: Compile [Sprite level], Register [Sprite level], Decompile [Social], Kill Complex Form [Mental].
// Only compiling asks the level in the dialog: the other actions must keep their own limit.

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
  globalThis.ui ??= {
  }
  globalThis.ui.notifications = {
    warn: vi.fn()
  }
})

const action = (limit) => ({
  actionType: "complex", increaseOverwatchScore: false,
  test: {
    modifiers: [{
      source: "Résonance", type: "linkedAttribute", value: 6
    }]
  },
  ...(limit ? {
    limit: {
      value: limit.value, modifiers: [], linkedAttribute: limit.type
    }
  } : {
  })
})

const technomancer = () => ({
  system: {
    specialAttributes: {
      resonance: {
        augmented: {
          value: 6
        }
      }
    },
    matrix: {
      resonanceActions: {
        compileSprite: action(),
        registerSprite: action(),
        decompileSprite: action({
          value: 7, type: "socialLimit"
        }),
        killComplexForm: action({
          value: 5, type: "mentalLimit"
        }),
      }
    }
  }
})

const rollData = (hasTarget = false) => ({
  test: {
  }, dicePool: {
    modifiers: {
    }
  }, limit: {
    modifiers: {
    }
  }, matrix: {
  }, dialogSwitch: {
  }, combat: {
    actions: []
  }, target: {
    hasTarget, itemList: {
    }
  },
})

describe("Resonance action limits (SR5 p. 252)", () => {
  it("keeps the Social limit for decompiling, not the Resonance", async () => {
    const data = await resonanceAction(rollData(), "decompileSprite", technomancer())
    expect(data.matrix.level).toBeUndefined()
    expect(data.limit.type).toBe("socialLimit")
    expect(data.limit.base).toBe(7)
  })

  it("keeps the Mental limit for killing a complex form", async () => {
    const data = await resonanceAction(rollData(), "killComplexForm", technomancer())
    expect(data.matrix.level).toBeUndefined()
    expect(data.limit.type).toBe("mentalLimit")
  })

  it("takes the targeted sprite's level as the registering limit", async () => {
    vi.spyOn(SR5_PrepareRollHelper, "getTargetedActor").mockResolvedValue({
      type: "actorSprite", system: {
        level: 4
      }
    })
    const data = await resonanceAction(rollData(true), "registerSprite", technomancer())
    expect(data.matrix.level).toBe(4)
  })

  it("still offers the Resonance as the default level when compiling", async () => {
    const data = await resonanceAction(rollData(), "compileSprite", technomancer())
    expect(data.matrix.level).toBe(6)
  })
})
