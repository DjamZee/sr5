import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Dommages non résistés (effet addDamage), trouvé par Bérénice : l'effet ajoutait les cases dans actor.system
// lui-même, puis appelait actor.update(actor.system). Rien n'était écrit : les cases disparaissaient à la
// préparation suivante de l'acteur. Le jumeau de heal-spell-persists.test.js.

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ActorHelper
} = await import("../modules/entities/actors/entityActor-helpers.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")

const monitor = (boxes, max) => ({
  actual: {
    base: boxes, modifiers: [], value: boxes
  }, value: max
})

function victim({
  stun = 0, physical = 0, overflow = 0, type = "actorPc", isOwner = true
} = {
}){
  const system = {
    conditionMonitors: {
      stun: monitor(stun, 10), physical: monitor(physical, 10), overflow: monitor(overflow, 4)
    }
  }
  return {
    type, isOwner, effects: [], system,
    toObject: () => ({
      system: structuredClone(system)
    }),
    update: vi.fn(),
    createEmbeddedDocuments: vi.fn(),
  }
}

const card = value => ({
  owner: {
    itemUuid: "Item.sort", messageId: "m1"
  }, roll: {
    hits: value, netHits: value
  }, magic: {
  }, test: {
  },
})

let author, confirm
beforeEach(() => {
  author = {
    isGM: true
  }
  confirm = vi.fn(async () => true)
  globalThis.game = {
    ...globalThis.game, user: {
      isGM: true, id: "gm"
    }, messages: {
      get: () => ({
        author
      })
    }, i18n: {
      localize: k => k, format: k => k
    },
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.foundry = {
    ...globalThis.foundry, applications: {
      api: {
        DialogV2: {
          confirm
        }
      }
    }
  }
  globalThis.fromUuid = async () => ({
    name: "Sort", type: "itemSpell", parent: null, system: {
      customEffects: {
        0: {
          target: "stun.addDamage", type: "value", value: 3, multiplier: 1, transfer: true
        }
      }
    }
  })
})

const written = a => a.update.mock.calls[0][0]

describe("Dommages non résistés écrits dans la source", () => {
  it("2 cases étourdissantes + 3 : l'acteur est mis à jour à 5, sans toucher à actor.system", async () => {
    const v = victim({
      stun: 2
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(v)
    await SR5_ActorHelper.applyExternalEffect("v", card(3), "customEffects")
    expect(v.update).toHaveBeenCalledTimes(1)
    expect(written(v)["system.conditionMonitors.stun.actual.base"]).toBe(5)
    expect(v.system.conditionMonitors.stun.actual.base).toBe(2)
  })
  it("Étourdissant plein déborde en Physique, une case pour deux (SR5 p. 170)", async () => {
    const v = victim({
      stun: 9
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(v)
    await SR5_ActorHelper.applyExternalEffect("v", card(3), "customEffects")
    expect(written(v)["system.conditionMonitors.stun.actual.base"]).toBe(10)
    expect(written(v)["system.conditionMonitors.physical.actual.base"]).toBe(1)
  })
  it("Physique plein déborde dans le surplus (SR5 p. 101), puis la mort au-delà", async () => {
    globalThis.fromUuid = async () => ({
      name: "Sort", type: "itemSpell", parent: null, system: {
        customEffects: {
          0: {
            target: "physical.addDamage", type: "value", value: 7, multiplier: 1, transfer: true
          }
        }
      }
    })
    const v = victim({
      physical: 8
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(v)
    await SR5_ActorHelper.applyExternalEffect("v", card(7), "customEffects")
    expect(written(v)["system.conditionMonitors.physical.actual.base"]).toBe(10)
    expect(written(v)["system.conditionMonitors.overflow.actual.base"]).toBe(4)
    expect(v.createEmbeddedDocuments).toHaveBeenCalled()
  })
  it("une joueuse sur un acteur qu'elle ne possède pas : rien n'est écrit", async () => {
    game.user.isGM = false
    const v = victim({
      isOwner: false
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(v)
    await SR5_ActorHelper.applyExternalEffect("v", card(3), "customEffects")
    expect(v.update).not.toHaveBeenCalled()
  })
  it("le MJ applique les dommages d'une joueuse : il confirme, et un refus n'écrit rien", async () => {
    author = {
      isGM: false, id: "joueuse"
    }
    confirm.mockResolvedValue(false)
    const v = victim()
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(v)
    await SR5_ActorHelper.applyExternalEffect("v", card(3), "customEffects")
    expect(confirm).toHaveBeenCalled()
    expect(v.update).not.toHaveBeenCalled()
  })
})
