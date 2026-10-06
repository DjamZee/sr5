import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheets build on Foundry's classes
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
  globalThis.foundry.abstract.TypeDataModel.migrateData ??= (source) => source
})

import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  DRUG_DAMAGE, intakeDamageOf, crashDamageOf, drugHasCrashDamage, drugResistance, drugVector, longHaulDoseKind, hasImplants, drugTakesDoseInCrash
} from '../modules/entities/items/drug-damage.js'

beforeEach(() => {
  globalThis.game.i18n = {
    localize: k => k, format: k => k
  }
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  globalThis.Roll = class {
    constructor(formula){
      this.formula = formula
    }
    async evaluate(){
      return {
        total: 3, formula: this.formula
      }
    }
  }
})

const drugItem = (key, extra = {
}) => ({
  id: `id-${key}`, _id: `id-${key}`, name: `Drogue ${key}`, type: 'itemDrug',
  system: {
    systemEffects: {
      0: {
        category: 'drug', value: key
      }
    }, vector: {
    }, handleShot: {
    }, ...extra
  },
})

const actor = (items = [], addictions = []) => {
  const list = [...items]
  list.get = id => list.find(i => i.id === id)
  return {
    items: list,
    system: {
      addictions,
      attributes: {
        body: {
          augmented: {
            value: 4
          }
        }
      },
      resistances: {
        toxin: {
          injection: {
            dicePool: 9, modifiers: [{
              source: 'SR5.Body', type: 'linkedAttribute', value: 4
            }, {
              source: 'SR5.Willpower', type: 'linkedAttribute', value: 5
            }]
          },
          ingestion: {
            dicePool: 9, modifiers: []
          },
        }
      },
    },
  }
}

const rollData = () => ({
  damage: {
  }, combat: {
  }, test: {
  }, dicePool: {
    modifiers: []
  }
})

const card = (drug, value = 1, extra = {
}) => ({
  owner: {
    messageId: ''
  }, damage: {
    value, type: 'stun', resistanceType: 'drugDamage', drug
  }, ...extra
})

describe('when the damage comes (SR5 p. 413-414, Chrome Flesh p. 185-197, Stolen Souls p. 192)', () => {
  it('Laés, Leäl, Soothsayer and Slab on intake, never at the crash', () => {
    for (const [key, value, resist] of [['laes', 12, 'toxin'], ['leal', 10, 'toxin'], ['soothsayer', 8, 'body'], ['slab', 16, 'toxin']]) {
      expect(intakeDamageOf(key)).toMatchObject({
        value, resist, type: 'stun'
      })
      expect(crashDamageOf(key)).toBeNull()
    }
  })
  it('Hurlg at the crash, Body only', () => {
    expect(intakeDamageOf('hurlg')).toBeNull()
    expect(crashDamageOf('hurlg')).toMatchObject({
      value: 9, resist: 'body', type: 'stun'
    })
  })
  it('the unresisted crashes of the book', () => {
    const book = {
      cram: 6, kamikaze: 6, nitro: 9, aisa: 2, betameth: 6, cereprax: 5, k10: 18, ripper: 2, overdrive: 8, shade: 10, rockLizardBlood: 2, kamiPlus: 10
    }
    for (const [key, value] of Object.entries(book)) expect(crashDamageOf(key)).toMatchObject({
      value, resist: 'none'
    })
  })
  it('Crimson Orchid deals no damage: its 6 is a Pain Tolerance (Chrome Flesh p. 190-191)', () => {
    expect(DRUG_DAMAGE.crimsonOrchid).toBeUndefined()
    expect(drugHasCrashDamage('crimsonOrchid')).toBe(false)
  })
  it('Immortal Flower: 2D6 Physical, only with implants (Chrome Flesh p. 193)', () => {
    expect(crashDamageOf('immortalFlower', {
    }, [])).toBeNull()
    expect(crashDamageOf('immortalFlower', {
    }, [{
      type: 'itemAugmentation', system: {
        type: 'genetech', isActive: true
      }
    }])).toBeNull()
    expect(crashDamageOf('immortalFlower', {
    }, [{
      type: 'itemAugmentation', system: {
        type: 'cyberware', isActive: true
      }
    }])).toMatchObject({
      dice: '2d6', type: 'physical', resist: 'none'
    })
    expect(hasImplants([{
      type: 'itemAugmentation', system: {
        type: 'bioware', isActive: false
      }
    }])).toBe(false)
  })
  it('a crash Physical after an interaction 11-13 stays Physical', () => {
    expect(crashDamageOf('cram', {
      crashPhysical: true
    }).type).toBe('physical')
  })
  it('Long Haul: no damage, but 10S unresisted after a second dose (SR5 p. 413)', () => {
    expect(crashDamageOf('longHaul')).toBeNull()
    expect(crashDamageOf('longHaul', {
      longHaulSecondDose: true
    })).toMatchObject({
      value: 10, resist: 'none'
    })
  })
})

describe('the resistance test is worked out again from the sheet, not from what is handed in', () => {
  it('Laés: Power 12 whatever the value handed in, toxin pool of its vector', () => {
    const laes = drugItem('laes', {
      vector: {
        ingestion: true, injection: true
      }
    })
    const data = drugResistance(rollData(), actor([laes]), card({
      itemId: laes.id, phase: 'intake'
    }, 1))
    expect(data.damage.base).toBe(12)
    expect(data.damage.type).toBe('stun')
    expect(data.dicePool.base).toBe(9)
    expect(data.test.typeSub).toBe('drugDamage')
    expect(drugVector(laes.system)).toBe('injection')
  })
  it('Soothsayer: the DV comes from the addictions of the actor', () => {
    const sooth = drugItem('soothsayer')
    const data = drugResistance(rollData(), actor([sooth], [{
      name: sooth.name, shot: {
        value: 3
      }
    }]), card({
      itemId: sooth.id, phase: 'intake'
    }, 1))
    expect(data.damage.base).toBe(6)
    expect(data.dicePool.base).toBe(4)
    expect(data.dicePool.composition).toHaveLength(1)
  })
  it('Hurlg at the crash: Body only, no armor', () => {
    const hurlg = drugItem('hurlg')
    const data = drugResistance(rollData(), actor([hurlg]), card({
      itemId: hurlg.id, phase: 'crash'
    }, 2))
    expect(data.damage.base).toBe(9)
    expect(data.dicePool.base).toBe(4)
    expect(data.combat.armorPenetration).toBe(0)
  })
  it('interaction 14+: 10P, Body only (Chrome Flesh p. 197)', () => {
    const data = drugResistance(rollData(), actor(), card({
      interaction: true
    }, 1))
    expect(data.damage).toMatchObject({
      base: 10, type: 'physical'
    })
    expect(data.dicePool.base).toBe(4)
  })
  it('refused: a card behind it, an item that is not a drug, a drug without resisted damage, a missing item', () => {
    const laes = drugItem('laes')
    const sheet = actor([laes, drugItem('cram'), {
      ...drugItem('laes'), id: 'gear', type: 'itemGear'
    }])
    expect(drugResistance(rollData(), sheet, card({
      itemId: laes.id, phase: 'intake'
    }, 1, {
      owner: {
        messageId: 'abc'
      }
    }))).toBeUndefined()
    expect(drugResistance(rollData(), sheet, card({
      itemId: 'gear', phase: 'intake'
    }))).toBeUndefined()
    expect(drugResistance(rollData(), sheet, card({
      itemId: 'id-cram', phase: 'crash'
    }))).toBeUndefined()
    expect(drugResistance(rollData(), sheet, card({
      itemId: 'nope', phase: 'intake'
    }))).toBeUndefined()
    //A Laés asked as a crash: it has none
    expect(drugResistance(rollData(), sheet, card({
      itemId: laes.id, phase: 'crash'
    }))).toBeUndefined()
  })
})

describe('Long Haul, second dose (SR5 p. 413)', () => {
  const sheetData = {
    attributes: {
      body: {
        augmented: {
          value: 4
        }
      }
    }, essence: {
      value: 6
    }, addictions: []
  }
  const take = (item, consumer) => SR5_CharacterUtility.handleDrugShots(item, {
    value: 'longHaul'
  }, sheetData, consumer)

  it('first dose: 4 days, a crash of 8D6 hours, no damage', async () => {
    const stat = await take(drugItem('longHaul'), actor())
    expect([stat.duration, stat.durationType]).toEqual([4, 'day'])
    expect(stat.longHaulSecondDose).toBeUndefined()
  })
  it('taken during its crash: (12 × 1D6) hours awake, then the 10S', async () => {
    const item = drugItem('longHaul', {
      phase: 'crash'
    })
    const stat = await take(item, actor([item]))
    expect([stat.duration, stat.durationType]).toEqual([3, 'hour'])
    expect(stat.longHaulSecondDose).toBe(true)
    expect(crashDamageOf('longHaul', stat).value).toBe(10)
  })
  it('during the crash of another Long Haul item too', async () => {
    const other = drugItem('longHaul', {
      phase: 'crash'
    })
    other.id = other._id = 'other'
    const item = drugItem('longHaul')
    expect(longHaulDoseKind(item, actor([other, item]))).toBe('second')
  })
  // Eudoxie's review, D1: counted for the actor, not for one item
  it('two items in turn: a dose during the rise or the crash of a second dose keeps no one awake', async () => {
    const second = drugItem('longHaul', {
      phase: 'rise', handleShot: {
        longHaulSecondDose: true
      }
    })
    second.id = second._id = 'second'
    const first = drugItem('longHaul', {
      phase: 'crash'
    })
    expect(longHaulDoseKind(first, actor([first, second]))).toBe('noMore')
    second.system.phase = 'crash'
    expect(longHaulDoseKind(first, actor([first, second]))).toBe('noMore')
    //Once that chain is over, a dose is a first one again
    second.system.phase = ''
    first.system.phase = ''
    expect(longHaulDoseKind(first, actor([first, second]))).toBe('first')
  })
  it('a dose during the rise of a first dose is a first dose (the book only speaks of the crash)', () => {
    const other = drugItem('longHaul', {
      phase: 'rise'
    })
    other.id = other._id = 'other'
    expect(longHaulDoseKind(drugItem('longHaul'), actor([other]))).toBe('first')
  })
  it('the switch of a Long Haul in its crash takes a dose (sheet)', () => {
    const takesDoseInCrash = (key) => drugTakesDoseInCrash(drugItem(key).system)
    expect(takesDoseInCrash('longHaul')).toBe(true)
    expect(takesDoseInCrash('cram')).toBe(false)
  })
  it('a third dose keeps no one awake: straight back to sleep, no damage', async () => {
    const item = drugItem('longHaul', {
      phase: 'crash', handleShot: {
        longHaulSecondDose: true
      }
    })
    const stat = await take(item, actor([item]))
    expect([stat.duration, stat.durationType]).toEqual([1, 'combatTurn'])
    expect(stat.longHaulSecondDose).toBeUndefined()
    expect(crashDamageOf('longHaul', stat)).toBeNull()
    expect(ui.notifications.warn).toHaveBeenCalled()
  })
})

describe('KAMI+ (custom drug of the Megapack)', () => {
  it('has a stat: (10 × 1D6) minutes', async () => {
    const stat = await SR5_CharacterUtility.handleDrugShots(drugItem('kamiPlus'), {
      value: 'kamiPlus'
    }, {
      attributes: {
        body: {
          augmented: {
            value: 4
          }
        }
      }, essence: {
        value: 6
      }, addictions: []
    }, actor())
    expect([stat.duration, stat.durationType]).toEqual([3, 'minute'])
    expect([stat.speed, stat.speedType]).toEqual([1, 'SR5.CombatTurn'])
  })
})
