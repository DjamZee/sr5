import {
  describe, it, expect, beforeEach
} from "vitest"
import {
  sr5RollModeOf, sr5CanShareDraw, sr5CanRerollDraw, sr5DrawTableUuid
} from "../modules/interface/table-actions.js"

// "Relancer" and "Partager" under a table draw: who is offered them, and in
// which mode a draw is made again.

const gm = {
  id: "gm", isGM: true
}
const ann = {
  id: "ann", isGM: false
}
const bob = {
  id: "bob", isGM: false
}

function card({
  author = ann, whisper = [], blind = false, visible = true, flags = {
    sr5: {
      tableUuid: "RollTable.t1"
    }
  }
} = {
}) {
  return {
    author, whisper, blind, isContentVisible: visible, flags,
    getFlag(scope, key) {
      return this.flags[scope]?.[key]
    }
  }
}

beforeEach(() => {
  globalThis.game = {
    user: ann, tables: new Map([["t2", {
    }]])
  }
})

describe("the mode a draw is made again in", () => {
  it("reads public, private to the GM, to oneself and blind back from the card", () => {
    expect(sr5RollModeOf(card())).toBe("publicroll")
    expect(sr5RollModeOf(card({
      whisper: ["gm"]
    }))).toBe("gmroll")
    expect(sr5RollModeOf(card({
      whisper: ["ann"]
    }))).toBe("selfroll")
    expect(sr5RollModeOf(card({
      whisper: ["gm"], blind: true
    }))).toBe("blindroll")
  })
})

describe("Partager", () => {
  it("is offered on a private card to its author and to the GM, never on a public one", () => {
    const secret = card({
      whisper: ["gm"]
    })
    expect(sr5CanShareDraw(secret, ann)).toBe(true)
    expect(sr5CanShareDraw(secret, gm)).toBe(true)
    expect(sr5CanShareDraw(secret, bob)).toBe(false)
    expect(sr5CanShareDraw(card(), ann)).toBe(false)
  })

  it("is not offered to a player on a blind draw she has not seen", () => {
    const blind = card({
      whisper: ["gm"], blind: true, visible: false
    })
    expect(sr5CanShareDraw(blind, ann)).toBe(false)
  })
})

describe("Relancer", () => {
  it("is the GM's on every card, a player's on her own only", () => {
    expect(sr5CanRerollDraw(card(), gm)).toBe(true)
    expect(sr5CanRerollDraw(card(), ann)).toBe(true)
    expect(sr5CanRerollDraw(card(), bob)).toBe(false)
  })

  it("is never a player's on a draw the GM made", () => {
    expect(sr5CanRerollDraw(card({
      author: gm
    }), ann)).toBe(false)
  })

  it("finds an older card's world table by core's flag, and offers nothing without a table", () => {
    expect(sr5DrawTableUuid(card({
      flags: {
        core: {
          RollTable: "t2"
        }
      }
    }))).toBe("RollTable.t2")
    expect(sr5CanRerollDraw(card({
      flags: {
        core: {
          RollTable: "gone"
        }
      }
    }), gm)).toBe(false)
  })
})
