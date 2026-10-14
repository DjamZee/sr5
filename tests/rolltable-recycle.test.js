import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"

import {
  SR5RollTable
} from "../modules/entities/rollTables/entityRollTable.js"

// Core's RollTable, reduced to what a batch of draws does with it (Foundry 13.351, roll-table.mjs):
// roll() draws among the lines not drawn, drawMany() marks every line it drew at the end and builds
// the card's roll from the draws it made, which throws when it made none
const core = Object.getPrototypeOf(SR5RollTable.prototype)

/**
 * A table of lines "a", "b", "c" whose dice come up in the order given.
 * @param {string[]} order   the line each draw lands on, among those still available
 */
function tableOf(order, {
  replacement = false, drawn = []
} = {
}) {
  const table = new SR5RollTable()
  table.name = "Butin"
  table.replacement = replacement
  table.pack = null
  table.getFlag = () => undefined
  const lines = ["a", "b", "c"].map(id => ({
    id, type: "text", drawn: drawn.includes(id),
    getFlag: () => undefined,
    clone() {
      return {
        id: this.id
      }
    }
  }))
  table.results = lines
  table.results.size = lines.length
  table.order = [...order]
  table.writes = []
  table.updateEmbeddedDocuments = async (_type, updates) => {
    table.writes.push(updates)
    for (const u of updates) lines.find(l => l.id === u._id).drawn = u.drawn
  }
  table.resetResults = async () => {
    for (const line of lines) line.drawn = false
  }
  return table
}

describe("a batch of draws on a table put back in play", () => {
  beforeEach(() => {
    globalThis.CONFIG = {
      Dice: {
        termTypes: {
          PoolTerm: {
            fromRolls: rolls => {
              if (!rolls.length) throw new SyntaxError("empty pool")
              return {
                rolls
              }
            }
          }
        }
      }
    }
    globalThis.Roll = {
      defaultImplementation: {
        fromTerms: terms => ({
          terms
        })
      }
    }
    core.roll = async function () {
      const available = this.results.filter(r => !r.drawn)
      const next = available.find(r => r.id === this.order[0])
      if (!next) return {
        roll: {
        }, results: []
      }
      this.order.shift()
      return {
        roll: {
          total: 1
        }, results: [next]
      }
    }
    core.drawMany = async function (number, {
      roll = null, recursive = true
    } = {
    }) {
      let results = []
      let updates = []
      const rolls = []
      for (let n = 0; n < number; n++) {
        const draw = await this.roll({
          roll, recursive
        })
        if (draw.results.length) {
          rolls.push(draw.roll)
          results = results.concat(draw.results)
        } else break
        if (!this.replacement && !this.pack) {
          updates = updates.concat(draw.results.map(r => {
            r.drawn = true
            return {
              _id: r.id, drawn: true
            }
          }))
        }
      }
      const pool = CONFIG.Dice.termTypes.PoolTerm.fromRolls(rolls)
      roll = Roll.defaultImplementation.fromTerms([pool])
      if (updates.length) await this.updateEmbeddedDocuments("TableResult", updates, {
        diff: false
      })
      return {
        roll, results
      }
    }
  })

  afterEach(() => {
    delete globalThis.CONFIG
    delete globalThis.Roll
    delete core.roll
    delete core.drawMany
  })

  it("leaves available the lines drawn before the table was put back: 1, 2, 3, recycling, 3", async () => {
    const table = tableOf(["a", "b", "c", "c"])

    const drawn = await table.drawMany(4, {
      displayChat: false
    })

    expect(drawn.results.map(r => r.id)).toEqual(["a", "b", "c", "c"])
    expect(table.results.filter(r => r.drawn).map(r => r.id)).toEqual(["c"])
  })

  it("marks the whole batch as before when the table was not put back", async () => {
    const table = tableOf(["a", "b"])

    await table.drawMany(2, {
      displayChat: false
    })

    expect(table.results.filter(r => r.drawn).map(r => r.id)).toEqual(["a", "b"])
    expect(table.writes).toHaveLength(1)
  })

  it("puts back lines left drawn on a table with replacement, rather than drawing nothing", async () => {
    const table = tableOf(["b"], {
      replacement: true, drawn: ["a", "b", "c"]
    })

    const drawn = await table.drawMany(1, {
      displayChat: false
    })

    expect(drawn.results.map(r => r.id)).toEqual(["b"])
  })

  it("draws nothing, without throwing, when no line can come up", async () => {
    const table = tableOf([])

    const drawn = await table.drawMany(3, {
      displayChat: false
    })

    expect(drawn.results).toEqual([])
    expect(table.writes).toEqual([])
  })
})
