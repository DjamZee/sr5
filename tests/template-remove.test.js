import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_RollMessage
} = await import("../modules/rolls/roll-message.js")

// "Remove template" on a grenade card used to delete the item's FIRST template: after two throws, the second
// card's button erased the first throw's circle. It now goes through the template the card recorded.

let deleted
let warned

function sceneWith(list){
  const templates = [...list]
  templates.get = (id) => list.find(t => t.id === id)
  globalThis.canvas = {
    scene: {
      templates,
      deleteEmbeddedDocuments: async (type, ids) => {
        deleted.push(...ids)
      },
    }
  }
}

function template(id, itemUuid){
  return {
    id, flags: {
      sr5: {
        itemUuid
      }
    },
    canUserModify: () => true,
  }
}

beforeEach(() => {
  deleted = []
  warned = []
  globalThis.ui = {
    notifications: {
      warn: (m) => warned.push(m), info: () => {}
    }
  }
})

describe("SR5_RollMessage.removeTemplate", () => {
  it("removes the card's own template, not the item's first", async () => {
    sceneWith([template("first", "Item.grenade"), template("second", "Item.grenade")])
    await SR5_RollMessage.removeTemplate(null, "Item.grenade", "second")
    expect(deleted).toEqual(["second"])
  })

  it("removes nothing and warns when the card's template is already gone", async () => {
    sceneWith([template("first", "Item.grenade")])
    await SR5_RollMessage.removeTemplate(null, "Item.grenade", "second")
    expect(deleted).toEqual([])
    expect(warned.length).toBe(1)
  })

  it("without a recorded template, removes the item's most recent one", async () => {
    sceneWith([template("first", "Item.grenade"), template("second", "Item.grenade"), template("x", "Item.spell")])
    await SR5_RollMessage.removeTemplate(null, "Item.grenade")
    expect(deleted).toEqual(["second"])
  })
})
