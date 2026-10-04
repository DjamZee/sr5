import {
  describe, it, expect
} from 'vitest'

const {
  isPickable, pickableItems, randomPick, perceptionModifiers, pickpocketOutcome, transferEnds, isTransferAllowed, isLockedAway, splitPile, defaultTakeQuantity
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

  it('reads the worked-out value, not the base: a modifier down to 0 counts', () => {
    expect(isPickable(item("itemGear", {
      concealment: {
        base: 6, value: 0
      }
    }))).toBe(true)
    expect(isPickable(item("itemDevice", {
      concealment: {
        base: 0, value: 6
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

describe('a pile is split (arbitrage de DjamZ, 2026-10-05)', () => {
  const pile = (n, name = "Balles", type = "itemAmmunition") => ({
    type, name, system: {
      quantity: n
    }
  })
  it('takes one from a pile by default, the whole object otherwise', () => {
    expect(defaultTakeQuantity(pile(20))).toBe(1)
    expect(defaultTakeQuantity(item("itemDevice"))).toBe(1)
    expect(splitPile(pile(20), null)).toEqual({
      quantity: 1, leftOnGiver: 19, mergeInto: null
    })
  })
  it('takes what the GM chose, within the pile', () => {
    expect(splitPile(pile(20), 5).quantity).toBe(5)
    expect(splitPile(pile(20), 50)).toMatchObject({
      quantity: 20, leftOnGiver: 0
    })
    expect(splitPile(pile(20), 0).quantity).toBe(1)
  })
  it('merges into an identical pile of the receiver, not one put away', () => {
    const mine = pile(3)
    expect(splitPile(pile(20), 5, [pile(3, "Autre"), mine]).mergeInto).toBe(mine)
    expect(splitPile(pile(20), 5, [{
      ...pile(3), system: {
        quantity: 3, storedIn: "bag"
      }
    }]).mergeInto).toBeNull()
    expect(splitPile(pile(20), 5, [pile(3, "Balles", "itemGear")]).mergeInto).toBeNull()
  })
})

describe('only an identical pile swallows what is taken (review of Jade)', () => {
  const credstick = balance => ({
    type: "itemGear", name: "Créditube", system: {
      quantity: 1, value: balance, concealment: {
        base: -4
      }
    }
  })
  it('a namesake credstick with another balance stays apart', () => {
    expect(splitPile(credstick(500), null, [credstick(20)]).mergeInto).toBeNull()
  })
  it('identical bullets merge, whatever their count, place or key order', () => {
    const taken = {
      type: "itemAmmunition", name: "Balles", system: {
        quantity: 20, class: "regular", damage: 0
      }
    }
    const mine = {
      type: "itemAmmunition", name: "Balles", system: {
        damage: 0, quantity: 3, class: "regular", isActive: true
      }
    }
    expect(splitPile(taken, 5, [mine]).mergeInto).toBe(mine)
    expect(splitPile(taken, 5, [{
      ...mine, system: {
        ...mine.system, class: "explosive"
      }
    }]).mergeInto).toBeNull()
  })
})
