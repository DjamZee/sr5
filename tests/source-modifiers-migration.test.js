import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Computed modifiers written in the source by a prepared copy (toObject(false), fixed in 3a35dfa82), and the
// Mégapack actors exported that way: the arrays that the preparation does not reset (fatigue, fall) grew at
// every preparation, up to 1415 entries. The migration empties every "modifiers" array of the source, and
// nothing else.

import {
  computedModifierPaths, sourceModifiersUpdate, migrateSourceModifiers, runSourceModifiersMigration, SOURCE_MODIFIERS_MIGRATION
} from "../modules/migration-source-modifiers.js"

const mod = (source, value = 1) => ({
  source, type: "linkedAttribute", value, isMultiplier: false
})

// A polluted actor source: 52 fatigue modifiers, a few prepared ones, the entered values beside them
function pollutedSystem() {
  return {
    attributes: {
      body: {
        natural: {
          base: 4, value: 4, modifiers: [mod("Métatype")]
        }, augmented: {
          base: 0, value: 5, modifiers: [mod("Muscle Replacement")]
        }
      }
    },
    resistances: {
      fatigue: {
        base: 0, dicePool: 60, modifiers: Array.from({
          length: 52
        }, (_, i) => mod(i % 2 ? "Body" : "Willpower", 4))
      },
      fall: {
        base: 0, dicePool: 0, modifiers: []
      }
    },
    conditionMonitors: {
      physical: {
        base: 0, value: 10, modifiers: [mod("Body", 2)], actual: {
          base: 3, value: 3, modifiers: []
        }, boxes: [1, 2, 3]
      }
    },
    firingMode: {
      value: ["SA"]
    },
    vehicleOwner: {
      id: "owner", system: {
        skills: {
          pilotAircraft: {
            test: {
              dicePool: 9, modifiers: [mod("Reaction", 5)]
            }
          }
        }
      }
    },
    creatorData: {
      system: {
        magic: {
          drainResistance: {
            modifiers: [mod("Willpower", 6)]
          }
        }
      }
    },
  }
}

function cleanSystem() {
  const system = pollutedSystem()
  system.attributes.body.natural.modifiers = []
  system.attributes.body.augmented.modifiers = []
  system.resistances.fatigue.modifiers = []
  system.conditionMonitors.physical.modifiers = []
  return system
}

describe("what the source must not hold", () => {
  it("finds every non empty modifiers array, and only those", () => {
    expect(computedModifierPaths(pollutedSystem()).sort()).toEqual([
      "system.attributes.body.augmented.modifiers",
      "system.attributes.body.natural.modifiers",
      "system.conditionMonitors.physical.modifiers",
      "system.resistances.fatigue.modifiers",
    ])
  })

  it("a polluted actor is emptied by path", () => {
    const update = sourceModifiersUpdate(pollutedSystem())
    expect(update).toEqual({
      "system.attributes.body.augmented.modifiers": [],
      "system.attributes.body.natural.modifiers": [],
      "system.conditionMonitors.physical.modifiers": [],
      "system.resistances.fatigue.modifiers": [],
    })
  })

  it("a clean actor is left alone", () => {
    expect(computedModifierPaths(cleanSystem())).toEqual([])
    expect(sourceModifiersUpdate(cleanSystem())).toBeNull()
  })

  it("what is entered is kept: bases, damage, other arrays, the controller's and creator's copies", () => {
    const update = sourceModifiersUpdate(pollutedSystem())
    const written = Object.keys(update)
    expect(written.every(p => p.endsWith(".modifiers"))).toBe(true)
    expect(written.some(p => p.includes("vehicleOwner") || p.includes("creatorData"))).toBe(false)
    expect(written.some(p => p.includes(".base") || p.includes("boxes") || p.includes("firingMode"))).toBe(false)
  })

  it("an item copy nested in an array is rewritten whole, cleaned, its other fields kept", () => {
    const system = {
      price: {
        base: 100, value: 300, modifiers: [mod("Rating", 3)]
      },
      accessory: [{
        _id: "acc1", name: "Smartlink", system: {
          price: {
            base: 500, value: 500, modifiers: [mod("Grade")]
          }, essenceCost: {
            base: 0.1, value: 0.1, modifiers: [mod("Grade"), mod("Grade")]
          }
        }
      }, {
        _id: "acc2", name: "Clean", system: {
          price: {
            base: 10, value: 10, modifiers: []
          }
        }
      }],
    }
    const update = sourceModifiersUpdate(system)
    expect(Object.keys(update).sort()).toEqual(["system.accessory", "system.price.modifiers"])
    expect(update["system.accessory"]).toEqual([{
      _id: "acc1", name: "Smartlink", system: {
        price: {
          base: 500, value: 500, modifiers: []
        }, essenceCost: {
          base: 0.1, value: 0.1, modifiers: []
        }
      }
    }, system.accessory[1]])
    // The source given is not changed in place
    expect(system.accessory[0].system.price.modifiers).toHaveLength(1)
  })
})

describe("the world migration", () => {
  let actors, worldItems, scenes, settings

  function actorDoc(name, system, items = []) {
    const actor = {
      name, _source: {
        system, items
      }, update: vi.fn(async () => {}), updateEmbeddedDocuments: vi.fn(async () => {}),
    }
    return actor
  }

  beforeEach(() => {
    settings = {
      "sr5.sourceModifiersMigration": 0
    }
    const pc = actorDoc("Polluted", pollutedSystem(), [{
      _id: "w1", system: {
        damageValue: {
          base: 5, modifiers: [mod("Strength")]
        }
      }
    }, {
      _id: "w2", system: {
        damageValue: {
          base: 5, modifiers: []
        }
      }
    }])
    const clean = actorDoc("Clean", cleanSystem())
    actors = [pc, clean]
    worldItems = [{
      _source: {
        _id: "i1", system: {
          price: {
            base: 1, modifiers: [mod("Rating")]
          }
        }
      }
    }]
    const synthetic = actorDoc("Token actor", {
    })
    scenes = [{
      name: "Scene", tokens: [
        {
          name: "Linked", actorLink: true, actor: pc, delta: {
            _source: {
              system: pollutedSystem()
            }
          }
        },
        {
          name: "Unlinked", actorLink: false, actor: synthetic, delta: {
            _source: {
              system: {
                resistances: {
                  fall: {
                    modifiers: [mod("Body"), mod("Body")]
                  }
                }
              }, items: []
            }
          }
        },
      ]
    }]
    globalThis.game.actors = actors
    globalThis.game.items = {
      contents: worldItems, get: id => worldItems.find(i => i._source._id === id)
    }
    globalThis.game.scenes = scenes
    globalThis.game.settings = {
      get: vi.fn((ns, key) => settings[`${ns}.${key}`]),
      set: vi.fn(async (ns, key, value) => {
        settings[`${ns}.${key}`] = value
      }),
    }
    globalThis.game.user = {
      id: "gm", isGM: true
    }
    globalThis.game.users = {
      activeGM: {
        id: "gm"
      }
    }
    globalThis.game.i18n ??= {
    }
    globalThis.game.i18n.format = key => key
    globalThis.game.combats = []
    globalThis.game.i18n.localize = key => key
    globalThis.ui = {
      notifications: {
        info: vi.fn(), warn: vi.fn()
      }
    }
    globalThis.Item = {
      implementation: {
        updateDocuments: vi.fn(async () => {})
      }
    }
  })

  it("cleans polluted actors, their items, world items and unlinked tokens, and counts them", async () => {
    const done = await migrateSourceModifiers()
    const [pc, clean] = actors
    expect(pc.update).toHaveBeenCalledTimes(1)
    expect(pc.update.mock.calls[0][0]["system.resistances.fatigue.modifiers"]).toEqual([])
    expect(pc.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{
      _id: "w1", "system.damageValue.modifiers": []
    }], expect.anything())
    expect(clean.update).not.toHaveBeenCalled()
    expect(clean.updateEmbeddedDocuments).not.toHaveBeenCalled()
    expect(globalThis.Item.implementation.updateDocuments).toHaveBeenCalledWith([{
      _id: "i1", "system.price.modifiers": []
    }], expect.anything())
    const synthetic = scenes[0].tokens[1].actor
    expect(synthetic.update).toHaveBeenCalledWith({
      "system.resistances.fall.modifiers": []
    }, expect.anything())
    // The linked token is its actor: not written a second time
    expect(pc.update).toHaveBeenCalledTimes(1)
    expect(done).toEqual({
      actors: 1, items: 1, tokens: 1, arrays: 4 + 1 + 1 + 1, failed: 0
    })
  })

  it("runs once per world, by the active GM only", async () => {
    globalThis.game.users.activeGM = {
      id: "other"
    }
    await runSourceModifiersMigration()
    expect(actors[0].update).not.toHaveBeenCalled()

    globalThis.game.users.activeGM = {
      id: "gm"
    }
    await runSourceModifiersMigration()
    expect(actors[0].update).toHaveBeenCalledTimes(1)
    expect(settings["sr5.sourceModifiersMigration"]).toBe(SOURCE_MODIFIERS_MIGRATION)

    await runSourceModifiersMigration()
    expect(actors[0].update).toHaveBeenCalledTimes(1)
  })

  it("is put off while a combat is under way, and runs once it is over", async () => {
    globalThis.game.combats = [{
      started: true
    }]
    await runSourceModifiersMigration()
    expect(actors[0].update).not.toHaveBeenCalled()
    expect(settings["sr5.sourceModifiersMigration"]).toBe(0)
    expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_SourceModifiersDeferred", expect.anything())

    globalThis.game.combats = [{
      started: false
    }]
    await runSourceModifiersMigration()
    expect(actors[0].update).toHaveBeenCalledTimes(1)
    expect(settings["sr5.sourceModifiersMigration"]).toBe(SOURCE_MODIFIERS_MIGRATION)
  })

  // Ruth's review: a combat whose initiatives are rolled but not begun is under way too
  it("is put off while a combat has its initiatives rolled, even before it begins", async () => {
    globalThis.game.combats = [{
      started: false, combatants: [{
        initiative: null
      }, {
        initiative: 12
      }]
    }]
    await runSourceModifiersMigration()
    expect(actors[0].update).not.toHaveBeenCalled()
    expect(settings["sr5.sourceModifiersMigration"]).toBe(0)
  })

  // Ruth's review: a world already clean showed "Migration en cours" and no count after it
  it("says nothing on a world already clean, and marks it done", async () => {
    actors.splice(0, 1)
    worldItems.splice(0, 1)
    scenes.splice(0, 1)
    await runSourceModifiersMigration()
    expect(globalThis.ui.notifications.info).not.toHaveBeenCalled()
    expect(settings["sr5.sourceModifiersMigration"]).toBe(SOURCE_MODIFIERS_MIGRATION)
  })

  it("is not marked done when an actor failed: the next load takes it up again", async () => {
    actors[0].update.mockRejectedValueOnce(new Error("refused"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await runSourceModifiersMigration()
    expect(settings["sr5.sourceModifiersMigration"]).toBe(0)
    expect(globalThis.ui.notifications.warn).toHaveBeenCalled()

    await runSourceModifiersMigration()
    expect(actors[0].update).toHaveBeenCalledTimes(2)
    expect(settings["sr5.sourceModifiersMigration"]).toBe(SOURCE_MODIFIERS_MIGRATION)
  })
})
