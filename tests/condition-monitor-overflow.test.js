import {
  describe, it, expect, vi, beforeAll, beforeEach
} from "vitest"

// A condition monitor never holds more boxes than it has (SR5 p. 171, 381, 301, 305).
// The preparation resets actual.value to 0 before computing the monitors, so the old cap
// compared 0 to the maximum and never fired: a grunt showed 13/10, an air spirit 14/9, and the
// stored excess ate the next healing.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

// As resetCalculatedValues leaves it: the stored damage in base, the total back to 0
function monitor(damage = 0) {
  return {
    value: 0, base: 0, modifiers: [], actual: {
      value: 0, base: damage, modifiers: []
    }, boxes: []
  }
}

function bars(keys) {
  return Object.fromEntries(keys.map(k => [k, {
    value: 0, max: 0
  }]))
}

function actorOf(type, monitors, extra = {
}) {
  return {
    type, name: "Test",
    system: {
      attributes: {
        body: {
          augmented: {
            value: 4
          }
        },
        willpower: {
          augmented: {
            value: 4
          }
        },
      },
      specialAttributes: {
      },
      conditionMonitors: Object.fromEntries(Object.entries(monitors).map(([k, d]) => [k, monitor(d)])),
      statusBars: bars(Object.keys(monitors)),
      ...extra,
    },
  }
}

function prepared(actor) {
  SR5_CharacterUtility.updateConditionMonitors(actor)
  return actor.system.conditionMonitors
}

describe("the monitor is capped at preparation", () => {
  it("a grunt with 13 boxes stored shows 10/10", () => {
    const m = prepared(actorOf("actorGrunt", {
      condition: 13
    }))
    expect(m.condition.value).toBe(10)
    expect(m.condition.actual.value).toBe(10)
    expect(m.condition.actual.base).toBe(10)
  })

  it("a watcher with 13 boxes stored shows 10/10 on its single monitor", () => {
    const m = prepared(actorOf("actorSpirit", {
      condition: 13, physical: 0, stun: 0
    }, {
      type: "watcher"
    }))
    expect(Object.keys(m)).toEqual(["condition"])
    expect(m.condition.actual.value).toBe(10)
  })

  it("an air spirit with 14 Physical stored shows 10/10", () => {
    const m = prepared(actorOf("actorSpirit", {
      condition: 0, physical: 14, stun: 0
    }, {
      type: "air"
    }))
    expect(m.physical.actual.value).toBe(10)
    expect(m.stun.actual.value).toBe(0)
  })

  it("damage under the maximum is left untouched", () => {
    const m = prepared(actorOf("actorGrunt", {
      condition: 7
    }))
    expect(m.condition.actual.value).toBe(7)
  })

  it("a character's overflow is capped at Body and shown only once Physical is full", () => {
    let m = prepared(actorOf("actorPc", {
      physical: 10, stun: 3, overflow: 6
    }))
    expect(m.physical.actual.value).toBe(10)
    expect(m.overflow.value).toBe(4)
    expect(m.overflow.actual.value).toBe(4)
    m = prepared(actorOf("actorPc", {
      physical: 8, stun: 0, overflow: 3
    }))
    expect(m.overflow.actual.value).toBe(0)
  })
})

// toObject(false) returns the prepared data, update writes the source
function document(type, preparedSystem) {
  const actor = {
    id: "a1", type, name: "Test", effects: [],
    system: preparedSystem,
    toObject: () => JSON.parse(JSON.stringify({
      type, system: actor.system
    })),
    update: vi.fn(async () => {}),
  }
  return actor
}

function hit(value, type = "physical") {
  return {
    damage: {
      value, type, matrix: {
        value: 0
      }, element: ""
    },
    combat: {
      ammo: {
      }
    },
    threshold: {
    },
  }
}

function withLimits(system) {
  system.limits = {
    physicalLimit: {
      value: 20
    }
  }
  system.itemsProperties = {
    armor: {
      value: 0
    }
  }
  return system
}

let actor
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => actor)
  vi.spyOn(SR5_ActorHelper, "createDeadEffect").mockImplementation(async () => {})
  vi.spyOn(SR5_ActorHelper, "createKoEffect").mockImplementation(async () => {})
  vi.spyOn(SR5_ActorHelper, "createProneEffect").mockImplementation(async () => {})
})

describe("damage never stores boxes beyond the monitor", () => {
  it("13 on a grunt of 10 writes 10", async () => {
    const a = actorOf("actorGrunt", {
      condition: 0
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorGrunt", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(13))
    expect(actor.update.mock.calls[0][0]["system.conditionMonitors.condition.actual.base"]).toBe(10)
  })

  it("14P on an air spirit of 10 writes 10, Stun untouched", async () => {
    const a = actorOf("actorSpirit", {
      condition: 0, physical: 0, stun: 0
    }, {
      type: "air"
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorSpirit", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(14))
    const written = actor.update.mock.calls[0][0]
    expect(written["system.conditionMonitors.physical.actual.base"]).toBe(10)
    expect(written["system.conditionMonitors.stun.actual.base"]).toBe(0)
  })

  it("a character keeps the overflow rules: 13P on 10/4 writes 10 and 3", async () => {
    const a = actorOf("actorPc", {
      physical: 0, stun: 0, overflow: 0
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorPc", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(13))
    const written = actor.update.mock.calls[0][0]
    expect(written["system.conditionMonitors.physical.actual.base"]).toBe(10)
    expect(written["system.conditionMonitors.overflow.actual.base"]).toBe(3)
  })

  it("full Stun still carries half the excess to Physical (SR5 p. 171)", async () => {
    const a = actorOf("actorPc", {
      physical: 0, stun: 0, overflow: 0
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorPc", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(14, "stun"))
    const written = actor.update.mock.calls[0][0]
    expect(written["system.conditionMonitors.stun.actual.base"]).toBe(10)
    expect(written["system.conditionMonitors.physical.actual.base"]).toBe(2)
  })
})

describe("healing is not eaten by stored excess", () => {
  it("a watcher stored at 13 of 10, healed by 4, drops to 6", async () => {
    const a = actorOf("actorSpirit", {
      condition: 13, physical: 0, stun: 0
    }, {
      type: "watcher"
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorSpirit", a.system)
    // Foundry's deepClone keeps a document whole; the test stub would drop its methods
    vi.spyOn(foundry.utils, "deepClone").mockImplementation(x => x)
    await SR5_ActorHelper.heal("a1", {
      roll: {
        netHits: 4
      }, test: {
        typeSub: "condition"
      }
    })
    expect(actor.update.mock.calls[0][0]["system.conditionMonitors.condition.actual.base"]).toBe(6)
  })
})

describe("a full grunt is out of the fight, dead only above its Body (SR5 p. 381)", () => {
  async function hitGrunt(stored, value, type) {
    const a = actorOf("actorGrunt", {
      condition: stored
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorGrunt", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(value, type))
    return {
      dead: SR5_ActorHelper.createDeadEffect.mock.calls.length, ko: SR5_ActorHelper.createKoEffect.mock.calls.length
    }
  }

  it("filled by Stun: knocked out, alive", async () => {
    expect(await hitGrunt(0, 12, "stun")).toEqual({
      dead: 0, ko: 1
    })
  })

  it("filled by Physical below its Body: knocked out, alive", async () => {
    expect(await hitGrunt(7, 3, "physical")).toEqual({
      dead: 0, ko: 1
    })
  })

  it("filled by Physical equal to its Body: alive (the book only says below and above)", async () => {
    expect(await hitGrunt(6, 4, "physical")).toEqual({
      dead: 0, ko: 1
    })
  })

  it("filled by Physical above its Body: dead", async () => {
    expect(await hitGrunt(5, 5, "physical")).toEqual({
      dead: 1, ko: 0
    })
  })

  it("not full: neither", async () => {
    expect(await hitGrunt(0, 5, "physical")).toEqual({
      dead: 0, ko: 0
    })
  })
})

describe("a two-monitor spirit is dissipated by either monitor (SR5 p. 305)", () => {
  async function hitAir(value, type) {
    const a = actorOf("actorSpirit", {
      condition: 0, physical: 0, stun: 0
    }, {
      type: "air"
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorSpirit", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(value, type))
    return {
      dead: SR5_ActorHelper.createDeadEffect.mock.calls.length, ko: SR5_ActorHelper.createKoEffect.mock.calls.length
    }
  }

  it("full Stun: dissipated, not knocked out", async () => {
    expect(await hitAir(10, "stun")).toEqual({
      dead: 1, ko: 0
    })
  })

  it("full Physical: dissipated", async () => {
    expect(await hitAir(10, "physical")).toEqual({
      dead: 1, ko: 0
    })
  })

  it("a character with full Stun is only knocked out", async () => {
    const a = actorOf("actorPc", {
      physical: 0, stun: 0, overflow: 0
    })
    SR5_CharacterUtility.updateConditionMonitors(a)
    actor = document("actorPc", withLimits(a.system))
    await SR5_ActorHelper.takeDamage("a1", hit(10, "stun"))
    expect(SR5_ActorHelper.createKoEffect).toHaveBeenCalledTimes(1)
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
  })
})

describe("healing wakes up a character knocked out by damage", () => {
  function effect(id, origin, status) {
    return {
      id, origin, statuses: new Set([status])
    }
  }

  function knockedOut(type, monitors, dead = false) {
    const a = actorOf(type, monitors)
    SR5_CharacterUtility.updateConditionMonitors(a)
    const effects = [effect("k1", "unconscious", "unconscious"), effect("m1", null, "unconscious")]
    if (dead) effects.push(effect("d1", "dead", "dead"))
    return {
      type, system: a.system, effects,
      deleteEmbeddedDocuments: vi.fn(async () => {}),
    }
  }

  it("a dead character is left as it is (SR5 p. 209)", async () => {
    const a = knockedOut("actorPc", {
      physical: 7, stun: 0, overflow: 4
    }, true)
    await SR5_ActorHelper.clearDamageKnockout(a)
    expect(a.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it("no full monitor left: removes the damage knockout only, never the GM's", async () => {
    const a = knockedOut("actorPc", {
      physical: 8, stun: 9, overflow: 0
    })
    await SR5_ActorHelper.clearDamageKnockout(a)
    expect(a.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["k1"])
  })

  it("Stun still full: stays knocked out", async () => {
    const a = knockedOut("actorPc", {
      physical: 2, stun: 10, overflow: 0
    })
    await SR5_ActorHelper.clearDamageKnockout(a)
    expect(a.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it("a grunt healed under its maximum comes back", async () => {
    const a = knockedOut("actorGrunt", {
      condition: 9
    })
    await SR5_ActorHelper.clearDamageKnockout(a)
    expect(a.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["k1"])
  })

  it("a grunt still full stays out", async () => {
    const a = knockedOut("actorGrunt", {
      condition: 10
    })
    await SR5_ActorHelper.clearDamageKnockout(a)
    expect(a.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
