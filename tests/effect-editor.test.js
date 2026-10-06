import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  calledShotItemBonus, easeCalledShotPenalty, effectsChangedBy, stripEffectChanges, canEditItemEffects,
  keepUnlistedEffectFields, lockEffectFields, CALLED_SHOT_ITEM_KEYS, systemEffectWrite, clearTargetsOnCategoryChange
} from '../modules/system/effect-editor.js'
import {
  handleMartialArtsCalledShot
} from '../modules/rolls/roll-prepare-case/rollData-Weapon.js'
import {
  martialArtNeedsSwitch
} from '../modules/system/martial-arts-technique.js'
import {
  SR5
} from '../modules/config.js'

const agility6 = {
  category: "characterAttributes", target: "system.attributes.agility.augmented", type: "value", value: 6, multiplier: 1
}

describe("called shots eased by any item (G14)", () => {
  it("lowers the penalty of the called shot, and of a vehicle location", () => {
    expect(calledShotItemBonus({
      ricochetShot: 2
    }, "ricochetShot")).toBe(2)
    expect(calledShotItemBonus({
      engineBlock: 1
    }, "specificTarget", "engineBlock")).toBe(1)
    expect(calledShotItemBonus({
      upTheAnte: 1, engineBlock: 1
    }, "upTheAnte", "engineBlock")).toBe(2)
    // a body location belongs to the martial arts category, not to this one
    expect(calledShotItemBonus({
      knee: 3
    }, "specificTarget", "knee")).toBe(0)
  })

  it("stops an eased penalty at 0", () => {
    expect(easeCalledShotPenalty(-6, 2)).toBe(-4)
    expect(easeCalledShotPenalty(-4, 6)).toBe(0)
    expect(easeCalledShotPenalty(0, 2)).toBe(0)
    expect(easeCalledShotPenalty(-4, 0)).toBe(-4)
  })

  it("leaves the martial arts called shots to their own category", () => {
    for (const key of Object.keys(SR5.calledShotsMartialArts)) expect(CALLED_SHOT_ITEM_KEYS).not.toContain(key)
    for (const key of CALLED_SHOT_ITEM_KEYS) expect(SR5.calledShotsItems[key]).toBeTruthy()
  })

  it("reads the items' modifiers when the roll is prepared", async () => {
    const data = {
      combat: {
        calledShot: {
          martialArts: {
          }, martialArtsModifiers: {
          }, itemModifiers: {
          }
        }
      }
    }
    await handleMartialArtsCalledShot(data, {
      system: {
        itemsProperties: {
          martialArts: {
          }, calledShots: {
            warningShot: {
              modifier: {
                value: 2
              }
            }, tag: {
              modifier: {
                value: 0
              }
            }
          }
        }
      }
    })
    expect(data.combat.calledShot.itemModifiers).toEqual({
      warningShot: 2
    })
  })

  it("applies on its own on a martial arts technique, like the technique's called shots", () => {
    expect(martialArtNeedsSwitch({
      actionType: "complex", customEffects: [{
        target: "system.itemsProperties.calledShots.ricochetShot.modifier", value: 1
      }]
    })).toBe(false)
  })
})

describe("effects written by the gamemaster alone (G14)", () => {
  const current = {
    customEffects: [{
      ...agility6, value: 1
    }], itemEffects: [], systemEffects: []
  }

  it("sees a change made by the sheet form, by a dotted path, or by a whole list", () => {
    expect(effectsChangedBy({
      system: {
        customEffects: {
          0: {
            value: 6
          }
        }
      }
    }, current)).toBe(true)
    expect(effectsChangedBy({
      "system.customEffects.0.value": 6
    }, current)).toBe(true)
    expect(effectsChangedBy({
      "system.customEffects": [current.customEffects[0], agility6]
    }, current)).toBe(true)
    expect(effectsChangedBy({
      "system.systemEffects": [{
        category: "specialCase", value: "x"
      }]
    }, current)).toBe(true)
  })

  it("lets an unchanged list through without a warning", () => {
    expect(effectsChangedBy({
      system: {
        customEffects: {
          0: {
            ...agility6, value: 1
          }
        }, itemRating: 3
      }
    }, current)).toBe(false)
    expect(effectsChangedBy({
      "system.itemRating": 3
    }, current)).toBe(false)
  })

  it("sees that a partial entry replaces the whole list, as Foundry does", () => {
    expect(effectsChangedBy({
      system: {
        customEffects: {
          0: {
            value: 1
          }
        }
      }
    }, current)).toBe(true)
    expect(effectsChangedBy({
      "system.itemRating": 3
    }, current)).toBe(false)
  })

  it("takes the effects out of an update and keeps the rest", () => {
    const changes = {
      "system.customEffects.0.value": 6, "system.itemEffects": [], system: {
        systemEffects: [], itemRating: 3
      }, name: "x"
    }
    expect(stripEffectChanges(changes, current)).toBe(true)
    expect(changes).toEqual({
      system: {
        itemRating: 3
      }, name: "x"
    })
  })

  describe("the world setting", () => {
    afterEach(() => { delete globalThis.game })
    const withSetting = on => { globalThis.game = {
      settings: {
        get: () => on
      }
    } }

    it("off (default): the owner edits as before", () => {
      withSetting(false)
      expect(canEditItemEffects({
        isGM: false
      }, true)).toBe(true)
    })
    it("on: the gamemaster alone", () => {
      withSetting(true)
      expect(canEditItemEffects({
        isGM: false
      }, true)).toBe(false)
      expect(canEditItemEffects({
        isGM: true
      }, true)).toBe(true)
    })
    it("never someone who does not own the item", () => {
      withSetting(false)
      expect(canEditItemEffects({
        isGM: false
      }, false)).toBe(false)
    })
  })
})

// A minimal stand-in for the sheet's elements: vitest runs without a DOM here
function fakeSelect(values){
  const select = {
    options: values.map(v => ({
      value: v
    })), value: values[0], disabled: false,
    appendChild(o){ this.options.push(o) },
    ownerDocument: {
      createElement: () => ({
      })
    },
  }
  return select
}

describe("an effect target missing from the lists (greyMana, 06/10)", () => {
  it("is kept as an option, so the next save does not wipe it", () => {
    const target = fakeSelect(["", "system.magic.astralDamage"])
    const category = fakeSelect(["", "astralValues"])
    const root = {
      querySelector: sel => sel.endsWith('.0.target"]') ? target : sel.endsWith('.0.category"]') ? category : null
    }
    keepUnlistedEffectFields(root, {
      customEffects: [{
        category: "astralValues", target: "system.magic.somethingNew"
      }]
    }, "hors liste")
    expect(target.value).toBe("system.magic.somethingNew")
    expect(target.options.at(-1).value).toBe("system.magic.somethingNew")
    // a listed value is left alone
    expect(category.options).toHaveLength(2)
  })

  it("lists the grey mana among the astral values", async () => {
    const fs = await import('node:fs')
    const template = fs.readFileSync('templates/items/_partial/effect/effect.hbs', 'utf8')
    expect(template).toContain('value="system.magic.greyMana"')
  })
})

describe("the system's own writes, made on a player's client (Gustave's review)", () => {
  afterEach(() => { delete globalThis.game; delete globalThis.ui })
  const setup = () => {
    globalThis.game = {
      user: {
        id: "player", isGM: false
      }, settings: {
        get: () => true
      }, i18n: {
        localize: k => k
      }
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
  }
  const armor = {
    type: "itemArmor", _source: {
      system: {
        customEffects: [], itemEffects: [], systemEffects: []
      }
    }
  }
  const acid = () => ({
    "system.itemEffects": [{
      target: "system.armorValue", type: "value", value: -1
    }]
  })

  it("lets an effect written by the system through (acid on the armor, Apply to item)", async () => {
    setup()
    const {
      sr5HookPreUpdateItem
    } = await import('../modules/hooks/item.js')
    const changes = acid()
    sr5HookPreUpdateItem(armor, changes, systemEffectWrite(), "player")
    expect(changes["system.itemEffects"]).toHaveLength(1)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it("still refuses the player's own write", async () => {
    setup()
    const {
      sr5HookPreUpdateItem
    } = await import('../modules/hooks/item.js')
    const changes = acid()
    sr5HookPreUpdateItem(armor, changes, {
    }, "player")
    expect(changes["system.itemEffects"]).toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalled()
  })

  it("is marked at every place where the system writes the effects of an existing item", async () => {
    const fs = await import('node:fs')
    const marked = {
      'modules/entities/actors/entityActor-helpers.js': 3,
      'modules/system/srcombat.js': 1,
      'modules/entities/items/mentor-conversion.js': 2,
    }
    for (const [file, count] of Object.entries(marked)) {
      expect(fs.readFileSync(file, 'utf8').split('systemEffectWrite()').length - 1, file).toBe(count)
    }
  })
})

describe("the active gamemaster sees every player's write of effects (Gustave's second review)", () => {
  afterEach(() => { delete globalThis.game; delete globalThis.ui })
  const gmClient = () => {
    globalThis.game = {
      user: {
        id: "gm", isGM: true
      }, users: {
        activeGM: {
          isSelf: true
        }, get: id => ({
          id, isGM: id === "gm", name: id === "gm" ? "MJ" : "Clo"
        })
      }, settings: {
        get: () => true
      }, i18n: {
        localize: k => k, format: k => k
      }
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn(), info: vi.fn()
      }
    }
  }
  const armor = {
    type: "itemArmor", name: "Armure", parent: {
      name: "Clo"
    }
  }
  const acid = {
    system: {
      itemEffects: [{
        target: "system.armorValue", value: -1
      }]
    }
  }

  it("is told of an announced system write too, an option the player's client can forge", async () => {
    gmClient()
    const {
      sr5HookUpdateItem
    } = await import('../modules/hooks/item.js')
    await sr5HookUpdateItem(armor, acid, systemEffectWrite(), "player")
    const calls = [...ui.notifications.warn.mock.calls, ...ui.notifications.info.mock.calls].map(c => c[0])
    expect(calls).toContain("SR5.WARN_ItemEffectsSystemWrite")
  })

  it("is told of a plain write with the lasting warning", async () => {
    gmClient()
    const {
      sr5HookUpdateItem
    } = await import('../modules/hooks/item.js')
    await sr5HookUpdateItem(armor, acid, {
    }, "player")
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_ItemEffectsChangedByPlayer", {
      permanent: true
    })
  })

  it("is not told of the gamemaster's own writes", async () => {
    gmClient()
    const {
      sr5HookUpdateItem
    } = await import('../modules/hooks/item.js')
    await sr5HookUpdateItem(armor, acid, systemEffectWrite(), "gm")
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(ui.notifications.info).not.toHaveBeenCalled()
  })

  // Séance H, H3: the creation is let through, the gamemaster is warned
  const created = (type, system) => ({
    type, name: "Objet", isOwned: true, parent: {
      name: "Clo"
    }, system
  })

  it("is told when a player adds an item that carries effects", async () => {
    gmClient()
    const {
      sr5HookCreateItem
    } = await import('../modules/hooks/item.js')
    await sr5HookCreateItem(created("itemArmor", acid.system), {
    }, "player")
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_ItemEffectsAddedByPlayer", {
      permanent: true
    })
  })

  it("is not told of an item without effects, of the system's states, nor of its own additions", async () => {
    gmClient()
    const {
      sr5HookCreateItem
    } = await import('../modules/hooks/item.js')
    await sr5HookCreateItem(created("itemArmor", {
      customEffects: [], itemEffects: [], systemEffects: []
    }), {
    }, "player")
    await sr5HookCreateItem(created("itemEffect", acid.system), {
    }, "player")
    await sr5HookCreateItem(created("itemArmor", acid.system), {
    }, "gm")
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it("is not told when the setting is off", async () => {
    gmClient()
    game.settings.get = () => false
    const {
      sr5HookCreateItem
    } = await import('../modules/hooks/item.js')
    await sr5HookCreateItem(created("itemArmor", acid.system), {
    }, "player")
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })
})

describe("a category changed in the sheet (Gustave's review)", () => {
  const source = {
    customEffects: [{
      category: "astralValues", target: "system.magic.cibleInconnue", type: "value", value: 1
    }]
  }
  it("drops the old target, which belongs to the old category", () => {
    const submit = {
      system: {
        customEffects: {
          0: {
            category: "skills", target: "system.magic.cibleInconnue", value: 1
          }
        }
      }
    }
    clearTargetsOnCategoryChange(submit, source)
    expect(submit.system.customEffects[0].target).toBe("")
  })
  it("keeps a target unknown in its own, unchanged category", () => {
    const submit = {
      "system.customEffects.0.category": "astralValues", "system.customEffects.0.target": "system.magic.cibleInconnue"
    }
    clearTargetsOnCategoryChange(submit, source)
    expect(submit["system.customEffects.0.target"]).toBe("system.magic.cibleInconnue")
  })
  it("drops it in the dotted form too", () => {
    const submit = {
      "system.customEffects.0.category": "skills", "system.customEffects.0.target": "system.magic.cibleInconnue"
    }
    clearTargetsOnCategoryChange(submit, source)
    expect(submit["system.customEffects.0.target"]).toBe("")
  })
})

describe("locked fields", () => {
  it("are disabled, and the add, delete and copy controls removed", () => {
    const field = {
      disabled: false
    }
    const control = {
      remove: vi.fn()
    }
    const root = {
      querySelectorAll: sel => sel.startsWith('[name^="system.customEffects.') ? [field] : sel === '[data-binding="customEffects"]' ? [control] : []
    }
    lockEffectFields(root)
    expect(field.disabled).toBe(true)
    expect(control.remove).toHaveBeenCalled()
  })
})

describe("the options of a system write", () => {
  it("are a new object each time, which Foundry may write into", () => {
    const a = systemEffectWrite()
    a.parent = {
    }
    expect(systemEffectWrite()).toEqual({
      sr5SystemEffect: true
    })
    expect(Object.isExtensible(systemEffectWrite())).toBe(true)
  })
})
