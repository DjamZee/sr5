import {
  describe, it, expect, beforeAll, vi
} from "vitest"

// SR5 p. 301 (VO p. 298): homunculus CON * (Structure of its material), AGI F-2, REA F-2, STR F,
// WIL 1, LOG 1, INT 1, CHA 3 in the VF, Initiative (F + 1) + 1D6, single condition monitor (grunt rule, p. 381).

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

const value = () => ({
  base: 0, value: 0, modifiers: []
})
const attribute = () => ({
  natural: value(), augmented: value()
})

function homunculus(force) {
  const attributes = {
  }
  for (const key of ["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma"]) attributes[key] = attribute()
  return {
    type: "actorSpirit",
    system: {
      type: "homunculus",
      force: {
        base: force, value: force, modifiers: []
      },
      attributes,
      specialAttributes: {
        magic: attribute()
      },
      essence: value(),
      initiatives: {
        physicalInit: {
          ...value(), dice: value()
        }
      },
      penalties: {
      },
    }
  }
}

function prepared(force) {
  const actor = homunculus(force)
  SR5_CharacterUtility.updateSpiritAttributes(actor)
  for (const attr of Object.values(actor.system.attributes)) {
    SR5_EntityHelpers.updateValue(attr.natural, 0)
    attr.augmented.base = attr.natural.value
    SR5_EntityHelpers.updateValue(attr.augmented, 0)
  }
  return actor
}

describe("homunculus stat block (SR5 p. 301)", () => {
  it("has WIL, LOG and INT 1 and CHA 3 whatever its Force", () => {
    const attributes = prepared(6).system.attributes
    expect(attributes.agility.natural.value).toBe(4)
    expect(attributes.reaction.natural.value).toBe(4)
    expect(attributes.strength.natural.value).toBe(6)
    expect(attributes.willpower.natural.value).toBe(1)
    expect(attributes.logic.natural.value).toBe(1)
    expect(attributes.intuition.natural.value).toBe(1)
    expect(attributes.charisma.natural.value).toBe(3)
  })

  it("rolls (F + 1) + 1D6 for Initiative", () => {
    const actor = prepared(6)
    actor.system.conditionMonitors = {
    }
    vi.spyOn(SR5_CharacterUtility, "applyPenalty").mockImplementation(() => {})
    SR5_CharacterUtility.updateInitiativePhysical(actor)
    expect(actor.system.initiatives.physicalInit.value).toBe(7)
    expect(actor.system.initiatives.physicalInit.dice.value).toBe(1)
  })
})
