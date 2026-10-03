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
    expect(actor.updateEmbeddedDocuments.mock.calls[0][1][0].system.itemEffects[0].value).toBe(-2)
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
  it('rolls 10D6 once for Jazz and stores that duration', async () => {
    rollTotals(30)
    const {
      actor, sheet
    } = drugSheet([drugItem('jazz', 'Jazz', 'jazz')])

    await take(sheet, 'jazz')

    expect(rolled).toEqual(['10d6'])
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

    expect(rolled).toEqual(['10d6', '1d6'])
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
})

describe('a bound spirit spends a service when it aids a test (SR5 p. 305-306)', () => {
  function spiritAid(modifiers){
    const spiritItem = {
      id: 's1', name: 'Esprit', system: {
        services: {
          value: 3
        }
      }, update: vi.fn(async () => {}),
    }
    const spiritActor = {
      system: {
        creatorItemId: 's1', services: {
          value: 3
        }
      }, update: vi.fn(async () => {}),
    }
    globalThis.fromUuid = vi.fn(async () => spiritItem)
    globalThis.game.actors = [spiritActor]
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
