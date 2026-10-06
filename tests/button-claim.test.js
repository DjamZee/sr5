import {
  describe, it, expect, vi, beforeEach
} from "vitest"

const emitted = []
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: async (type, data) => emitted.push({
      type, data
    }),
    emitForPlayer: async (type, data, userId) => emitted.push({
      type, data, userId
    }),
  },
}))

const {
  holdButton, grantButton, claimChatButton, socketClaimChatButton, socketClaimChatButtonReply, HOLD_MS
} = await import("../modules/rolls/roll-helpers/button-claim.js")

// MESURES-F, F6: two owners of Diego clicking "Encaisser" at once got two resistance cards. The active GM now holds
// the button for the first who asks.

const gm = {
  id: "gm", isGM: true
}
const j1 = {
  id: "j1", isGM: false
}
const j2 = {
  id: "j2", isGM: false
}
const stranger = {
  id: "j3", isGM: false
}
const diego = {
  testUserPermission: (user) => user === j1 || user === j2
}
let card

beforeEach(() => {
  emitted.length = 0
  card = {
    flags: {
      sr5data: {
        owner: {
          speakerId: "diego"
        },
        chatCard: {
          buttons: {
            resistanceCard: {
              testType: "nonOpposedTest", actionType: "resistanceCard"
            }
          }
        },
      }
    }
  }
  globalThis.game.messages = {
    get: (id) => (id ? card : undefined)
  }
  globalThis.game.users = {
    activeGM: gm,
    get: (id) => [gm, j1, j2, stranger].find(u => u.id === id),
  }
  globalThis.game.actors = {
    get: (id) => (id === "diego" ? diego : undefined)
  }
  globalThis.foundry = globalThis.foundry ?? {
  }
  globalThis.foundry.utils = {
    ...(globalThis.foundry.utils ?? {
    }), randomID: () => "req"
  }
})

describe("holding a chat button", () => {
  it("lets the first user through and refuses another until the hold lapses", () => {
    expect(holdButton("a|resistanceCard", "j1", 0)).toBe(true)
    expect(holdButton("a|resistanceCard", "j2", 1)).toBe(false)
    expect(holdButton("a|resistanceCard", "j1", 2)).toBe(true)
    expect(holdButton("a|resistanceCard", "j2", HOLD_MS + 1)).toBe(true)
  })

  // Céleste's review: a co-owner asking again every 59 s from the console kept the button from everyone
  it("asking again never extends one's own hold", () => {
    expect(holdButton("b|resistanceCard", "j1", 0)).toBe(true)
    expect(holdButton("b|resistanceCard", "j1", HOLD_MS - 1000)).toBe(true)
    expect(holdButton("b|resistanceCard", "j2", HOLD_MS + 1)).toBe(true)
    expect(holdButton("b|resistanceCard", "j1", HOLD_MS + 2)).toBe(false)
  })

  it("never refuses a GM, whose click takes the hold", () => {
    expect(grantButton("m8", "resistanceCard", j1)).toBe(true)
    expect(grantButton("m8", "resistanceCard", gm)).toBe(true)
    expect(grantButton("m8", "resistanceCard", j1)).toBe(false)
  })

  // A grenade's "Encaisser" is an opposed button, used by everyone in the blast for their own character
  it("holds no opposed button", () => {
    card.flags.sr5data.chatCard.buttons.resistanceCard.testType = "opposedTest"
    expect(grantButton("m9", "resistanceCard", j1)).toBe(false)
  })

  it("two co-owners asking together: one card only", () => {
    expect(grantButton("m1", "resistanceCard", j1)).toBe(true)
    expect(grantButton("m1", "resistanceCard", j2)).toBe(false)
  })

  it("refuses someone who does not own the actor, and a button already spent", () => {
    expect(grantButton("m2", "resistanceCard", stranger)).toBe(false)
    delete card.flags.sr5data.chatCard.buttons.resistanceCard
    expect(grantButton("m3", "resistanceCard", j1)).toBe(false)
  })

  it("on a banishing card, asks about the spirit that resists, not the magician", () => {
    card.flags.sr5data.test = {
      typeSub: "banishing"
    }
    card.flags.sr5data.target = {
      actorId: "diego"
    }
    card.flags.sr5data.owner.speakerId = "magician"
    expect(grantButton("m6", "resistanceCard", j1)).toBe(true)
    expect(grantButton("m7", "resistanceCard", stranger)).toBe(false)
  })
})

describe("the Encaisser button", () => {
  it("asks for the button before rolling the resistance", async () => {
    const {
      readFileSync
    } = await import("fs")
    const source = readFileSync(new URL("../modules/rolls/roll-message.js", import.meta.url), "utf8")
    const branch = source.slice(source.indexOf('case "resistanceCard":'))
    expect(branch.indexOf("claimChatButton(messageId, type)")).toBeGreaterThan(0)
    expect(branch.indexOf("claimChatButton(messageId, type)")).toBeLessThan(branch.indexOf("actor.rollTest(type, null, messageData)"))
    // The grenade's opposed button goes straight to the clicker's character, without asking
    expect(branch).toContain('if (action === "nonOpposedTest" && !(await claimChatButton(messageId, type)))')
  })
})

describe("the request and its answer", () => {
  it("the active GM answers the asker only, and the answer counts only from a GM", async () => {
    game.user = j1
    const pending = claimChatButton("m4", "resistanceCard")
    await Promise.resolve()
    expect(emitted[0]).toEqual({
      type: "claimChatButton", data: {
        messageId: "m4", type: "resistanceCard", requestId: "req"
      }
    })
    game.user = gm
    await socketClaimChatButton({
      userId: "gm", data: emitted[0].data
    }, "j1")
    expect(emitted[1]).toEqual({
      type: "claimChatButtonReply", data: {
        requestId: "req", granted: true
      }, userId: "j1"
    })
    game.user = j1
    socketClaimChatButtonReply({
      data: {
        requestId: "req", granted: false
      }
    }, "j2")
    socketClaimChatButtonReply(emitted[1], "gm")
    expect(await pending).toBe(true)
  })

  it("without an active GM the button works as before", async () => {
    game.user = j1
    game.users.activeGM = null
    expect(await claimChatButton("m5", "resistanceCard")).toBe(true)
    expect(emitted).toEqual([])
  })
})
