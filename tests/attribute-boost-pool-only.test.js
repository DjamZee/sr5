import {
  describe, it, expect
} from 'vitest'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  limitAttributeValue
} from '../modules/entities/actors/poolOnlyAttribute.js'
import {
  spellResistanceAttributes
} from '../modules/rolls/roll-prepare-case/rollData-SpellResistance.js'

//Attribute Boost (SR5 p. 312): "only affects dice pools, the Physical limit and the Initiative attribute do not change"
const attribute = (natural, modifiers = []) => {
  const value = natural + modifiers.reduce((s, m) => s + m.value, 0)
  return {
    natural: {
      value: natural
    }, augmented: {
      base: natural, value, modifiers
    }
  }
}
const boost = value => ({
  source: "Augmentation d'attribut (Force)", type: "itemAdeptPower", value, poolOnly: true
})

describe("limitAttributeValue", () => {
  it("leaves out the Attribute Boost", () => {
    expect(limitAttributeValue(attribute(4, [boost(3)]))).toBe(4)
  })
  it("keeps every other augmentation", () => {
    expect(limitAttributeValue(attribute(4, [{
      source: "Muscles", type: "itemAugmentation", value: 2
    }, boost(1)]))).toBe(6)
  })
  it("never goes above the capped rating", () => {
    const capped = attribute(4, [{
      source: "Muscles", type: "itemAugmentation", value: 4
    }, boost(2), {
      source: "cap", type: "augmentationCap", value: -2
    }])
    expect(capped.augmented.value).toBe(8)
    expect(limitAttributeValue(capped)).toBe(8)
  })
  it("is the plain rating without a boost", () => {
    expect(limitAttributeValue(attribute(5))).toBe(5)
  })
})

describe("Physical limit with an Attribute Boost (SR5 p. 312)", () => {
  const actorWith = strengthMods => ({
    type: "actorPc", items: [], system: {
      essence: {
        value: 6
      },
      attributes: {
        strength: attribute(4, strengthMods), body: attribute(4), reaction: attribute(4),
        logic: attribute(3), intuition: attribute(3), willpower: attribute(3), charisma: attribute(3),
      },
      limits: {
        physicalLimit: {
          base: 0, value: 0, modifiers: []
        }
      },
      matrix: {
      },
    }
  })
  it("does not move with the boost", () => {
    const boosted = actorWith([boost(3)])
    const plain = actorWith()
    SR5_CharacterUtility.updateLimits(boosted)
    SR5_CharacterUtility.updateLimits(plain)
    //ceil((4 x 2 + 4 + 4) / 3) = 6, and the boosted Strength 7 would give ceil(22 / 3) = 8
    expect(plain.system.limits.physicalLimit.value).toBe(6)
    expect(boosted.system.limits.physicalLimit.value).toBe(6)
  })
  it("still moves with an ordinary augmentation (counter-proof)", () => {
    const augmented = actorWith([{
      source: "Muscles", type: "itemAugmentation", value: 3
    }])
    SR5_CharacterUtility.updateLimits(augmented)
    expect(augmented.system.limits.physicalLimit.value).toBe(8)
  })
})

describe("applyCustomEffects marks the boost", () => {
  it("poolOnly effect leaves a marked modifier", () => {
    const actor = {
      type: "actorPc", system: {
        attributes: {
          strength: attribute(4)
        }
      }
    }
    const item = {
      name: "Augmentation d'attribut (Force)", type: "itemEffect", system: {
        type: "itemAdeptPower", customEffects: {
          0: {
            category: "characterAttributes", target: "system.attributes.strength.augmented", type: "value", value: 2, forceAdd: true, poolOnly: true
          }
        }
      }
    }
    SR5_CharacterUtility.applyCustomEffects(item, actor)
    const mods = actor.system.attributes.strength.augmented.modifiers
    expect(mods).toHaveLength(1)
    expect(mods[0]).toMatchObject({
      value: 2, poolOnly: true
    })
  })
})

describe("spellResistanceAttributes", () => {
  it("one attribute: Decrease Reflexes is resisted with Reaction (GRI p. 109)", () => {
    expect(spellResistanceAttributes({
      defenseFirstAttribute: "reaction", defenseSecondAttribute: ""
    })).toEqual(["reaction"])
  })
  it("two attributes as before: physical Manipulation, Strength + Body (SR5 p. 295)", () => {
    expect(spellResistanceAttributes({
      defenseFirstAttribute: "strength", defenseSecondAttribute: "body"
    })).toEqual(["strength", "body"])
  })
})
