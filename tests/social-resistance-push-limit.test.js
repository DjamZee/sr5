import {
  describe, it, expect, beforeAll, vi
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  default: skillInfo
} = await import("../modules/rolls/roll-test-case/test-Skill.js")

// l. 570: the resistance to a Con, pushed with Edge, shows its result again, not "Resist":
// Push the Limit refreshes a copy of the card, which keeps the mark of the target's roll (1f99d4854)
beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue({
    system: {
    }
  })
})

const resistanceCard = () => ({
  owner: {
    actorId: "t1"
  }, target: {
    hasTarget: false
  }, test: {
    type: "skillDicePool", typeSub: "con", isOpposedResistance: true
  }, roll: {
    hits: 2
  }, threshold: {
    value: 3
  }, chatCard: {
    buttons: {
    }
  },
})

describe("social resistance after Push the Limit", () => {
  it("ends the test on the pushed copy of the card", async () => {
    const pushed = structuredClone(resistanceCard())
    pushed.roll.hits = 3
    await skillInfo(pushed)
    expect(pushed.chatCard.buttons.con).toBeUndefined()
    expect(pushed.chatCard.buttons.actionEnd.label).toBe("SR5.SuccessfulDefense")
  })
})
