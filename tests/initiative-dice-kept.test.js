import {
  describe, it, expect, vi
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5Combat
} from "../modules/system/srcombat.js"

// SR5 p. 162: dice gained or lost mid-round are rolled. Switching wired reflexes off and on rolled the die again each
// time (measured: 14 -> 19 -> 12 -> 18 -> 14 -> 19 -> 15 in six clicks). A die already rolled this round is kept
// (ruling of DjamZ, 2026-10-06): only a die never rolled this round is rolled.

const roller = (...results) => {
  const queue = [...results]
  return vi.fn(async n => queue.splice(0, n))
}
const empty = {
  added: [], removed: []
}

describe("initiative dice kept through the round", () => {
  it("switching on, off, on, off gives back the same die each time", async () => {
    const fresh = roller(4)
    let kept = empty
    const sums = []
    for (const delta of [1, -1, 1, -1, 1, -1]) {
      const {
        values, memory
      } = await SR5Combat.takeInitDice(kept, delta, fresh)
      sums.push(values.reduce((s, v) => s + v, 0))
      kept = memory
    }
    expect(sums).toEqual([4, 4, 4, 4, 4, 4])
    expect(fresh).toHaveBeenCalledTimes(6)
    expect(fresh.mock.calls.map(c => c[0])).toEqual([1, 0, 0, 0, 0, 0])
  })

  it("a die of the first roll lost is rolled once (the book), then kept", async () => {
    const fresh = roller(2)
    const first = await SR5Combat.takeInitDice(empty, -1, fresh)
    const back = await SR5Combat.takeInitDice(first.memory, 1, fresh)
    const again = await SR5Combat.takeInitDice(back.memory, -1, fresh)
    expect([first.values, back.values, again.values]).toEqual([[2], [2], [2]])
  })

  it("a die beyond those already rolled is a real new die", async () => {
    const fresh = roller(5, 3)
    // +1 (rolled), -1 (kept), then +2: the kept die comes back, one more is rolled
    const one = await SR5Combat.takeInitDice(empty, 1, fresh)
    const off = await SR5Combat.takeInitDice(one.memory, -1, fresh)
    const two = await SR5Combat.takeInitDice(off.memory, 2, fresh)
    expect(one.values).toEqual([5])
    expect(off.values).toEqual([5])
    expect(two.values).toEqual([5, 3])
    expect(fresh.mock.calls.map(c => c[0])).toEqual([1, 0, 1])
  })

  it("the memory of another round, another initiative or with values a d6 cannot give is not read", () => {
    const stored = {
      round: 2, initKey: "physicalInit", added: [6, 6], removed: [9, 0, 2.5, "6", 3]
    }
    expect(SR5Combat.initDiceKept(stored, 3, "physicalInit")).toEqual(empty)
    expect(SR5Combat.initDiceKept(stored, 2, "astralInit")).toEqual(empty)
    expect(SR5Combat.initDiceKept(stored, 2, "physicalInit")).toEqual({
      added: [6, 6], removed: [3]
    })
  })
})
