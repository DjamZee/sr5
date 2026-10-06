import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

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
import * as drugStat from '../modules/entities/items/drug-stat.js'

beforeEach(() => {
  globalThis.Roll = class {
    async evaluate(){
      return {
        total: 30
      }
    }
  }
})

// Chrome Flesh p. 194: "Si quelqu'un utilise une drogue sur mesure prévue pour quelqu'un d'autre,
// considérez-la comme ayant été préparée dans les rues."
const drug = (preparedFor, consumerId) => ({
  parent: consumerId ? {
    id: consumerId
  } : null,
  system: {
    speed: '', quality: 'custom', preparedFor
  }
})
const shots = item => SR5_CharacterUtility.handleDrugShots(item, {
  value: 'jazz'
}, {
  attributes: {
    body: {
      augmented: {
        value: 4
      }
    }
  }
})

describe('a custom drug prepared for someone', () => {
  it('its own consumer: crash divided by four (30 -> 7.5 min = 150 turns)', async () => {
    const stat = await shots(drug('pcA', 'pcA'))
    expect(stat.durationContrecoup).toBe(150)
    expect(stat.durationContrecoupType).toBe('combatTurn')
  })

  it('someone else: street drug, crash doubled (60 min)', async () => {
    const stat = await shots(drug('pcA', 'pcB'))
    expect(stat.durationContrecoup).toBe(60)
    expect(stat.durationContrecoupType).toBe('minute')
  })

  it('nobody named: stays custom for anyone (old drugs unchanged)', async () => {
    expect((await shots(drug('', 'pcB'))).durationContrecoup).toBe(150)
  })

  it('the quality used for the interaction roll follows the consumer', () => {
    const q = drugStat.effectiveDrugQuality
    expect(q({
      quality: 'custom', preparedFor: 'pcA'
    }, {
      id: 'pcB'
    })).toBe('street')
    expect(q({
      quality: 'custom', preparedFor: 'pcA'
    }, {
      id: 'pcA'
    })).toBe('custom')
    expect(q({
      quality: 'pharmaceutical', preparedFor: 'pcA'
    }, {
      id: 'pcB'
    })).toBe('pharmaceutical')
    // A mix of a custom drug and one used by the wrong person is not "all custom": +1, not -1
    expect(drugStat.drugInteractionModifier(['custom', q({
      quality: 'custom', preparedFor: 'pcA'
    }, {
      id: 'pcB'
    })])).toBe(1)
  })
})
