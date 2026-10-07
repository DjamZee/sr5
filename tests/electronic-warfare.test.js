import {
  describe, it, expect, vi, beforeAll, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

import {
  TARGET_DEVICE_EFFECT, NOISE_SUPPRESSION_EFFECT, netHitsOf, confusePilotThreshold, brokenLockValue, noiseSuppressionShare,
  consoleNoiseReductionDice, isSlavedAttacker, targetDeviceBonus, targetDeviceOffer, turnEffect, noiseSuppressionCustomEffects
} from "../modules/rolls/roll-helpers/electronic-warfare.js"

const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  SR5Combat
} = await import("../modules/system/srcombat.js")
const {
  default: matrixActionInfo
} = await import("../modules/rolls/roll-test-case/test-MatrixAction.js")
const {
  default: matrixDefenseInfo
} = await import("../modules/rolls/roll-test-case/test-MatrixDefense.js")
const {
  default: autopilotUnforeseen
} = await import("../modules/rolls/roll-prepare-case/rollData-AutopilotUnforeseen.js")

// Rigger 5.0 p. 34-35: the effects of the electronic warfare actions (lot R5 of the rigging plan)

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

const rigger = {
  id: "rigger", name: "Rigger"
}
const drone = (slaved = true, owner = "rigger") => ({
  type: "actorDrone", system: {
    slaved, vehicleOwner: {
      id: owner
    }
  }
})
const shooter = (smartlink = 1) => ({
  type: "actorPc", system: {
    specialProperties: {
      smartlink: {
        value: smartlink
      }
    }
  }
})
const tracked = (value, ownerID = "rigger", type = TARGET_DEVICE_EFFECT) => ({
  type: "itemEffect", system: {
    type, value, ownerID, ownerName: ownerID
  }
})

describe("Confuse Pilot threshold (Rigger 5.0 p. 34)", () => {
  it("is half the net hits, rounded up (SR5 p. 50)", () => {
    expect(confusePilotThreshold(3)).toBe(2)
    expect(confusePilotThreshold(4)).toBe(2)
    expect(confusePilotThreshold(1)).toBe(1)
    expect(confusePilotThreshold(0)).toBe(0)
  })

  it("reads the net hits of the defense card", () => {
    expect(netHitsOf(5, 2)).toBe(3)
    expect(netHitsOf(2, 5)).toBe(0)
  })
})

describe("Break Target Lock (Rigger 5.0 p. 35)", () => {
  it("lowers the lock, kept as a defense penalty, by one per net hit", () => {
    expect(brokenLockValue(-3, 2)).toBe(-1)
  })

  it("breaks it when the net hits reach it", () => {
    expect(brokenLockValue(-2, 2)).toBeNull()
    expect(brokenLockValue(-2, 5)).toBeNull()
  })

  it("leaves it whole with no net hit", () => {
    expect(brokenLockValue(-2, 0)).toBe(-2)
  })
})

describe("Suppress Noise (Rigger 5.0 p. 35)", () => {
  it("raises the noise reduction by the hits", () => {
    const custom = noiseSuppressionCustomEffects(3)["0"]
    expect(custom.target).toBe("system.matrix.attributes.noiseReduction")
    expect(custom.value).toBe(3)
  })

  it("never feeds the dice of the next electronic warfare action", () => {
    const noiseReduction = {
      value: 5, modifiers: [{
        type: "riggerCommandConsole", value: 2
      }, {
        type: NOISE_SUPPRESSION_EFFECT, value: 3
      }]
    }
    expect(noiseSuppressionShare(noiseReduction.modifiers)).toBe(3)
    expect(consoleNoiseReductionDice(noiseReduction)).toBe(2)
  })
})

describe("Target Device (Rigger 5.0 p. 34)", () => {
  it("helps a drone slaved to the rigger", () => {
    expect(isSlavedAttacker(drone(), "rigger")).toBe(true)
    expect(targetDeviceBonus([tracked(3)], drone())?.value).toBe(3)
  })

  it("does not help a drone that is not slaved, or slaved to another rigger", () => {
    expect(targetDeviceBonus([tracked(3)], drone(false))).toBeNull()
    expect(targetDeviceBonus([tracked(3)], drone(true, "other"))).toBeNull()
  })

  it("helps a shooter whose smartlinked weapon is in the rigger's PAN", () => {
    const options = {
      weaponUuid: "Actor.p.Item.gun", masterContentOf: id => (id === "rigger" ? ["Actor.p.Item.gun"] : [])
    }
    expect(targetDeviceBonus([tracked(2)], shooter(), options)?.value).toBe(2)
    expect(targetDeviceBonus([tracked(2)], shooter(0), options)).toBeNull()
    expect(targetDeviceBonus([tracked(2)], shooter(), {
      ...options, weaponUuid: "Actor.p.Item.other"
    })).toBeNull()
  })

  it("ignores the other effects of the target", () => {
    expect(targetDeviceBonus([tracked(3, "rigger", "sensorLock")], drone())).toBeNull()
  })

  it("becomes a ticked box of the attack dialog", () => {
    const offer = targetDeviceOffer({
      value: 3, ownerName: "Rigger"
    }, "label")
    expect(offer).toMatchObject({
      kind: "dicePool", value: 3, checked: true, indirect: true
    })
    expect(targetDeviceOffer(null, "label")).toBeNull()
  })
})

describe("Both effects last until the end of the combat turn", () => {
  beforeEach(() => {
    globalThis.ui = {
      notifications: {
        info: vi.fn(), warn: vi.fn()
      }
    }
  })

  for (const type of [TARGET_DEVICE_EFFECT, NOISE_SUPPRESSION_EFFECT]) {
    it(`${type} ends at the next combat turn`, async () => {
      const made = turnEffect({
        name: type, type, owner: rigger, value: 3, target: "x"
      })
      expect(made["system.durationType"]).toBe("round")
      expect(made["system.duration"]).toBe(1)
      const item = {
        id: "e1", type: "itemEffect", name: type, update: vi.fn(), system: {
          type, value: 3, ownerID: "rigger", duration: made["system.duration"], durationType: made["system.durationType"]
        }
      }
      const items = [item]
      const actor = {
        items, effects: [], system: {
        }, deleteEmbeddedDocuments: vi.fn(async (t, ids) => {
          if (t === "Item") for (const i of ids) items.splice(items.findIndex(x => x.id === i), 1)
        })
      }
      vi.spyOn(SR5Combat, "getActorFromCombatant").mockReturnValue(actor)
      await SR5Combat.manageTurnEnd({
        name: "Garde"
      })
      expect(items).toHaveLength(0)
    })
  }
})

const card = (typeSub, hits, defenseHits) => ({
  test: {
    typeSub
  }, roll: {
    hits: defenseHits ?? hits
  }, threshold: {
    value: 0
  }, matrix: {
    lastActionWritten: true
  }, previousMessage: {
    hits, actorId: "rigger"
  }, target: {
  }, damage: {
    matrix: {
    }
  }, chatCard: {
    buttons: {
    }
  }, edge: {
  },
})

describe("The cards offer the effects", () => {
  beforeAll(() => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue({
      name: "X", system: {
        matrix: {
          programs: {
          }
        }
      }
    })
  })

  it("Suppress Noise is a simple test, with no defense", async () => {
    const data = card("suppressNoise", 3)
    await matrixActionInfo(data, "rigger")
    expect(data.chatCard.buttons.matrixAction).toBeUndefined()
    expect(data.chatCard.buttons.suppressNoise).toBeDefined()
  })

  it("Suppress Noise without hits fails", async () => {
    const data = card("suppressNoise", 0)
    await matrixActionInfo(data, "rigger")
    expect(data.chatCard.buttons.suppressNoise).toBeUndefined()
    expect(data.chatCard.buttons.actionEnd.label).toBe("SR5.ActionFailure")
  })

  it("Target Device, won, is applied by whoever owns the target", async () => {
    const data = card("targetDevice", 5, 2)
    await matrixDefenseInfo(data, "guard")
    expect(data.chatCard.buttons.targetDevice.testType).toBe("nonOpposedTest")
  })

  it("Break Target Lock, won, is the hacker's button", async () => {
    const data = card("breakTargetLock", 5, 2)
    await matrixDefenseInfo(data, "drone")
    expect(data.chatCard.buttons.breakTargetLock.testType).toBe("attackerTest")
  })

  it("Confuse Pilot, won, asks the drone for its autopilot test", async () => {
    const data = card("confusePilot", 5, 2)
    await matrixDefenseInfo(data, "drone")
    expect(data.chatCard.buttons.confusePilot).toBeDefined()
  })

  it("lost, none of them is offered", async () => {
    for (const typeSub of ["targetDevice", "breakTargetLock", "confusePilot"]) {
      const data = card(typeSub, 2, 3)
      await matrixDefenseInfo(data, "drone")
      expect(data.chatCard.buttons[typeSub]).toBeUndefined()
    }
  })
})

describe("Confuse Pilot: the autopilot test carries its threshold", () => {
  const droneActor = {
    system: {
      attributes: {
        pilot: {
          augmented: {
            value: 3
          }
        }
      }
    }
  }
  const rollData = () => ({
    test: {
    }, dicePool: {
    }, threshold: {
      value: 0
    }
  })

  it("rolls Autopilot × 2 against half the net hits", () => {
    const data = autopilotUnforeseen(rollData(), droneActor, card("confusePilot", 6, 1))
    expect(data.dicePool.base).toBe(6)
    expect(data.threshold.value).toBe(3)
  })

  it("leaves the threshold to the gamemaster otherwise (SR5 p. 271)", () => {
    expect(autopilotUnforeseen(rollData(), droneActor).threshold.value).toBe(0)
  })
})
