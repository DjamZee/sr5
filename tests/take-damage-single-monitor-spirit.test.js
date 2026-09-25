import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes into CONFIG at import time; the data models read foundry.data.fields
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  // Minimal field classes: enough to build the initial source a schema gives a new document
  class Field {
    constructor(options = {
    }) {
      this.options = options
    }
    initial() {
      return this.options.initial
    }
  }
  class SchemaField extends Field {
    constructor(fields, options) {
      super(options)
      this.fields = fields
    }
    initial() {
      return Object.fromEntries(Object.entries(this.fields).map(([k, f]) => [k, f.initial()]))
    }
  }
  class ArrayField extends Field {
    initial() {
      return []
    }
  }
  class ObjectField extends Field {
    initial() {
      return this.options.initial ?? {
      }
    }
  }
  globalThis.foundry.data = {
    fields: {
      SchemaField, ArrayField, ObjectField,
      NumberField: Field, StringField: Field, BooleanField: Field,
    }
  }
})

import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  sr5ActorSpiritDataModel
} from '../modules/datamodels/actors/actorSpirit.js'

function monitor(max, damage = 0){
  return {
    value: max, base: max, modifiers: [], actual: {
      value: damage, base: damage, modifiers: []
    }, boxes: []
  }
}

function flatten(obj, prefix = '', out = {
}){
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out)
    else out[path] = v
  }
  return out
}

// A homunculus as Foundry holds it: the source is what the data model keeps,
// the prepared data is what updateConditionMonitors computes (single monitor, no Physical/Stun).
function fakeHomunculus(max){
  const source = {
    type: 'actorSpirit', system: {
      ...Object.fromEntries(Object.entries(sr5ActorSpiritDataModel.defineSchema()).map(([k, f]) => [k, f.initial()])),
      type: 'homunculus',
    }
  }
  const prepared = JSON.parse(JSON.stringify(source.system))
  prepared.conditionMonitors = {
    condition: monitor(max)
  }
  prepared.limits = {
    physicalLimit: {
      value: 6
    }
  }
  prepared.itemsProperties = {
    armor: {
      value: 0
    }
  }
  const actor = {
    id: 's1', type: 'actorSpirit', name: 'Homoncule',
    effects: [],
    system: prepared,
    _source: source,
    toObject: (s = true) => JSON.parse(JSON.stringify(s ? source : {
      type: 'actorSpirit', system: prepared
    })),
    toJSON: () => source,
    // A data model drops what its schema does not define: keep only the paths the source has
    update: vi.fn(async (data) => {
      for (const [path, value] of Object.entries(flatten(data))) {
        if (!path.startsWith('system.')) continue
        const key = path.slice(7)
        if (foundry.utils.getProperty(source.system, key) === undefined) continue
        foundry.utils.setProperty(source.system, key, value)
        // Preparation recomputes the maxima: only the damage taken reaches the prepared data
        if (key.includes('.actual.')) foundry.utils.setProperty(prepared, key, value)
      }
    }),
  }
  return actor
}

function hit(value, type = 'physical'){
  return {
    damage: {
      value, type, matrix: {
        value: 0
      }, element: ''
    },
    combat: {
      ammo: {
      }
    },
    threshold: {
    },
  }
}

let actor, status
beforeEach(() => {
  status = []
  globalThis.ui.notifications.info ??= () => {}
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => actor)
  vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => status.push('dead'))
  vi.spyOn(SR5_ActorHelper, 'createKoEffect').mockImplementation(async () => status.push('ko'))
  vi.spyOn(SR5_ActorHelper, 'createProneEffect').mockImplementation(async () => status.push('prone'))
})

describe('takeDamage on a single-monitor spirit (homunculus, watcher)', () => {
  it('the spirit schema stores a condition monitor', () => {
    const fields = sr5ActorSpiritDataModel.defineSchema().conditionMonitors.fields
    expect(fields.condition?.fields?.actual).toBeTruthy()
  })

  it('a homunculus takes 9P without crashing, and the damage is kept', async () => {
    actor = fakeHomunculus(10)
    await SR5_ActorHelper.takeDamage('s1', hit(9))
    expect(actor._source.system.conditionMonitors.condition.actual.base).toBe(9)
    expect(status).toEqual([])
  })

  it('a full monitor destroys the homunculus', async () => {
    actor = fakeHomunculus(10)
    await SR5_ActorHelper.takeDamage('s1', hit(11))
    expect(status).toEqual(['dead'])
  })
})
