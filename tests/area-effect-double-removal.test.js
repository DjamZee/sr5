import {
  describe, it, expect, vi
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForPlayer: vi.fn(async () => {}), emitForGM: vi.fn(async () => {}),
  },
}))
const {
  SR5_EffectArea
} = await import("../modules/system/effectArea.js")

// Two removals of the same template effects at once: the second one asked for items already gone
function actorWith(ids){
  const items = ids.map(id => ({
    id, type: "itemEffect", system: {
      ownerItem: "Scene.s.MeasuredTemplate.t"
    }
  }))
  items.get = id => items.find(i => i.id === id)
  return {
    items,
    deleteEmbeddedDocuments: vi.fn(async (type, list) => {
      for (const id of list) items.splice(items.findIndex(i => i.id === id), 1)
    }),
  }
}

describe("deleteStillThere", () => {
  it("deletes only what is still on the actor", async () => {
    const actor = actorWith(["a"])
    await SR5_EffectArea.deleteStillThere(actor, ["a", "gone"])
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["a"])
  })

  it("asks nothing when everything is already gone", async () => {
    const actor = actorWith([])
    await SR5_EffectArea.deleteStillThere(actor, ["gone"])
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it("swallows the error of a removal another one already made", async () => {
    const actor = actorWith(["a"])
    actor.deleteEmbeddedDocuments = vi.fn(async () => {
      actor.items.splice(0, 1)
      throw new Error("Item a does not exist")
    })
    await expect(SR5_EffectArea.deleteStillThere(actor, ["a"])).resolves.toBeUndefined()
  })

  it("passes on an error when the item is still there", async () => {
    const actor = actorWith(["a"])
    actor.deleteEmbeddedDocuments = vi.fn(async () => {
      throw new Error("refused")
    })
    await expect(SR5_EffectArea.deleteStillThere(actor, ["a"])).rejects.toThrow("refused")
  })

  it("two removals of a template's effects at once: one deletion asked", async () => {
    const actor = actorWith(["a", "b"])
    await Promise.all([
      SR5_EffectArea.deleteTemplateEffect(actor, "Scene.s.MeasuredTemplate.t"),
      SR5_EffectArea.deleteTemplateEffect(actor, "Scene.s.MeasuredTemplate.t"),
    ])
    expect(actor.items).toHaveLength(0)
  })
})
