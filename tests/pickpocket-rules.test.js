import {
  describe, it, expect
} from 'vitest'

const {
  isPickable, pickableItems, randomPick, perceptionModifiers, pickpocketOutcome, transferEnds, isTransferAllowed
} = await import('../modules/rolls/roll-helpers/pickpocket-rules.js')

const item = (type, system = {
}) => ({
  type, system
})
const conceal = v => ({
  concealment: {
    value: v
  }
})

describe('what can be lifted from a pocket (SR5 p. 135, 422)', () => {
  it('takes small gear, not a vehicle, a worn armor, a ready weapon or an implant', () => {
    expect(isPickable(item("itemGear", conceal(-4)))).toBe(true)
    expect(isPickable(item("itemVehicle"))).toBe(false)
    expect(isPickable(item("itemArmor", {
      isActive: true
    }))).toBe(false)
    expect(isPickable(item("itemWeapon", {
      isActive: true, ...conceal(-2)
    }))).toBe(false)
    expect(isPickable(item("itemWeapon", {
      isActive: false, ...conceal(-2)
    }))).toBe(true)
    expect(isPickable(item("itemAugmentation", {
      isActive: true
    }))).toBe(false)
    expect(isPickable(item("itemSpell"))).toBe(false)
    expect(isPickable(item("itemGear", {
      isIntangible: true
    }))).toBe(false)
  })

  it('leaves objects bigger than +2 out, unless the GM passes over', () => {
    expect(isPickable(item("itemGear", conceal(2)))).toBe(true)
    expect(isPickable(item("itemGear", conceal(4)))).toBe(false)
    expect(isPickable(item("itemGear", conceal(4)), {
      allowLarge: true
    })).toBe(true)
  })

  it('draws one at random', () => {
    const list = pickableItems({
      items: [item("itemGear"), item("itemSpell"), item("itemDrug")]
    })
    expect(list).toHaveLength(2)
    expect(randomPick(list, 0)).toBe(list[0])
    expect(randomPick(list, 0.99)).toBe(list[1])
    expect(randomPick([], 0.5)).toBeNull()
  })
})

describe('the observer pool (SR5 p. 139, 422)', () => {
  it('adds the concealability and the ticked situations', () => {
    expect(perceptionModifiers(-4, ["distracted", "attentive", "diversion", "unknown"])).toEqual([
      {
        type: "concealment", value: -4
      }, {
        type: "distracted", value: -2
      }, {
        type: "attentive", value: 3
      }, {
        type: "diversion", value: -2
      },
    ])
    expect(perceptionModifiers(0)).toEqual([])
  })
})

describe('how the pocket ends', () => {
  it('a tie is noticed (SR5 p. 422)', () => {
    expect(pickpocketOutcome({
      thiefHits: 2, perceptionHits: 2
    })).toBe("noticed")
    expect(pickpocketOutcome({
      thiefHits: 0, perceptionHits: 0
    })).toBe("noticed")
    expect(pickpocketOutcome({
      thiefHits: 3, perceptionHits: 2
    })).toBe("taken")
  })
  it('a glitch takes it but is felt, a critical glitch is caught', () => {
    expect(pickpocketOutcome({
      thiefHits: 3, perceptionHits: 1, glitch: true
    })).toBe("felt")
    expect(pickpocketOutcome({
      thiefHits: 0, perceptionHits: 0, criticalGlitch: true
    })).toBe("caught")
  })
  it('plant goes the other way (second batch)', () => {
    expect(transferEnds("take", "T", "V")).toEqual({
      from: "V", to: "T"
    })
    expect(transferEnds("plant", "T", "V")).toEqual({
      from: "T", to: "V"
    })
  })
})

describe('the GM reads the cards again before moving anything', () => {
  const thiefCard = {
    test: {
      type: "pickpocket"
    }, owner: {
      actorId: "thief"
    }, target: {
      actorId: "victim"
    }, roll: {
      hits: 3
    }
  }
  const perceptionCard = {
    test: {
      type: "pickpocketPerception"
    }, owner: {
      actorId: "victim"
    }, previousMessage: {
      messageId: "m1", actorId: "thief"
    }, various: {
    }, roll: {
      hits: 1
    }
  }
  const ok = {
    thiefCard, thiefMessageId: "m1", perceptionCard, authorOwnsThief: true,
    item: item("itemGear", conceal(-4)), itemOnGiver: true, inReach: true,
  }
  it('allows a won pocket', () => {
    expect(isTransferAllowed(ok)).toBe(true)
  })
  it('refuses a forged or stale request', () => {
    expect(isTransferAllowed({
      ...ok, authorOwnsThief: false
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, inReach: false
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, itemOnGiver: false
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, thiefMessageId: "other"
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, perceptionCard: null
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, perceptionCard: {
        ...perceptionCard, various: {
          pickpocketDone: true
        }
      }
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, perceptionCard: {
        ...perceptionCard, owner: {
          actorId: "someoneElse"
        }
      }
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, perceptionCard: {
        ...perceptionCard, previousMessage: {
          messageId: "m1", actorId: "intruder"
        }
      }
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, thiefCard: {
        ...thiefCard, test: {
          type: "attack"
        }
      }
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, item: item("itemSpell")
    })).toBe(false)
  })
  it('refuses a lost or caught pocket', () => {
    expect(isTransferAllowed({
      ...ok, perceptionCard: {
        ...perceptionCard, roll: {
          hits: 3
        }
      }
    })).toBe(false)
    expect(isTransferAllowed({
      ...ok, thiefCard: {
        ...thiefCard, roll: {
          hits: 0, criticalGlitchRoll: true
        }
      }
    })).toBe(false)
  })
})
