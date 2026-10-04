import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

// roll-dialog.hbs renders the limit block only when the base limit is above 0:
// for an actor whose limit is 0, the limit fields are not in the dialog.
const limitFields = ['[name="limitModPerception"]', '[name="limitModHealingSupplies"]', '[name="baseLimit"]', '[name="modifiedLimit"]']

let avant
beforeEach(() => {
  avant = {
    game: globalThis.game, ui: globalThis.ui
  }
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: () => {}
    }
  }
  globalThis.game = {
    i18n: {
      localize: k => k, format: k => k
    },
    actors: {
      get: () => actor
    },
  }
})
afterEach(() => {
  globalThis.game = avant.game
  globalThis.ui = avant.ui
})

const actor = {
  system: {
    skills: {
      perception: {
        perceptionType: {
          hearing: {
            test: {
              value: 2
            }, limit: {
              value: 1
            }
          }
        }
      }
    }
  }
}

function dialog() {
  const fields = {
  }
  const html = {
    querySelector: sel => limitFields.includes(sel) ? null : (fields[sel] ??= {
      value: 0, style: {
      }
    }),
    querySelectorAll: () => [],
  }
  const dialogData = {
    owner: {
      actorId: "a"
    },
    dicePool: {
      base: 0, modifiers: []
    },
    limit: {
      base: 0, modifiers: {
      }
    },
    various: {
    },
  }
  const roll = new SR5_RollDialog({
    position: {
    }, setPosition: () => {}
  }, null, dialogData)
  return {
    roll, html, dialogData
  }
}

describe("roll dialog of an actor whose limit is 0", () => {
  it("sets the perception type without throwing on the missing limit field", async () => {
    const d = dialog()
    await expect(d.roll._selectModifiers({
      currentTarget: {
        dataset: {
          target: "dicePoolModPerceptionType", modifier: "perceptionType"
        }
      },
      target: {
        value: "hearing"
      },
    }, d.html, d.dialogData)).resolves.not.toThrow()
    expect(d.dialogData.various.perceptionType).toBe("hearing")
    expect(d.dialogData.limit.modifiers.perception.value).toBe(1)
  })

  it("sets the healing supplies without throwing on the missing limit field", async () => {
    const d = dialog()
    await expect(d.roll._selectModifiers({
      currentTarget: {
        dataset: {
          target: "dicePoolModHealingSupplies", modifier: "healingSupplies"
        }
      },
      target: {
        value: "improvised"
      },
    }, d.html, d.dialogData)).resolves.not.toThrow()
    expect(d.dialogData.limit.modifiers.healingSupplies.value).toBe(0)
  })
})
