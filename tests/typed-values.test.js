import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
  globalThis.foundry.abstract.TypeDataModel.migrateData ??= (source) => source

  // Stand-ins for Foundry's data fields. ArrayField and ObjectField cast a value as Foundry 13.351 does
  // (common/data/fields.mjs, ObjectField#_cast and ArrayField#_cast)
  class Field {
    constructor(options) {
      this.options = options
    }
    _cast(value) {
      return value
    }
  }
  class SchemaField extends Field {
    constructor(fields, options) {
      super(options)
      this.fields = fields
    }
  }
  class ObjectField extends Field {
    _cast(value) {
      return (value?.constructor === Object) ? value : {
      }
    }
  }
  class ArrayField extends Field {
    constructor(element, options) {
      super(options)
      this.element = element
    }
    _cast(value) {
      if (value?.constructor === Object) {
        const arr = []
        for (const [k, v] of Object.entries(value)) {
          const i = Number(k)
          if (Number.isInteger(i) && (i >= 0)) arr[i] = v
        }
        return arr
      }
      return value instanceof Array ? value : [value]
    }
  }
  globalThis.foundry.data = {
    fields: new Proxy({
      SchemaField, ArrayField, ObjectField
    }, {
      get: (target, name) => target[name] ?? Field
    })
  }
})

import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5_PrepareRollTest
} from '../modules/rolls/roll-prepare.js'
import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'
import {
  sr5ItemDrugDataModel
} from '../modules/datamodels/items/itemDrug.js'
import {
  SR5_RollTest
} from '../modules/rolls/roll-test.js'
import {
  SR5_SocketHandler
} from '../modules/socket.js'

// An embedded collection: iterable, with find and get as Foundry's Collection has them
function collection(docs){
  const list = [...docs]
  list.get = (id) => list.find(d => d.id === id)
  return list
}

// An itemEffect as Foundry hands it over: its value field is a StringField, so a stored number comes back as text
function effectItem(type, value){
  return {
    id: type, type: 'itemEffect', name: type,
    system: {
      type, value: String(value), durationType: 'special', duration: 0
    },
    update: vi.fn(async () => {}),
  }
}

function combatActor(items){
  return {
    id: 'a1', name: 'Test', isToken: false, effects: [], items: collection(items),
    system: {
      conditionMonitors: {
      }, specialProperties: {
      }
    },
    update: vi.fn(async () => {}),
    takeDamage: vi.fn(async () => {}),
    rollTest: vi.fn(),
    updateEmbeddedDocuments: vi.fn(async () => {}),
  }
}

async function endTurn(actor){
  vi.spyOn(SR5Combat, 'getActorFromCombatant').mockReturnValue(actor)
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    damage: {
    }
  }))
  await SR5Combat.manageTurnEnd({
    name: 'Test'
  })
}

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('fire damage goes up by 1 each Combat Turn (SR5 p. 173)', () => {
  it('takes 3 then stores 4, not "31"', async () => {
    const fire = effectItem('fireDamage', 3)
    const actor = combatActor([fire])

    await endTurn(actor)

    expect(actor.takeDamage.mock.calls[0][0].damage.value).toBe(3)
    expect(fire.update.mock.calls[0][0].system.value).toBe(4)
  })

  it('takes 4 on the next turn', async () => {
    const fire = effectItem('fireDamage', 4)
    const actor = combatActor([fire])

    await endTurn(actor)

    expect(actor.takeDamage.mock.calls[0][0].damage.value).toBe(4)
    expect(fire.update.mock.calls[0][0].system.value).toBe(5)
  })
})

describe('acid damage drops by 1 each Combat Turn (SR5 p. 172)', () => {
  function armor(){
    return {
      id: 'armor', type: 'itemArmor', name: 'Veste',
      system: {
        isActive: true, isAccessory: false
      },
      toObject: () => ({
        _id: 'armor', system: {
          itemEffects: [{
            target: 'system.armorValue', type: 'value', value: -1
          }]
        }
      }),
    }
  }

  it('applies DV 5 after DV 6 and stores 5 for the next turn', async () => {
    const acid = effectItem('acidDamage', 6)
    const actor = combatActor([acid, armor()])

    await endTurn(actor)

    expect(actor.rollTest).toHaveBeenCalledTimes(1)
    expect(actor.rollTest.mock.calls[0][2].damage.value).toBe(5)
    expect(acid.update).toHaveBeenCalledWith({
      "system.value": 5
    })
    // and it eats one more point of armor
    expect(actor.updateEmbeddedDocuments.mock.calls[0][1][0]["system.itemEffects"][0].value).toBe(-2)
  })

  it('applies DV 4 on the turn after', async () => {
    const acid = effectItem('acidDamage', 5)
    const actor = combatActor([acid, armor()])

    await endTurn(actor)

    expect(actor.rollTest.mock.calls[0][2].damage.value).toBe(4)
    expect(acid.update).toHaveBeenCalledWith({
      "system.value": 4
    })
  })

  it('stops once its DV reaches 0: no damage, no more armor eaten', async () => {
    const acid = effectItem('acidDamage', 1)
    const actor = combatActor([acid, armor()])

    await endTurn(actor)

    expect(actor.rollTest).not.toHaveBeenCalled()
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })
})

describe('a drug keeps its stat (SR5 p. 411-413)', () => {
  it('declares the stat as an object, not a list', () => {
    const field = sr5ItemDrugDataModel.defineSchema().handleShot
    expect(field.constructor.name).toBe('ObjectField')
    // What the former ArrayField made of the stat: only integer keys survive, so nothing
    const former = new foundry.data.fields.ArrayField(new foundry.data.fields.ObjectField())
    expect(former._cast({
      name: 'bliss', duration: 6, durationType: 'hour'
    })).toEqual([])
  })

  it('loads a drug stored with the former empty list, and its other fields untouched', () => {
    const source = sr5ItemDrugDataModel.migrateData({
      handleShot: [], quantity: 2, interact: true, onUse: {
        duration: '6 h', contrecoup: ''
      }
    })
    expect(source).toEqual({
      handleShot: {
      }, quantity: 2, interact: true, onUse: {
        duration: '6 h', contrecoup: ''
      }
    })
    expect(sr5ItemDrugDataModel.defineSchema().handleShot._cast(source.handleShot)).toEqual({
    })
  })

  it('keeps a stat already stored as an object', () => {
    const stat = {
      name: 'jazz', duration: 30, durationType: 'minute'
    }
    expect(sr5ItemDrugDataModel.migrateData({
      handleShot: stat
    }).handleShot).toBe(stat)
  })
})

// A system data model as Foundry builds it: foundry.utils.duplicate(system) hands back its source
class FakeSystem {
  constructor(source, prepared){
    Object.defineProperty(this, '_source', {
      value: source, enumerable: false
    })
    Object.assign(this, prepared)
  }
  toJSON(){
    return JSON.parse(JSON.stringify(this._source))
  }
}

function drugItem(id, name, drug, extra = {
}){
  return {
    _id: id, id, name, type: 'itemDrug',
    system: {
      isActive: false, wirelessTurnedOn: false, interact: false, quantity: 2, speed: 1,
      systemEffects: {
        0: {
          category: 'drug', value: drug
        }
      },
      addiction: {
        rating: 5, threshold: 3
      },
      onUse: {
        duration: '', contrecoup: ''
      },
      handleShot: {
      },
      ...extra,
    },
  }
}

// Body 3: Bliss lasts 6 - 3 = 3 hours
function drugSheet(items){
  const attributes = {
    body: {
      natural: {
        value: 3
      }, augmented: {
        value: 3
      }
    }
  }
  const actor = {
    id: 'a1', name: 'Test', isToken: false, effects: [], items,
    system: new FakeSystem({
      attributes, essence: {
        value: 6
      }, addictions: []
    }, {
      attributes, essence: {
        value: 6
      }, addictions: []
    }),
    update: vi.fn(async () => {}),
    updateEmbeddedDocuments: vi.fn(async () => {}),
  }
  const sheet = Object.create(ActorSheetSR5.prototype)
  Object.defineProperty(sheet, 'actor', {
    value: actor
  })
  return {
    actor, sheet
  }
}

const takenBliss = () => drugItem('bliss', 'Bliss', 'bliss', {
  isActive: true,
  handleShot: {
    name: 'bliss', speed: 1, duration: 3, durationType: 'hour'
  },
  onUse: {
    duration: '3 SR5.Hours', contrecoup: ''
  },
})

// Rolls answer from a list of totals, in order, and are counted
let rolled
function rollTotals(...totals){
  rolled = []
  globalThis.Roll = class {
    constructor(formula){
      this.formula = formula
      rolled.push(formula)
    }
    async evaluate(){
      return {
        total: totals.shift()
      }
    }
  }
}

async function take(sheet, id){
  await sheet._onEditItemValue({
    currentTarget: {
      closest: () => ({
        dataset: {
          itemId: id
        }
      }),
      dataset: {
        binding: 'system.isActive', dtype: 'Boolean'
      },
    },
    target: {
      value: ''
    },
  })
}

const written = (actor, id) => actor.update.mock.calls.at(-1)[0].items.find(i => i._id === id)

describe('taking a drug rolls its random duration once (SR5 p. 411-413)', () => {
  it('rolls (10 × 1D6) once for Jazz and stores that duration', async () => {
    rollTotals(30)
    const {
      actor, sheet
    } = drugSheet([drugItem('jazz', 'Jazz', 'jazz')])

    await take(sheet, 'jazz')

    expect(rolled).toEqual(['1d6 * 10'])
    const jazz = written(actor, 'jazz')
    expect(jazz.system.handleShot.duration).toBe(30)
    expect(jazz.system.onUse.duration).toBe('30 SR5.Minutes')
  })
})

describe('drug interactions (Chrome Flesh p. 197)', () => {
  it('rolls one die per drug past the first', async () => {
    rollTotals(30, 4)
    const {
      sheet
    } = drugSheet([takenBliss(), drugItem('jazz', 'Jazz', 'jazz')])

    await take(sheet, 'jazz')

    expect(rolled).toEqual(['1d6 * 10', '1d6'])
  })

  it('on 1, doubles the durations of all the drugs and writes them with the actor update', async () => {
    rollTotals(30, 1)
    const {
      actor, sheet
    } = drugSheet([takenBliss(), drugItem('jazz', 'Jazz', 'jazz')])

    await take(sheet, 'jazz')

    const bliss = written(actor, 'bliss')
    expect(bliss.system.handleShot.duration).toBe(6)
    expect(bliss.system.onUse.duration).toBe('6 SR5.Hours')
    expect(bliss.system.interact).toBe(true)
    const jazz = written(actor, 'jazz')
    expect(jazz.system.isActive).toBe(true)
    expect(jazz.system.handleShot.duration).toBe(60)
    expect(jazz.system.onUse.duration).toBe('60 SR5.Minutes')
    // no separate update that the actor update would overwrite (nor that throws on a document)
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it('on 6, doubles the durations of the crashes', async () => {
    rollTotals(30, 6)
    const {
      actor, sheet
    } = drugSheet([takenBliss(), drugItem('jazz', 'Jazz', 'jazz')])

    await take(sheet, 'jazz')

    const jazz = written(actor, 'jazz')
    expect(jazz.system.handleShot.durationContrecoup).toBe(60)
    expect(jazz.system.handleShot.duration).toBe(30)
    expect(written(actor, 'bliss').system.handleShot.duration).toBe(3)
  })

  // Chrome Flesh p. 196: the interaction comes from ANOTHER drug, under effect or in its crash
  const crashingBliss = () => drugItem('bliss', 'Bliss', 'bliss', {
    wirelessTurnedOn: true,
    handleShot: {
      name: 'bliss', speed: 1, duration: 3, durationType: 'hour'
    },
  })
  const activeJazz = () => drugItem('jazz', 'Jazz', 'jazz', {
    isActive: true,
    handleShot: {
      name: 'jazz', duration: 30, durationType: 'minute', durationContrecoup: 30, durationContrecoupType: 'minute'
    },
    onUse: {
      duration: '30 SR5.Minutes', contrecoup: ''
    },
  })

  it('does not mix a drug retaken during its own crash with itself', async () => {
    rollTotals()
    const {
      actor, sheet
    } = drugSheet([crashingBliss()])

    await take(sheet, 'bliss')

    expect(rolled).toEqual([])
    expect(written(actor, 'bliss').system.handleShot.duration).toBe(3)
  })

  it('doubles a drug retaken during its own crash only once, with one die for the other drug', async () => {
    rollTotals(1)
    const {
      actor, sheet
    } = drugSheet([crashingBliss(), activeJazz()])

    await take(sheet, 'bliss')

    expect(rolled).toEqual(['1d6'])
    expect(written(actor, 'bliss').system.handleShot.duration).toBe(6)
    expect(written(actor, 'jazz').system.handleShot.duration).toBe(60)
  })

  it.each([7, 8, 9])('on %i, starts the crash of every drug under effect at once', async (total) => {
    rollTotals(30, total)
    const cram = drugItem('cram', 'Cram', 'cram', {
      isActive: true,
      handleShot: {
        name: 'cram', duration: 9, durationType: 'hour', unresistedStunDamage: 6
      },
    })
    const {
      actor, sheet
    } = drugSheet([cram, crashingBliss(), drugItem('jazz', 'Jazz', 'jazz')])
    actor.takeDamage = vi.fn()
    actor.rollTest = vi.fn()
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
      damage: {
      }, combat: {
      }
    }))

    await take(sheet, 'jazz')

    for (const id of ['cram', 'jazz']) {
      const d = written(actor, id)
      expect(d.system.isActive).toBe(false)
      expect(d.system.onUse.duration).toBe('')
    }
    //The Jazz crash lasts; the Cram's is only its damage, over once taken (Liesel's D3)
    expect(written(actor, 'jazz').system.wirelessTurnedOn).toBe(true)
    expect(written(actor, 'cram').system.wirelessTurnedOn).toBe(false)
    expect(written(actor, 'jazz').system.onUse.contrecoup).toBe('30 SR5.Minutes')
    // the crash damage of Cram applies once; Bliss, already in its crash, does not start it again
    expect(actor.takeDamage).toHaveBeenCalledTimes(1)
    expect(actor.takeDamage.mock.calls[0][0].damage).toEqual({
      value: 6, type: 'stun'
    })
    const said = ui.notifications.info.mock.calls.map(c => c[0]).join(' | ')
    expect(said).toContain('SR5.DrugCrashImmediate')
    expect(said).not.toContain('SR5.DrugContrecoupDurationDoubled')
  })

  // Chrome Flesh p. 197 says that the crashes start, not that a drug without crash stops: it keeps its effect
  // until its normal end (DjamZ's ruling, 06/10)
  it.each([7, 8, 9])('on %i, leaves a drug without crash under its effect', async (total) => {
    rollTotals(30, total)
    const nightwatch = drugItem('nightwatch', 'Nightwatch', 'nightwatch', {
      isActive: true,
      handleShot: {
        name: 'nightwatch', duration: 40, durationType: 'minute'
      },
      onUse: {
        duration: '40 SR5.Minutes', contrecoup: ''
      },
    })
    const {
      actor, sheet
    } = drugSheet([nightwatch, drugItem('jazz', 'Jazz', 'jazz')])
    actor.takeDamage = vi.fn()

    await take(sheet, 'jazz')

    const night = written(actor, 'nightwatch')
    expect(night.system.isActive).toBe(true)
    expect(night.system.onUse.duration).toBe('40 SR5.Minutes')
    // the drug that has a crash still goes into it
    expect(written(actor, 'jazz').system.isActive).toBe(false)
    expect(written(actor, 'jazz').system.onUse.contrecoup).toBe('30 SR5.Minutes')
  })

  // Every total of the table up to 13 has its own row: only 14+ inflicts 10P
  async function interactionDamage(total){
    rollTotals(30, total)
    const {
      actor, sheet
    } = drugSheet([takenBliss(), drugItem('jazz', 'Jazz', 'jazz')])
    actor.rollTest = vi.fn()
    actor.takeDamage = vi.fn()
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
      damage: {
      }, combat: {
      }
    }))
    await take(sheet, 'jazz')
    return actor
  }

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13])('on %i, inflicts no 10P', async (total) => {
    const actor = await interactionDamage(total)
    expect(actor.rollTest).not.toHaveBeenCalled()
  })

  //Liesel's D5: the crashes to come deal Physical damage, the drug being taken included
  it.each([11, 12, 13])('on %i, marks the crashes to come as Physical', async (total) => {
    rollTotals(30, total)
    const cram = drugItem('cram', 'Cram', 'cram', {
      isActive: true,
      handleShot: {
        name: 'cram', duration: 9, durationType: 'hour', unresistedStunDamage: 6
      },
    })
    const {
      actor, sheet
    } = drugSheet([cram, drugItem('jazz', 'Jazz', 'jazz')])
    await take(sheet, 'jazz')
    expect(written(actor, 'cram').system.handleShot.crashPhysical).toBe(true)
    expect(written(actor, 'jazz').system.handleShot.crashPhysical).toBe(true)
    expect(ui.notifications.info.mock.calls.map(c => c[0]).join(' | ')).toContain('SR5.DrugCrashPhysical')
  })

  it('on 14, inflicts 10P resisted', async () => {
    const actor = await interactionDamage(14)
    expect(actor.rollTest).toHaveBeenCalledWith('resistanceCard', null, expect.objectContaining({
      damage: expect.objectContaining({
        value: 10, type: 'physical'
      })
    }))
  })
})

describe('a bound spirit spends a service when it aids a test (SR5 p. 305-306)', () => {
  function spiritAid(modifiers, isOwner = true){
    const spiritItem = {
      id: 's1', name: 'Esprit', parent: {
        id: 'a1'
      }, system: {
        services: {
          value: 3
        }
      }, update: vi.fn(async () => {}),
    }
    const spiritActor = {
      id: 'sa1', isOwner,
      system: {
        creatorItemId: 's1', creatorId: 'a1', services: {
          value: 3
        }
      }, update: vi.fn(async () => {}),
    }
    //The spirit of a duplicated summoner: same item id, another creator
    const twinSpirit = {
      id: 'sa2', isOwner,
      system: {
        creatorItemId: 's1', creatorId: 'a2', services: {
          value: 3
        }
      }, update: vi.fn(async () => {}),
    }
    globalThis.fromUuid = vi.fn(async () => spiritItem)
    globalThis.game.actors = [twinSpirit, spiritActor]
    const dialogData = {
      dicePool: {
        modifiers
      }, magic: {
        spiritAid: {
          id: 'Actor.a1.Item.s1', modifier: 4
        }
      }
    }
    return {
      spiritItem, spiritActor, dialogData
    }
  }

  it('reads the aid in the list of dice pool modifiers and writes the service by its path', async () => {
    const {
      spiritItem, spiritActor, dialogData
    } = spiritAid([{
      type: 'spiritAid', label: 'Assistance', value: 4
    }])

    await SR5_RollTest.spendSpiritAidService(dialogData)

    expect(spiritItem.update).toHaveBeenCalledWith({
      "system.services.value": 2
    })
    expect(spiritActor.update).toHaveBeenCalledWith({
      "system.services.value": 2
    })
  })

  it('hands the summoned spirit update to the GM when the player does not own it', async () => {
    const emit = vi.spyOn(SR5_SocketHandler, 'emitForGM').mockResolvedValue()
    const {
      spiritItem, spiritActor, dialogData
    } = spiritAid([{
      type: 'spiritAid', value: 4
    }], false)

    await SR5_RollTest.spendSpiritAidService(dialogData)

    expect(spiritItem.update).toHaveBeenCalledWith({
      "system.services.value": 2
    })
    expect(spiritActor.update).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith('updateActorData', {
      actorId: 'sa1', dataToUpdate: {
        services: {
          value: 2
        }
      }, use: 'spiritService'
    })
  })

  it('spends nothing when the aid was not taken', async () => {
    const {
      spiritItem, dialogData
    } = spiritAid([{
      type: 'woundModifier', value: -1
    }])

    await SR5_RollTest.spendSpiritAidService(dialogData)

    expect(spiritItem.update).not.toHaveBeenCalled()
  })
})

describe('switching the wireless of a device (SR5 p. 165, 167 and 424)', () => {
  async function switchWifi(requiresDNI, hasDNI, wasOn = true){
    //In combat: out of it nothing is spent (see "the switches of the sheet out of combat")
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue({
    })
    vi.spyOn(game.settings, 'get').mockImplementation((scope, key) => (key === 'sr5WifiRequiresDNI') ? requiresDNI : null)
    const actions = {
      free: {
        value: 1, current: 1
      }, simple: {
        value: 2, current: 2
      }, complex: {
        value: 1, current: 1
      }
    }
    const system = {
      hasDNI, specialProperties: {
        actions
      }
    }
    const actor = {
      id: 'a1', name: 'Test', isToken: false, effects: [], items: [{
        _id: 'g1', id: 'g1', name: 'Commlink', type: 'itemGear', system: {
          wirelessTurnedOn: wasOn, isActive: true
        }
      }],
      system: new FakeSystem(system, system),
      update: vi.fn(async () => {}),
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      value: actor
    })
    await sheet._onEditItemValue({
      currentTarget: {
        closest: () => ({
          dataset: {
            itemId: 'g1'
          }
        }),
        dataset: {
          binding: 'system.wirelessTurnedOn', dtype: 'Boolean'
        },
      },
      target: {
        value: ''
      },
    })
    return actor.update.mock.calls.at(-1)[0].system.specialProperties.actions
  }

  // A drug has no wireless: its switch moves it into its crash, then out of it, and costs no action
  it('spends no action on the crash switch of a drug, in or out', async () => {
    vi.spyOn(game.settings, 'get').mockImplementation((scope, key) => (key === 'sr5WifiRequiresDNI') ? true : null)
    for (const [phase, wasOn] of [['rise', false], ['crash', true]]) {
      const actions = {
        free: {
          value: 1, current: 1
        }, simple: {
          value: 2, current: 2
        }, complex: {
          value: 1, current: 1
        }
      }
      const system = {
        hasDNI: false, specialProperties: {
          actions
        }, addictions: []
      }
      const actor = {
        id: 'a1', name: 'Test', isToken: false, effects: [], items: [{
          _id: 'd1', id: 'd1', name: 'Jazz', type: 'itemDrug', system: {
            //The real Jazz gets its crash from durationContrecoup (its stat); this one is given a crash effect instead, so that it still has a crash: a drug without any is over at the end of its effect
            phase, isActive: !wasOn, wirelessTurnedOn: wasOn, systemEffects: [], customEffects: {
              0: {
                phase: 'crash'
              }
            }, handleShot: {
            }, onUse: {
              duration: '', contrecoup: ''
            }
          }
        }],
        system: new FakeSystem(system, system),
        update: vi.fn(async () => {}),
      }
      const sheet = Object.create(ActorSheetSR5.prototype)
      Object.defineProperty(sheet, 'actor', {
        value: actor
      })
      await sheet._onEditItemValue({
        currentTarget: {
          closest: () => ({
            dataset: {
              itemId: 'd1'
            }
          }),
          dataset: {
            binding: 'system.wirelessTurnedOn', dtype: 'Boolean'
          },
        },
        target: {
          value: ''
        },
      })
      const written = actor.update.mock.calls.at(-1)[0]
      expect(written.system.specialProperties.actions.free.current).toBe(1)
      expect(written.system.specialProperties.actions.simple.current).toBe(2)
      expect(written.items[0].system.phase).toBe(wasOn ? '' : 'crash')
    }
  })

  it('is a free action for everyone by default', async () => {
    const written = await switchWifi(false, false)
    expect(written.free.current).toBe(0)
    expect(written.simple.current).toBe(2)
  })

  it('turning it on is a simple action without a DNI when the world requires one', async () => {
    const written = await switchWifi(true, false, false)
    expect(written.free.current).toBe(1)
    expect(written.simple.current).toBe(1)
  })

  // SR5 p. 424: turning it off is always free, DNI or not
  it('turning it off is a free action even without a DNI when the world requires one', async () => {
    const written = await switchWifi(true, false, true)
    expect(written.free.current).toBe(0)
    expect(written.simple.current).toBe(2)
  })

  it('is a free action through a DNI when the world requires one', async () => {
    const written = await switchWifi(true, true)
    expect(written.free.current).toBe(0)
    expect(written.simple.current).toBe(2)
  })

  it('takes the free action it announces, not a simple one', async () => {
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue({
    })
    const actions = {
      free: {
        value: 1, current: 1
      }, simple: {
        value: 2, current: 2
      }, complex: {
        value: 1, current: 1
      }
    }
    const system = {
      specialProperties: {
        actions
      }
    }
    const gear = {
      _id: 'g1', id: 'g1', name: 'Commlink', type: 'itemGear', system: {
        wirelessTurnedOn: true, isActive: true
      }
    }
    const actor = {
      id: 'a1', name: 'Test', isToken: false, effects: [], items: [gear],
      system: new FakeSystem(system, system),
      update: vi.fn(async () => {}),
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      value: actor
    })

    await sheet._onEditItemValue({
      currentTarget: {
        closest: () => ({
          dataset: {
            itemId: 'g1'
          }
        }),
        dataset: {
          binding: 'system.wirelessTurnedOn', dtype: 'Boolean'
        },
      },
      target: {
        value: ''
      },
    })

    const written = actor.update.mock.calls.at(-1)[0].system.specialProperties.actions
    expect(written.free.current).toBe(0)
    expect(written.simple.current).toBe(2)
  })
})

// The action counters belong to the initiative passes (SR5 p. 163-165): out of combat a switch of the sheet
// spends nothing, where the free action used to sink to -1, -2... (RESTES l. 204 and 706)
describe('the switches of the sheet out of combat', () => {
  async function flip(type, binding, system, combatant){
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue(combatant)
    vi.spyOn(game.settings, 'get').mockReturnValue(false)
    const actions = {
      free: {
        value: 1, current: 1
      }, simple: {
        value: 2, current: 2
      }, complex: {
        value: 1, current: 1
      }
    }
    const data = {
      hasDNI: false, addictions: [], specialProperties: {
        actions
      }
    }
    const actor = {
      id: 'a1', name: 'Test', isToken: false, effects: [], items: [{
        _id: 'i1', id: 'i1', name: 'Switch', type, system: {
          ...system
        }
      }],
      system: new FakeSystem(data, data),
      update: vi.fn(async () => {}),
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      value: actor
    })
    await sheet._onEditItemValue({
      currentTarget: {
        closest: () => ({
          dataset: {
            itemId: 'i1'
          }
        }),
        dataset: {
          binding, dtype: 'Boolean'
        },
      },
      target: {
        value: ''
      },
    })
    return actor.update.mock.calls.at(-1)[0].system.specialProperties.actions
  }

  for (const [label, type, binding, system] of [
    ['a program', 'itemProgram', 'system.isActive', {
      isActive: true, type: 'common'
    }],
    ['a focus', 'itemFocus', 'system.isActive', {
      isActive: true
    }],
    ['a wireless', 'itemGear', 'system.wirelessTurnedOn', {
      wirelessTurnedOn: true, isActive: true
    }],
  ]) {
    it(`${label}: nothing is spent out of combat`, async () => {
      const written = await flip(type, binding, system, undefined)
      expect(written.free.current).toBe(1)
      expect(written.simple.current).toBe(2)
      expect(written.complex.current).toBe(1)
    })
  }

  it('a program in combat: still spent', async () => {
    const written = await flip('itemProgram', 'system.isActive', {
      isActive: true, type: 'common'
    }, {
    })
    expect(written.free.current).toBe(0)
  })
})

describe('toggles that cost an action, clicked twice before the server answers', () => {
  function sheetWith(items, update){
    const actions = {
      free: {
        value: 1, current: 1
      }, simple: {
        value: 2, current: 2
      }, complex: {
        value: 1, current: 1
      }
    }
    const system = {
      specialProperties: {
        actions
      }, addictions: []
    }
    const actor = {
      id: 'a1', name: 'Test', isToken: false, effects: [], items,
      system: new FakeSystem(system, system),
      update,
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      value: actor
    })
    return sheet
  }
  function click(sheet, itemId, binding){
    return sheet._onEditItemValue({
      currentTarget: {
        closest: () => ({
          dataset: {
            itemId
          }
        }),
        dataset: {
          binding, dtype: 'Boolean'
        },
      },
      target: {
        value: ''
      },
    })
  }
  function pair(type, name, system){
    return ['f1', 'f2'].map(id => ({
      _id: id, id, name: `${name} ${id}`, type, system: {
        ...system
      }
    }))
  }

  // The guard reads the counters before the first write lands: it says yes both times
  beforeEach(() => {
    vi.spyOn(SR5Combat, 'hasActionsLeft').mockReturnValue(true)
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue({
    })
  })
  afterEach(() => vi.restoreAllMocks())

  for (const [label, items, binding] of [
    ['deactivating a focus', pair('itemFocus', 'Focus', {
      isActive: true
    }), 'system.isActive'],
    ['unloading a program', pair('itemProgram', 'Program', {
      isActive: true
    }), 'system.isActive'],
    ['switching off the wireless', pair('itemGear', 'Commlink', {
      wirelessTurnedOn: true, isActive: true
    }), 'system.wirelessTurnedOn'],
  ]){
    it(`${label}: the second click waits for the first one to be written`, async () => {
      let answer
      const update = vi.fn(() => new Promise(r => answer = r))
      const sheet = sheetWith(items, update)

      const first = click(sheet, 'f1', binding)
      await click(sheet, 'f2', binding)
      expect(update).toHaveBeenCalledTimes(1)
      expect(update.mock.calls[0][0].system.specialProperties.actions.free.current).toBe(0)

      answer()
      await first
      update.mockImplementation(async () => {})
      await click(sheet, 'f2', binding)
      expect(update).toHaveBeenCalledTimes(2)
    })
  }

  it('gives the lock back when the handling throws right after taking it', async () => {
    const update = vi.fn(async () => {})
    const sheet = sheetWith(pair('itemFocus', 'Focus', {
      isActive: true
    }), update)
    vi.spyOn(foundry.utils, 'setProperty').mockImplementationOnce(() => {
      throw new Error('broken')
    })
    await expect(click(sheet, 'f1', 'system.isActive')).rejects.toThrow('broken')
    expect(update).not.toHaveBeenCalled()
    expect(sheet._spendingItemAction).toBeFalsy()
    await click(sheet, 'f2', 'system.isActive')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('lets the next click through when the write fails', async () => {
    const update = vi.fn(async () => {
      throw new Error('refused')
    })
    const sheet = sheetWith(pair('itemFocus', 'Focus', {
      isActive: true
    }), update)
    await expect(click(sheet, 'f1', 'system.isActive')).rejects.toThrow('refused')
    update.mockImplementation(async () => {})
    await click(sheet, 'f2', 'system.isActive')
    expect(update).toHaveBeenCalledTimes(2)
  })
})
