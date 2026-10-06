import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_EffectArea
} = await import("../modules/system/effectArea.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  sr5HookDrawMeasuredTemplate, sr5HookDeleteMeasuredTemplate
} = await import("../modules/hooks/canvas.js")

// Marta's measures (06/10), two GMs connected: each GM's client ran the jam and template hooks, so every target got two
// signalJammed items (noise counted twice, one left behind when the jam ended) and two copies of a noise template's
// effect. The active GM alone gives and lifts them now (security pass, Petra)
describe("two GMs connected: area effects are given once", () => {
  let saved, jammer, near

  const makeActor = (id, items = []) => ({
    id, uuid: `Actor.${id}`, name: id, isToken: false, items, effects: [],
  })
  const asGM = (id, activeId) => {
    globalThis.game.user = {
      id, isGM: true
    }
    globalThis.game.users = {
      activeGM: {
        id: activeId, isSelf: id === activeId
      }
    }
  }

  beforeEach(() => {
    saved = {
      scenes: globalThis.game.scenes, user: globalThis.game.user, users: globalThis.game.users
    }
    jammer = makeActor("jammer", [{
      system: {
        type: "signalJam", ownerID: "jammer", value: 5
      }
    }])
    near = makeActor("near")
    const tokens = [{
      id: "tJ", actorId: "jammer", actorLink: true, actor: jammer, x: 0, y: 0
    }, {
      id: "tN", actorId: "near", actorLink: true, actor: near, x: 10, y: 0
    }]
    globalThis.game.scenes = [{
      grid: {
        units: "m", measurePath: ([a, b]) => ({
          distance: Math.hypot(a.x - b.x, a.y - b.y)
        })
      }, tokens: Object.assign(tokens, {
        get: id => tokens.find(t => t.id === id)
      })
    }]
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(jammer)
    vi.spyOn(SR5_EffectArea, "createJammedEffect").mockResolvedValue()
    vi.spyOn(SR5_EffectArea, "initiateTemplateEffect").mockResolvedValue()
    vi.spyOn(SR5_EffectArea, "removeTemplateEffect").mockResolvedValue()
  })

  afterEach(() => {
    globalThis.game.scenes = saved.scenes
    globalThis.game.user = saved.user
    globalThis.game.users = saved.users
    vi.restoreAllMocks()
  })

  it("a GM who is not the active one lays no jammed effect", async () => {
    asGM("gm2", "gm1")
    await SR5_EffectArea.onJamCreation("jammer")
    expect(SR5_EffectArea.createJammedEffect).not.toHaveBeenCalled()
  })

  it("the active GM lays it, once", async () => {
    asGM("gm1", "gm1")
    await SR5_EffectArea.onJamCreation("jammer")
    expect(SR5_EffectArea.createJammedEffect).toHaveBeenCalledTimes(1)
  })

  //Measured in game: a player's jam written at 99 gave 99 noise to a target she does not own
  it("the noise given to others is capped at the jammer's Jam Signals pool plus Chance", async () => {
    asGM("gm1", "gm1")
    jammer.items[0].system.value = 99
    jammer.system = {
      matrix: {
        actions: {
          jamSignals: {
            test: {
              dicePool: 5
            }
          }
        }
      }, specialAttributes: {
        edge: {
          augmented: {
            value: 2
          }
        }
      }
    }
    await SR5_EffectArea.onJamCreation("jammer")
    expect(SR5_EffectArea.createJammedEffect.mock.calls[0][2]).toBe(7)
    jammer.items[0].system.value = 4
    expect(SR5_EffectArea.jamNoise(jammer, jammer.items[0])).toBe(4)
  })

  it("a template drawn or deleted on a second GM's canvas gives and lifts nothing there", async () => {
    asGM("gm2", "gm1")
    await sr5HookDrawMeasuredTemplate({
      document: {
      }
    })
    await sr5HookDeleteMeasuredTemplate({
      flags: {
      }
    })
    expect(SR5_EffectArea.initiateTemplateEffect).not.toHaveBeenCalled()
    expect(SR5_EffectArea.removeTemplateEffect).not.toHaveBeenCalled()
    asGM("gm1", "gm1")
    await sr5HookDrawMeasuredTemplate({
      document: {
      }
    })
    expect(SR5_EffectArea.initiateTemplateEffect).toHaveBeenCalledTimes(1)
  })
})
