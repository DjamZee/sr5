import {
  describe, it, expect, vi, beforeAll, afterEach
} from "vitest"

// Every modifiers array is computed (migration-source-modifiers.js). Some were never reset at preparation:
// the fatigue and fall resistances, the capacity taken, the points of a lifestyle, and a focus that the
// actor does not prepare again. They grew at each preparation (in game: fall 4 -> 8 modifiers after one
// more prepareData). And the fall resistance took the worn armor twice: Body + Armor (SR5 p. 174).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5Item
} from "../modules/entities/items/entityItem.js"
import {
  SR5Actor
} from "../modules/entities/actors/entityActor.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  emptyPreparedModifiers, cleanCreatedSource
} from "../modules/migration-source-modifiers.js"

Object.getPrototypeOf(SR5Item.prototype).prepareData ??= () => {}

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})
afterEach(() => vi.restoreAllMocks())

const mod = (source, value = 1, type = "linkedAttribute") => ({
  source, type, value, isMultiplier: false
})
const pool = (modifiers = []) => ({
  base: 0, value: 0, dicePool: 0, modifiers
})

describe("a preparation starts from empty modifiers", () => {
  it("empties every modifiers array of the prepared system, and nothing else", () => {
    const system = {
      resistances: {
        fatigue: pool([mod("Body"), mod("Body")]), fall: pool([mod("Veste", 12)])
      },
      attributes: {
        body: {
          natural: {
            base: 4, value: 4, modifiers: [mod("Métatype")]
          }
        }
      },
      conditionMonitors: {
        physical: {
          actual: {
            base: 3, modifiers: [mod("x")]
          }, boxes: [{
            modifiers: [mod("kept")]
          }]
        }
      },
      vehicleOwner: {
        system: {
          skills: {
            pilotAircraft: {
              test: pool([mod("Reaction", 5)])
            }
          }
        }
      },
      creatorData: {
        system: {
          magic: {
            drainResistance: pool([mod("Willpower", 6)])
          }
        }
      },
      lists: {
        modifiers: [1]
      },
    }
    emptyPreparedModifiers(system)
    expect(system.resistances.fatigue.modifiers).toEqual([])
    expect(system.resistances.fall.modifiers).toEqual([])
    expect(system.attributes.body.natural.modifiers).toEqual([])
    expect(system.conditionMonitors.physical.actual.modifiers).toEqual([])
    expect(system.attributes.body.natural.base).toBe(4)
    expect(system.conditionMonitors.physical.actual.base).toBe(3)
    // Not entered: arrays, the prepared actor copies, the translation lists
    expect(system.conditionMonitors.physical.boxes[0].modifiers).toHaveLength(1)
    expect(system.vehicleOwner.system.skills.pilotAircraft.test.modifiers).toHaveLength(1)
    expect(system.creatorData.system.magic.drainResistance.modifiers).toHaveLength(1)
    expect(system.lists.modifiers).toEqual([1])
  })

  it("fatigue and fall no longer grow from one preparation to the next", () => {
    const actor = {
      // A type whose attributes the reset leaves alone, so that only what is measured is needed
      type: "actorDevice", name: "Kim", system: {
        initiatives: {
          matrixInit: {
            ...pool(), isActive: true
          }
        },
        attributes: {
          body: {
            augmented: {
              value: 4
            }
          }, willpower: {
            augmented: {
              value: 5
            }
          }, logic: {
            augmented: {
              value: 3
            }
          }
        },
        resistances: {
          fatigue: pool(Array.from({
            length: 52
          }, () => mod("SR5.Body", 4))), fall: pool([mod("Veste", 12), mod("Veste", 12)]),
        },
      }
    }
    const prepare = () => {
      delete actor.system.itemsProperties
      SR5_CharacterUtility.resetCalculatedValues(actor)
      // As the items and updateArmor leave it: a vest and Mystic Armor
      actor.system.itemsProperties = {
        armor: pool([mod("Veste pare-balles", 12, "armor"), mod("Armure mystique", 2, "itemAdeptPower")])
      }
      SR5_CharacterUtility.updateResistances(actor)
    }
    prepare()
    prepare()
    expect(actor.system.resistances.fatigue.dicePool).toBe(9)
    expect(actor.system.resistances.fatigue.modifiers).toHaveLength(2)
    // Body 4 + Armor 14 (SR5 p. 174)
    expect(actor.system.resistances.fall.dicePool).toBe(18)
  })
})

describe("the fall resistance takes the armor once (SR5 p. 174)", () => {
  it("a worn armor reaches the armor, not the fall resistance directly", () => {
    for (const name of ["_handleItemCapacity", "_handleItemPrice", "_handleItemAvailability", "_handleItemConcealment", "_handleArmorValue"]) {
      vi.spyOn(SR5_UtilityItem, name).mockImplementation(() => {})
    }
    const fall = pool()
    const armor = {
      ...pool(), specialDamage: {
      }, toxin: {
      }
    }
    const vest = {
      type: "itemArmor", name: "Veste pare-balles", uuid: "vest", prepareData: vi.fn(), system: {
        isActive: true, isAccessory: false, isCumulative: false, armorValue: {
          value: 12
        }, customEffects: {
        }, accessory: [], isSlavedToPan: true
      }
    }
    const actor = Object.create(SR5Actor.prototype)
    Object.defineProperty(actor, "type", {
      value: "actorPc"
    })
    Object.defineProperty(actor, "items", {
      value: [vest]
    })
    Object.defineProperty(actor, "system", {
      value: {
        resistances: {
          fall
        }, itemsProperties: {
          armor
        }, matrix: {
          connectedObject: {
            armors: {
            }
          }, potentialPanObject: {
            armors: {
            }
          }
        }, magic: {
        }, skills: {
        }
      }
    })
    try {
      actor.prepareEmbeddedDocuments()
    } catch {
      // What follows the item loop reads more of the actor: the loop is what is measured
    }
    expect(armor.modifiers.map(m => m.value)).toEqual([12])
    expect(fall.modifiers).toEqual([])
  })
})

describe("the items' computed modifiers that were not reset", () => {
  it("capacity taken and lifestyle points start empty", () => {
    const armor = {
      type: "itemArmor", isOwned: true, system: {
        capacityTaken: pool([mod("Multiplicateur", 4, "multiplier")]), armorValue: pool(), price: pool([mod("x")])
      }
    }
    SR5_UtilityItem._resetItemModifiers(armor)
    expect(armor.system.capacityTaken.modifiers).toEqual([])
    const lifestyle = {
      type: "itemLifestyle", isOwned: true, system: {
        point: pool([mod("Obscur", 1), mod("Obscur", 1)]), price: pool()
      }
    }
    SR5_UtilityItem._resetItemModifiers(lifestyle)
    expect(lifestyle.system.point.modifiers).toEqual([])
  })

  it("a focus held by an actor is reset before its price is computed again", () => {
    const reset = vi.spyOn(SR5_UtilityItem, "_resetItemModifiers")
    const handle = vi.spyOn(SR5_UtilityItem, "_handleFocus").mockImplementation(() => {})
    vi.spyOn(SR5_CharacterUtility, "applyFocusBonus").mockImplementation(() => {})
    const focus = {
      type: "itemFocus", name: "Focus de pouvoir", uuid: "focus", system: {
        isActive: false, type: "power", price: pool([mod("Indice", 2, "multiplier"), mod("Indice", 2, "multiplier")]), availability: pool()
      }
    }
    const actor = Object.create(SR5Actor.prototype)
    Object.defineProperty(actor, "type", {
      value: "actorPc"
    })
    Object.defineProperty(actor, "items", {
      value: [focus]
    })
    Object.defineProperty(actor, "system", {
      value: {
        magic: {
        }, skills: {
        }, matrix: {
        }
      }
    })
    try {
      actor.prepareEmbeddedDocuments()
    } catch {
      // Only the focus branch is measured
    }
    expect(reset).toHaveBeenCalledWith(focus)
    expect(handle).toHaveBeenCalled()
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(handle.mock.invocationCallOrder[0])
    expect(focus.system.price.modifiers).toEqual([])
  })
})

describe("an actor or item imported prepared arrives clean", () => {
  const doc = (source) => ({
    _source: source, updateSource: vi.fn(function (changes) {
      for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(this._source, path, value)
    })
  })

  it("empties the actor's and its items' computed modifiers before the creation", () => {
    const actor = doc({
      system: {
        resistances: {
          fall: pool([mod("Body"), mod("Body")])
        }, attributes: {
          body: {
            natural: {
              base: 4, modifiers: []
            }
          }
        }
      },
      items: [{
        _id: "w1", name: "Arme", system: {
          damageValue: {
            base: 5, modifiers: [mod("Strength")]
          }
        }
      }, {
        _id: "c1", name: "Propre", system: {
          price: pool()
        }
      }],
    })
    const clean = actor._source.items[1]
    cleanCreatedSource(actor)
    expect(actor._source.system.resistances.fall.modifiers).toEqual([])
    expect(actor._source.system.attributes.body.natural.base).toBe(4)
    expect(actor._source.items[0].system.damageValue).toEqual({
      base: 5, modifiers: []
    })
    expect(actor._source.items[1]).toBe(clean)
  })

  it("leaves a clean document untouched", () => {
    const item = doc({
      system: {
        price: pool()
      }
    })
    cleanCreatedSource(item)
    expect(item.updateSource).not.toHaveBeenCalled()
  })
})
