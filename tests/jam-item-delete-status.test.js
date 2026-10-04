import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  sr5HookDeleteItem
} = await import("../modules/hooks/item.js")

// Deleting a jammer's signalJam item from its item list (or from anywhere but the sheet's stop button) left its
// "Signal jamming" status on the actor. The status now goes with the item, removed by the user who deleted it.
describe("deleting a signalJam item", () => {
  let actor, item

  beforeEach(() => {
    globalThis.game.user = {
      id: "u1", isGM: false
    }
    globalThis.game.scenes = []
    actor = {
      id: "a1",
      effects: [{
        id: "e1", origin: "signalJam"
      }, {
        id: "e2", origin: "other"
      }],
      deleteEmbeddedDocuments: vi.fn(async () => {}),
    }
    item = {
      type: "itemEffect",
      parent: actor,
      system: {
        type: "signalJam"
      },
      testUserPermission: () => true,
    }
  })

  it("removes the jamming status of the user who deleted it", async () => {
    await sr5HookDeleteItem(item, {
    }, "u1")
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["e1"])
  })

  it("leaves it to that user on the other clients", async () => {
    await sr5HookDeleteItem(item, {
    }, "u2")
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
