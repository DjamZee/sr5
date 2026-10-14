import {
  describe, it, expect, afterEach
} from 'vitest'
import {
  dropProneChoices, isProne, freeActionsLeft, EAT_DIRT_COST
} from '../modules/rolls/roll-helpers/eat-dirt.js'

const prone = new Set(["prone"])
const actor = ({
  statuses = new Set(), free
} = {}) => ({
  effects: [{
    statuses
  }], system: {
    specialProperties: {
      actions: {
        free: {
          current: free
        }
      }
    }
  }
})

describe("Going prone under suppressive fire (SR5 p. 170, 182)", () => {
  afterEach(() => {
    delete globalThis.game
  })

  it("costs 5 Initiative as an interruption", () => {
    expect(EAT_DIRT_COST).toBe(5)
  })

  it("offers the free action first while one remains, then only the interruption", () => {
    expect(dropProneChoices({
      prone: false, freeActions: 1
    })).toEqual(["free", "interruption"])
    expect(dropProneChoices({
      prone: false, freeActions: 0
    })).toEqual(["interruption"])
  })

  it("asks nothing of a character already prone", () => {
    expect(dropProneChoices({
      prone: true, freeActions: 1
    })).toBe("alreadyProne")
    expect(isProne(actor({
      statuses: prone
    }))).toBe(true)
    expect(isProne(actor())).toBe(false)
  })

  it("reads the free actions left in combat only", () => {
    expect(freeActionsLeft(actor({
      free: 0
    }))).toBe(1)
    globalThis.game = {
      combat: {
      }
    }
    expect(freeActionsLeft(actor({
      free: 0
    }))).toBe(0)
    expect(freeActionsLeft(actor({
      free: 1
    }))).toBe(1)
  })
})
