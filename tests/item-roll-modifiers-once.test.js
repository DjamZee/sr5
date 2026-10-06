import {
  describe, it, expect, beforeAll
} from "vitest"
import itemRoll from "../modules/rolls/roll-prepare-case/rollData-ItemRoll.js"

// An item test (adept power, martial art, item with a roll) sums its attributes in the base pool;
// its other modifiers (background count, effects) are listed once, as modifiers, not also in the base.
beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
})

describe("item roll dice pool", () => {
  it("counts a background count modifier once", () => {
    const item = {
      name: "Pouvoir", system: {
        test: {
          modifiers: [
            {
              source: "Agilité", type: "linkedAttribute", value: 4
            },
            {
              source: "Volonté", type: "linkedAttribute", value: 3
            },
            {
              source: "Bruit de fond", type: "backgroundCount", value: -2
            },
          ]
        }
      }
    }
    const rollData = {
      test: {
      }, dicePool: {
      }
    }
    const data = itemRoll(rollData, item)
    expect(data.dicePool.base).toBe(7)
    expect(data.dicePool.modifiers).toEqual([{
      type: "backgroundCount", label: "Bruit de fond", value: -2
    }])
  })
})
