import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Health spells affect "un organisme vivant" (SR5 p. 285). Measured in game (lot 17c): Heal cast on a drone brought its
// condition monitor from 5 boxes to 0

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
const {
  isLivingPatient
} = await import("../modules/rolls/roll-helpers/cardRoller.js")

function target(type, monitors, extra = {
}){
  const system = {
    conditionMonitors: monitors, ...extra
  }
  return {
    type, name: type, system,
    toObject: () => ({
      system: structuredClone(system)
    }),
    update: vi.fn(),
  }
}
const condition = boxes => ({
  condition: {
    actual: {
      base: boxes, modifiers: [], value: boxes
    }
  }
})

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
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.game = {
    ...globalThis.game, i18n: {
      localize: k => k, format: k => k
    }, messages: {
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

describe("Heal on what is not alive", () => {
  it("leaves a drone's condition monitor alone, with a warning", async () => {
    const drone = target("actorDrone", condition(5))
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(drone)
    await SR5_ActorHelper.applyExternalEffect("d", card(5), "customEffects")
    expect(drone.update).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_HealNotLiving")
  })
  it("still heals a grunt's single condition monitor", async () => {
    const grunt = target("actorGrunt", condition(5))
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(grunt)
    await SR5_ActorHelper.applyExternalEffect("g", card(2), "customEffects")
    expect(grunt.update.mock.calls[0][0]["system.conditionMonitors.condition.actual.base"]).toBe(3)
  })
  it("isLivingPatient: no drone, no AI core, no monitorless device", () => {
    expect(isLivingPatient(target("actorDrone", condition(1)))).toBe(false)
    expect(isLivingPatient(target("actorPc", condition(1), {
      activeSpecialAttribute: "depth"
    }))).toBe(false)
    expect(isLivingPatient(target("actorDevice", {
      matrix: {
      }
    }))).toBe(false)
    expect(isLivingPatient(target("actorPc", {
      physical: {
      }, stun: {
      }
    }))).toBe(true)
  })
})
