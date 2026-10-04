import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

// N79: the limit of a spell or ritual is its Force (SR5 p. 285, ritual sealing p. 299).
// Raising the Force in the roll dialog must raise the limit shown, with its modifiers.

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
      get: () => ({
        system: {
          magic: {
            reagents: 0
          }
        }
      })
    },
  }
})
afterEach(() => {
  globalThis.game = avant.game
  globalThis.ui = avant.ui
})

function dialog(type) {
  const fields = {
    '[name="force"]': {
      value: 5
    },
    '#force': {
      value: 4
    },
    '[name="baseLimit"]': {
      value: 4
    },
    '[name="modifiedLimit"]': {
      value: 5
    },
  }
  // The ritual's Force field (ritual roll dialog) has no #force id, unlike drain.hbs
  if (type === "ritual") delete fields['#force']
  const html = {
    querySelector: sel => (type === "ritual" && sel === '#force') ? null : fields[sel] ??= {
      value: 0, checked: false, style: {
      }
    },
    querySelectorAll: () => [],
  }
  const dialogData = {
    owner: {
      actorId: "a"
    },
    test: {
      type
    },
    dicePool: {
      base: 10, modifiers: []
    },
    limit: {
      base: 4, modifiers: {
        lodge: {
          value: 1
        }
      }
    },
    magic: {
      force: 4, drain: {
        modifiers: {
        }
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

const setForce = d => d.roll._manualInputModifier({
  currentTarget: {
    getAttribute: () => "force", dataset: {
      modifier: "force"
    }
  },
  target: {
    value: "5"
  },
}, d.html, d.dialogData)

describe("Force changed in the roll dialog", () => {
  for (const type of ["spell", "ritual"]) {
    it(`raises the limit of a ${type} to the new Force, modifiers kept`, async () => {
      const d = dialog(type)
      await setForce(d)
      expect(Number(d.fields['[name="baseLimit"]'].value)).toBe(5)
      expect(d.fields['[name="modifiedLimit"]'].value).toBe(6)
    })
  }
})
