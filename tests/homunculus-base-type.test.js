import {
  describe, it, expect, beforeAll, afterEach, vi
} from "vitest"

// SR5 p. 301: a homunculus sprints x2/x4/+1 and is always physical; watchers and homunculi deal
// 1 astral damage (SR5 p. 318). Custom spirit types based on them follow the same rules.

import {
  SR5
} from "../modules/config.js"
import {
  SR5_SpiritTypes
} from "../modules/entities/items/spirit-types.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

afterEach(() => {
  SR5_SpiritTypes.registry.clear()
  vi.restoreAllMocks()
})

const value = (base = 0) => ({
  base, value: base, modifiers: []
})
// Any pool or value the preparation reads, built on first access
const pools = () => new Proxy({
}, {
  get: (target, key) => (target[key] ??= {
    ...value(), dicePool: 0, max: 0, linkedAttribute: ""
  })
})
const attribute = (n) => ({
  natural: value(n), augmented: value(n)
})

function spirit(type, force = 6) {
  const attributes = {
  }
  for (const key of ["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma"]) attributes[key] = attribute(3)
  const movements = {
  }
  for (const key of Object.keys(SR5.movements)) movements[key] = {
    movement: value(), extraMovement: value(), test: value(), maximum: value(), limit: value(), multiplier: value(key === "walk" ? 2 : 4)
  }
  return {
    type: "actorSpirit",
    system: {
      type,
      force: value(force),
      attributes,
      specialAttributes: {
        magic: attribute(force)
      },
      skills: new Proxy({
      }, {
        get: (target, key) => (target[key] ??= {
          rating: value()
        })
      }),
      movements,
      magic: Object.assign(pools(), {
        magicType: "spirit", initiationGrade: 0, metamagics: pools(), boundedSpirit: {
          max: 0
        }
      }),
      isMaterializing: false,
    }
  }
}

function custom(key, basedOn) {
  SR5_SpiritTypes.registry.set(key, {
    name: `Custom ${basedOn}`, system: {
      basedOn
    }
  })
}

function sprint(actor) {
  vi.spyOn(SR5_CharacterUtility, "applyPenalty").mockImplementation(() => {})
  SR5_CharacterUtility.updateMovements(actor)
  return actor.system.movements.run.extraMovement.value
}

function astralDamage(actor) {
  vi.spyOn(SR5_CharacterUtility, "applyPenalty").mockImplementation(() => {})
  SR5_CharacterUtility.updateAstralValues(actor)
  return actor.system.magic.astralDamage.value
}

describe("homunculus sprint (SR5 p. 301: x2/x4/+1)", () => {
  it("gains 1 m per hit, other spirits 2", () => {
    expect(sprint(spirit("homunculus"))).toBe(1)
    expect(sprint(spirit("air"))).toBe(2)
  })

  it("a custom type based on a homunculus sprints like one", () => {
    custom("clayServant", "homunculus")
    expect(sprint(spirit("clayServant"))).toBe(1)
  })
})

describe("custom types based on a homunculus or a watcher", () => {
  it("a homunculus-based type is always materialized", () => {
    custom("clayServant", "homunculus")
    const actor = spirit("clayServant")
    SR5_CharacterUtility.updateSpiritValues(actor)
    expect(actor.system.isMaterializing).toBe(true)
  })

  it("a fire-based type is left as it is", () => {
    custom("ember", "fire")
    const actor = spirit("ember")
    SR5_CharacterUtility.updateSpiritValues(actor)
    expect(actor.system.isMaterializing).toBe(false)
  })

  it("watchers and homunculi deal 1 astral damage, custom ones included (SR5 p. 318)", () => {
    custom("clayServant", "homunculus")
    custom("sentry", "watcher")
    expect(astralDamage(spirit("homunculus"))).toBe(1)
    expect(astralDamage(spirit("clayServant"))).toBe(1)
    expect(astralDamage(spirit("sentry"))).toBe(1)
  })

  it("other spirits deal their Force", () => {
    custom("ember", "fire")
    expect(astralDamage(spirit("air", 5))).toBe(5)
    expect(astralDamage(spirit("ember", 4))).toBe(4)
  })
})
