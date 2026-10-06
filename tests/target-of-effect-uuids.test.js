import {
  describe, it, expect, vi
} from 'vitest'

// Stand-ins for Foundry's data fields, casting a value as Foundry 13.351 does (common/data/fields.mjs)
vi.hoisted(() => {
  globalThis.foundry.abstract.TypeDataModel.migrateData ??= (source) => source
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
  class StringField extends Field {
    _cast(value) {
      return String(value)
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
  }
  globalThis.foundry.data = {
    fields: new Proxy({
      SchemaField, StringField, ArrayField, ObjectField
    }, {
      get: (target, name) => target[name] ?? Field
    })
  }
})

import {
  sr5ItemSpellDataModel
} from '../modules/datamodels/items/itemSpell.js'
import {
  sr5ItemComplexFormDataModel
} from '../modules/datamodels/items/itemComplexForm.js'
import {
  sr5ItemPowerDataModel
} from '../modules/datamodels/items/itemPower.js'
import {
  sr5ItemAdeptPowerDataModel
} from '../modules/datamodels/items/itemAdeptPower.js'
import {
  sr5ItemMartialArtDataModel
} from '../modules/datamodels/items/itemMartialArt.js'
import {
  migrateTargetOfEffect
} from '../modules/datamodels/common/targetOfEffectMigration.js'

const UUID = 'Actor.abc.Item.def'

describe('targetOfEffect stores the uuids pushed by linkEffectToSource', () => {
  it.each([
    ['itemSpell', sr5ItemSpellDataModel],
    ['itemComplexForm', sr5ItemComplexFormDataModel],
    ['itemPower', sr5ItemPowerDataModel],
    ['itemAdeptPower', sr5ItemAdeptPowerDataModel],
    ['itemMartialArt', sr5ItemMartialArtDataModel],
  ])('%s keeps a uuid as a string, not as {}', (type, model) => {
    const field = model.defineSchema().targetOfEffect
    expect(field.element._cast(UUID)).toBe(UUID)
  })
})

describe('items saved with the former schema', () => {
  it('drops the empty objects, keeps the uuids', () => {
    const source = {
      targetOfEffect: [{
      }, UUID, {
      }, '']
    }
    migrateTargetOfEffect(source)
    expect(source.targetOfEffect).toEqual([UUID])
  })

  it('leaves items without the field alone, and can run twice', () => {
    const none = {
      hits: 2
    }
    migrateTargetOfEffect(none)
    expect(none).toEqual({
      hits: 2
    })
    const source = {
      targetOfEffect: [UUID]
    }
    migrateTargetOfEffect(source)
    migrateTargetOfEffect(source)
    expect(source.targetOfEffect).toEqual([UUID])
  })
})
