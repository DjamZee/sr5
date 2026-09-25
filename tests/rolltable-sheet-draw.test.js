import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"

import {
  SR5RollTable
} from "../modules/entities/rollTables/entityRollTable.js"

/**
 * A Roll that returns what the formula says, so a count can be stated
 * without depending on dice.
 */
class FakeRoll {
  constructor(formula) {
    this.formula = formula
  }

  static create(formula) {
    return new FakeRoll(formula)
  }

  static defaultImplementation = {
    fromTerms: terms => ({
      terms
    })
  }

  async evaluate() {
    this.total = Number(this.formula)
    return this
  }
}

// What core would do, reduced to what it was asked. The sheet's button calls
// draw() with the roll it made and the line that roll landed on; the
// per-line button calls it with a line and no roll.
const core = Object.getPrototypeOf(SR5RollTable.prototype)
const calls = {
}

/**
 * A table asking for `formula` draws.
 * @param {string} formula
 * @returns {SR5RollTable}
 */
function tableOf(formula) {
  const table = new SR5RollTable()
  table.name = "Butin"
  table.getFlag = (_scope, key) => (key === "rollsFormula" ? formula : undefined)
  return table
}

describe("SR5RollTable#draw from the sheet's button", () => {
  const firstRoll = {
    total: 2
  }
  const first = {
    id: "a"
  }

  beforeEach(() => {
    globalThis.Roll = FakeRoll
    globalThis.CONFIG = {
      Dice: {
        termTypes: {
          PoolTerm: {
            fromRolls: rolls => ({
              rolls
            })
          }
        }
      }
    }
    calls.draw = []
    calls.drawMany = []
    calls.toMessage = []
    core.draw = async function (options) {
      calls.draw.push(options)
      return {
        roll: options.roll, results: options.results ?? []
      }
    }
    core.drawMany = async function (number, options) {
      calls.drawMany.push({
        number, options
      })
      const results = Array.from({
        length: number
      }, (_, i) => ({
        id: `more${i}`
      }))
      const rolls = results.map((_, i) => ({
        total: 10 + i
      }))
      return {
        roll: {
          terms: [{
            rolls
          }]
        },
        results
      }
    }
    core.toMessage = async function (results, options) {
      calls.toMessage.push({
        results, options
      })
      return null
    }
  })

  afterEach(() => {
    delete globalThis.Roll
    delete globalThis.CONFIG
    delete core.draw
    delete core.drawMany
    delete core.toMessage
  })

  // Foundry 13.351, roll-table-sheet.mjs: `table.draw(await table.roll())`.
  // The line the wheel landed on is only the first of the draws.
  it("makes the draws the table's formula still asks for", async () => {
    await tableOf("4").draw({
      roll: firstRoll, results: [first]
    })

    expect(calls.drawMany).toHaveLength(1)
    expect(calls.drawMany[0].number).toBe(3)
    expect(calls.drawMany[0].options.displayChat).toBe(false)
  })

  it("keeps the sheet's line and writes one card for all the draws", async () => {
    const drawn = await tableOf("4").draw({
      roll: firstRoll, results: [first]
    })

    expect(calls.draw[0].displayChat).toBe(false)
    expect(calls.draw[0].results).toEqual([first])
    expect(drawn.results.map(r => r.id)).toEqual(["a", "more0", "more1", "more2"])
    expect(drawn.roll.terms[0].rolls.map(r => r.total)).toEqual([2, 10, 11, 12])
    expect(calls.toMessage).toHaveLength(1)
    expect(calls.toMessage[0].results).toHaveLength(4)
  })

  it("leaves a table without a formula to core", async () => {
    await tableOf("").draw({
      roll: firstRoll, results: [first]
    })

    expect(calls.drawMany).toHaveLength(0)
    expect(calls.draw).toHaveLength(1)
  })

  // The per-line button of the sheet draws the line the game master chose,
  // and nothing else.
  it("draws a line picked by hand as it is", async () => {
    await tableOf("4").draw({
      results: [first]
    })

    expect(calls.drawMany).toHaveLength(0)
    expect(calls.draw).toHaveLength(1)
    expect(calls.draw[0].results).toEqual([first])
  })
})
