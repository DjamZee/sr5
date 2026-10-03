// Head case Attribute Boost (Stolen Souls p. 201): Stun equal to the hits once it ends. Excess Stun
// carries half (rounded down) to Physical (SR5 p. 170), excess Physical to a PC's overflow (p. 172).
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
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

function collection(docs){
  const list = [...docs]
  list.get = (id) => list.find(d => d.id === id)
  return list
}

function monitor(max, damage){
  return {
    value: max, base: max, modifiers: [], actual: {
      value: damage, base: damage, modifiers: []
    }
  }
}

function boostedActor(stun, physical, overflow = 0){
  const boost = {
    id: 'boost', type: 'itemEffect', name: 'Augmentation',
    system: {
      type: 'naniteAttributeBoost', value: '4', durationType: 'round', duration: 1
    },
    update: vi.fn(async () => {}),
  }
  return {
    id: 'a1', name: 'Test', type: 'actorPc', isToken: false, effects: [], items: collection([boost]),
    system: {
      conditionMonitors: {
        stun: monitor(10, stun), physical: monitor(10, physical), overflow: monitor(4, overflow)
      }, specialProperties: {
      }
    },
    update: vi.fn(async () => {}),
    deleteEmbeddedDocuments: vi.fn(async () => {}),
  }
}

async function endBoost(actor){
  vi.spyOn(SR5Combat, 'getActorFromCombatant').mockReturnValue(actor)
  vi.spyOn(SR5_EntityHelpers, 'deleteEffectOnActor').mockImplementation(async () => {})
  vi.spyOn(SR5_ActorHelper, 'createKoEffect').mockImplementation(async () => {})
  vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
  await SR5Combat.manageTurnEnd({
    name: 'Test'
  })
  return actor.update.mock.calls.at(-1)[0]
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

describe('end of a nanite Attribute Boost', () => {
  it('fills Stun and carries half the excess to Physical', async () => {
    // 4 Stun on 9 of 10: 1 box fills the monitor, 3 left over, 1 goes to Physical
    const update = await endBoost(boostedActor(9, 2))
    expect(update['system.conditionMonitors.stun.actual.base']).toBe(10)
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(3)
    expect(SR5_ActorHelper.createKoEffect).toHaveBeenCalled()
  })

  it('carries a full Physical monitor into overflow, and kills past Body', async () => {
    const update = await endBoost(boostedActor(10, 10, 1))
    // 4 excess Stun, 2 Physical past a full monitor: overflow 1 + 2 = 3, Body 4 not exceeded
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(10)
    expect(update['system.conditionMonitors.overflow.actual.base']).toBe(3)
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()

    const deadly = await endBoost(boostedActor(10, 10, 3))
    expect(deadly['system.conditionMonitors.overflow.actual.base']).toBe(4)
    expect(SR5_ActorHelper.createDeadEffect).toHaveBeenCalled()
  })

  it('only adds Stun below the monitor', async () => {
    const update = await endBoost(boostedActor(2, 0))
    expect(update['system.conditionMonitors.stun.actual.base']).toBe(6)
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(0)
    expect(SR5_ActorHelper.createKoEffect).not.toHaveBeenCalled()
  })
})