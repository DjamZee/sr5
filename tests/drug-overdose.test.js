import {
  describe, it, expect, beforeEach
} from 'vitest'

import {
  overdoseOf, drugResistance
} from '../modules/entities/items/drug-damage.js'

beforeEach(() => {
  globalThis.game.i18n = {
    localize: k => k, format: k => k
  }
})

// A drug of the actor: its key, its addiction rating, the targets of its rise, its phase
const drug = (id, key, rating, targets = [], {
  active = false, crash = false, name = key, quality = "standard", crashTargets = []
} = {
}) => ({
  id, _id: id, name, type: "itemDrug",
  system: {
    quality, isActive: active, wirelessTurnedOn: crash,
    addiction: {
      rating
    },
    systemEffects: {
      0: {
        category: "drug", value: key
      }
    },
    customEffects: [...targets.map(target => ({
      target, value: 1, phase: "rise"
    })), ...crashTargets.map(target => ({
      target, value: -1, phase: "crash"
    }))],
    handleShot: {
      durationContrecoup: crash ? 3 : 0
    },
  },
})
const REA = "system.attributes.reaction.augmented", INT = "system.attributes.intuition.augmented"

const actor = (items) => {
  const list = [...items]
  list.get = id => list.find(i => i.id === id)
  return {
    items: list,
    system: {
      attributes: {
        body: {
          augmented: {
            value: 4
          }
        }, willpower: {
          augmented: {
            value: 3
          }
        }
      }
    }
  }
}

// SR5 p. 417, Faire une surdose
describe("overdose", () => {
  it("the same drug taken under its own effect: its addiction rating counted twice", () => {
    const jazz1 = drug("j1", "jazz", 8, [REA], {
      active: true
    }), jazz2 = drug("j2", "jazz", 8, [REA])
    expect(overdoseOf(jazz2, actor([jazz1, jazz2]))).toMatchObject({
      value: 16, type: "stun", resist: "bodyWill", phase: "overdose", itemId: "j2"
    })
  })
  it("another drug with a common effect (Cram and Novacoke on Reaction): the sum of the ratings", () => {
    const cram = drug("c", "cram", 4, [REA], {
      active: true
    }), nova = drug("n", "novacoke", 7, [REA, INT])
    expect(overdoseOf(nova, actor([cram, nova])).value).toBe(11)
  })
  it("no overdose: a drug without common effect, a drug no longer taken, a drug alone", () => {
    const deepweed = drug("d", "deepweed", 3, [INT], {
      active: true
    }), cram = drug("c", "cram", 4, [REA]), old = drug("o", "jazz", 8, [REA])
    expect(overdoseOf(cram, actor([deepweed, cram, old]))).toBeNull()
    expect(overdoseOf(cram, actor([cram]))).toBeNull()
  })
  it("a crash effect does not count as a common effect", () => {
    const jazz = drug("j", "jazz", 8, [INT], {
      active: true, crashTargets: [REA]
    }), cram = drug("c", "cram", 4, [REA])
    expect(overdoseOf(cram, actor([jazz, cram]))).toBeNull()
  })
  it("a drug in its crash is still counted, as the interaction reads it; Long Haul in its crash has its own rule", () => {
    const jazz = drug("j", "jazz", 8, [REA], {
      crash: true
    }), cram = drug("c", "cram", 4, [REA])
    expect(overdoseOf(cram, actor([jazz, cram])).value).toBe(12)
    const lh1 = drug("l1", "longHaul", 5, [], {
      crash: true
    }), lh2 = drug("l2", "longHaul", 5)
    expect(overdoseOf(lh2, actor([lh1, lh2]))).toBeNull()
  })
  it("each drug once: two Jazz under effect, then Cram, 8 + 4", () => {
    const j1 = drug("j1", "jazz", 8, [REA], {
      active: true
    }), j2 = drug("j2", "jazz", 8, [REA], {
      active: true
    }), cram = drug("c", "cram", 4, [REA])
    expect(overdoseOf(cram, actor([j1, j2, cram])).value).toBe(12)
  })
})

const rollData = () => ({
  damage: {
  }, combat: {
  }, test: {
  }, dicePool: {
    modifiers: []
  }
})
const card = (itemId, value = 1) => ({
  owner: {
    messageId: ''
  }, damage: {
    value, type: 'stun', resistanceType: 'drugDamage', drug: {
      itemId, phase: "overdose"
    }
  }
})

describe("the resistance card of an overdose", () => {
  it("reads the DV again off the drugs, whatever the card says, Body + Willpower", () => {
    const jazz1 = drug("j1", "jazz", 8, [REA], {
      active: true
    }), jazz2 = drug("j2", "jazz", 8, [REA], {
      active: true
    })
    const data = drugResistance(rollData(), actor([jazz1, jazz2]), card("j2", 1))
    expect(data.damage.base).toBe(16)
    expect(data.damage.type).toBe("stun")
    expect(data.dicePool.base).toBe(7)
    expect(data.dicePool.composition.map(c => c.source)).toEqual(["SR5.Body", "SR5.Willpower"])
  })
  it("is still read when the drug taken is over already (Cram after an interaction 7-9)", () => {
    const jazz = drug("j", "jazz", 8, [REA], {
      crash: true
    }), cram = drug("c", "cram", 4, [REA])
    expect(drugResistance(rollData(), actor([jazz, cram]), card("c", 1)).damage.base).toBe(12)
  })
  it("is refused when nothing is redundant any more", () => {
    const alone = drug("a", "jazz", 8, [REA], {
      active: true
    })
    expect(drugResistance(rollData(), actor([alone]), card("a", 16))).toBeUndefined()
  })
})
