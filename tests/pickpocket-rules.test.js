import {
  describe, it, expect
} from 'vitest'

const {
  isPickable, pickableItems, randomPick, perceptionModifiers, pickpocketOutcome, transferEnds, isTransferAllowed, isLockedAway
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

  it('reads the base when the value was never worked out (gear)', () => {
    expect(isPickable(item("itemGear", {
      concealment: {
        base: 6, value: 0
      }
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
    },
    roll: {
      hits: 3
    }, various: {
      pickpocketAnswerId: "a1"
    },
  }
  //The GM's card froze the thief's hits (3) and glitch on the first click
  const perceptionCard = {
    test: {
      type: "pickpocketPerception"
    }, owner: {
      actorId: "victim"
    },
    previousMessage: {
      messageId: "m1", actorId: "thief", hits: 3
    },
    various: {
      pickpocketAnswerId: "a1", pickpocketThiefGlitch: false, pickpocketThiefCriticalGlitch: false
    },
    roll: {
      hits: 1
    },
  }
  const ok = {
    thiefCard, thiefMessageId: "m1", perceptionCard, authorOwnsThief: true,
    item: item("itemGear", conceal(-4)), itemOnGiver: true, inReach: true,
  }
  const perception = various => ({
    ...ok, perceptionCard: {
      ...perceptionCard, ...various
    }
  })

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
    expect(isTransferAllowed(perception({
      owner: {
        actorId: "someoneElse"
      }
    }))).toBe(false)
    expect(isTransferAllowed(perception({
      previousMessage: {
        messageId: "m1", actorId: "intruder", hits: 3
      }
    }))).toBe(false)
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
  it('one thief card, one Perception, one object (replay)', () => {
    //A second Perception on the same thief card carries another answer id
    expect(isTransferAllowed(perception({
      various: {
        ...perceptionCard.various, pickpocketAnswerId: "a2"
      }
    }))).toBe(false)
    expect(isTransferAllowed(perception({
      various: {
        ...perceptionCard.various, pickpocketAnswerId: undefined
      }
    }))).toBe(false)
    expect(isTransferAllowed(perception({
      various: {
        ...perceptionCard.various, pickpocketDone: true
      }
    }))).toBe(false)
    expect(isTransferAllowed({
      ...ok, thiefCard: {
        ...thiefCard, various: {
          pickpocketAnswerId: "a1", pickpocketDone: true
        }
      }
    })).toBe(false)
  })
  it('reads the hits the GM froze, not the thief card touched up afterwards', () => {
    expect(isTransferAllowed({
      ...ok, thiefCard: {
        ...thiefCard, roll: {
          hits: 0
        }
      }
    })).toBe(true)
    expect(isTransferAllowed({
      ...ok, thiefCard: {
        ...thiefCard, roll: {
          hits: 9
        }
      }, perceptionCard: {
        ...perceptionCard, previousMessage: {
          ...perceptionCard.previousMessage, hits: 1
        }
      }
    })).toBe(false)
  })
  it('refuses a lost or caught pocket', () => {
    expect(isTransferAllowed(perception({
      roll: {
        hits: 3
      }
    }))).toBe(false)
    expect(isTransferAllowed(perception({
      various: {
        ...perceptionCard.various, pickpocketThiefCriticalGlitch: true
      }
    }))).toBe(false)
  })
})

describe('a locked container keeps its content out of reach', () => {
  const owned = (storageSystem, storedIn = "bag") => {
    const bag = {
      id: "bag", type: "itemStorage", system: storageSystem
    }
    const thing = {
      type: "itemGear", system: {
        storedIn, ...conceal(-4)
      }
    }
    thing.parent = {
      items: {
        get: id => (id === "bag" ? bag : undefined)
      }
    }
    return thing
  }
  it('a locked bag protects it', () => {
    expect(isLockedAway(owned({
      lock: {
        type: "maglock", locked: true
      }
    }))).toBe(true)
    expect(isPickable(owned({
      lock: {
        type: "mechanical", locked: true
      }
    }))).toBe(false)
  })
  it('an open bag, a bag without a lock, or no lock fields yet: the GM judges', () => {
    expect(isPickable(owned({
      lock: {
        type: "maglock", locked: false
      }
    }))).toBe(true)
    expect(isPickable(owned({
      lock: {
        type: "", locked: true
      }
    }))).toBe(true)
    expect(isPickable(owned({
    }))).toBe(true)
    expect(isPickable(owned({
      lock: {
        type: "maglock", locked: true
      }
    }, "")))
      .toBe(true)
  })
})
