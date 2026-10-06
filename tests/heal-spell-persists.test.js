import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Soins (SR5 p. 291), mesuré sur 5a4cbf2c : l'effet retirait les cases dans actor.system lui-même, puis appelait
// actor.update(actor.system). Rien n'était écrit : la fiche montrait la guérison jusqu'à la préparation suivante
// de l'acteur, et le moniteur pouvait descendre sous 0.

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

function patient(boxes){
  const system = {
    conditionMonitors: {
      physical: {
        actual: {
          base: boxes, modifiers: [], value: boxes
        }
      }
    }
  }
  return {
    system,
    toObject: () => ({
      system: structuredClone(system)
    }),
    update: vi.fn(),
  }
}

const card = hits => ({
  owner: {
    itemUuid: "Item.soins", messageId: "m1"
  }, roll: {
    hits, netHits: 0
  }, magic: {
  }, test: {
  },
})

beforeEach(() => {
  globalThis.game = {
    ...globalThis.game, messages: {
      get: () => ({
        author: {
          isGM: true
        }
      })
    }
  }
  globalThis.fromUuid = async () => ({
    system: {
      customEffects: {
        0: {
          target: "physical.removeDamage", type: "hits", multiplier: 1, transfer: true
        }
      }
    }
  })
})

describe("Soins écrit la guérison", () => {
  it("6 cases, 2 succès : l'acteur est mis à jour à 4, sans toucher à actor.system", async () => {
    const p = patient(6)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(p)
    await SR5_ActorHelper.applyExternalEffect("p", card(2), "customEffects")
    expect(p.update).toHaveBeenCalledTimes(1)
    // Written by path: a whole prepared copy put the computed values in the source (prepared-copy-not-written.test.js)
    const written = p.update.mock.calls[0][0]
    expect(written["system.conditionMonitors.physical.actual.base"]).toBe(4)
    expect(p.system.conditionMonitors.physical.actual.base).toBe(6)
  })
  it("2 cases, 5 succès : 0, jamais en dessous", async () => {
    const p = patient(2)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(p)
    await SR5_ActorHelper.applyExternalEffect("p", card(5), "customEffects")
    expect(p.update.mock.calls[0][0]["system.conditionMonitors.physical.actual.base"]).toBe(0)
  })
})
