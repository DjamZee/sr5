import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

// N75: choosing the spell to counter in the roll dialog must read the category of that spell
// (the selected uuid), and add the counterspelling pool of that category to the dice pool.

let avant
const actor = {
  system: {
    skills: {
      counterspelling: {
        test: {
          dicePool: 4
        },
        spellCategory: {
          combat: {
            dicePool: 10
          }
        }
      }
    }
  }
}

beforeEach(() => {
  avant = {
    game: globalThis.game, ui: globalThis.ui, fromUuid: globalThis.fromUuid
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
  globalThis.fromUuid = async uuid => uuid === "Actor.b.Item.spell" ? {
    type: "itemSpell", system: {
      category: "combat"
    }
  } : null
})
afterEach(() => {
  globalThis.game = avant.game
  globalThis.ui = avant.ui
  globalThis.fromUuid = avant.fromUuid
})

function dialog() {
  const fields = {
  }
  const html = {
    querySelector: sel => fields[sel] ??= {
      value: 0, style: {
      }
    },
    querySelectorAll: () => [],
  }
  const dialogData = {
    owner: {
      actorId: "a"
    },
    test: {
      typeSub: "counterspelling"
    },
    target: {
    },
    dicePool: {
      base: 4, modifiers: []
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
    roll, html, dialogData, fields
  }
}

const choose = (d, value) => d.roll._selectModifiers({
  currentTarget: {
    dataset: {
      target: "dicePoolModTargetType", modifier: "targetEffect"
    }
  },
  target: {
    value
  },
}, d.html, d.dialogData)

describe("counterspelling: choosing the spell to counter", () => {
  it("adds the pool of the spell category (10 dice, not 4)", async () => {
    const d = dialog()
    await choose(d, "Actor.b.Item.spell")
    expect(d.dialogData.target.itemUuid).toBe("Actor.b.Item.spell")
    const mod = d.dialogData.dicePool.modifiers.find(m => m.type === "targetEffect")
    expect(mod.value).toBe(6)
  })

  it("going back to no spell does not throw", async () => {
    const d = dialog()
    await expect(choose(d, "")).resolves.not.toThrow()
    expect(d.dialogData.dicePool.modifiers.find(m => m.type === "targetEffect").value).toBe(0)
  })
})
