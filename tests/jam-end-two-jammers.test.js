import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"

// Two jammers on one target (Jam Signals, SR5 p. 239): each leaves its own signalJammed item, and the target
// wears the "jammed" status icon. Stopping one jammer lifted the first icon found, whoever had set it, so the
// target lost its icon while the other jammer still jammed it.
describe("SR5_EffectArea.onJamEnd with two jammers on one target", () => {
  let saved, target

  const makeTarget = (items, effects) => {
    const actor = {
      uuid: "Actor.t", items, effects,
      deleteEmbeddedDocuments: vi.fn(async (type, ids) => {
        const list = type === "Item" ? actor.items : actor.effects
        for (const id of ids) list.splice(list.findIndex(d => d.id === id), 1)
      }),
    }
    return actor
  }
  const jammed = (id, ownerID) => ({
    id, system: {
      type: "signalJammed", ownerID
    }
  })
  const icon = id => ({
    id, origin: "signalJammed"
  })

  beforeEach(() => {
    saved = globalThis.game
  })
  afterEach(() => {
    globalThis.game = saved
  })
  const world = () => {
    globalThis.game = {
      user: {
        isGM: true
      }, scenes: [{
        tokens: [{
          actor: target
        }]
      }]
    }
  }

  it("keeps the icon while the other jammer still jams the target", async () => {
    target = makeTarget([jammed("iA", "A"), jammed("iB", "B")], [icon("e1")])
    world()
    await SR5_EffectArea.onJamEnd("A")
    expect(target.items.map(i => i.id)).toEqual(["iB"])
    expect(target.effects.map(e => e.id)).toEqual(["e1"])
  })

  it("lifts one icon of two, then the last with the last jammer", async () => {
    target = makeTarget([jammed("iA", "A"), jammed("iB", "B")], [icon("e1"), icon("e2")])
    world()
    await SR5_EffectArea.onJamEnd("A")
    expect(target.effects).toHaveLength(1)
    await SR5_EffectArea.onJamEnd("B")
    expect(target.items).toHaveLength(0)
    expect(target.effects).toHaveLength(0)
  })
})
