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
  keepUnlistedEffectFields, lockEffectFields, CALLED_SHOT_ITEM_KEYS
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
