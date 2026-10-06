import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Dispelling (SR5 p. 298) lowers the net hits of the spell: an effect whose value came from the hits loses
// as many, an effect of a fixed value keeps it. reduceTransferedEffect used to write the hits left into
// every effect, so an Armor +2 became 3 (found by Delphine)

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ThirdPartyHelpers
} = await import('../modules/rolls/roll-helpers/thirdparty.js')
const {
  sourceEntryOf, dispelledValue
} = await import('../modules/rolls/roll-helpers/dispel-rules.js')

function effectItem(uuid, target, value, category = 'armors', sourceEntry) {
  const system = {
    value, target: 'label', customEffects: {
      0: {
        category, target, type: 'value', value, forceAdd: true
      }
    }
  }
  return {
    uuid, system, flags: sourceEntry === undefined ? {
    } : {
      sr5: {
        sourceEntry
      }
    }, update: vi.fn(async () => {}), toObject: () => ({
      system: structuredClone(system)
    })
  }
}

let docs
beforeEach(() => {
  globalThis.game = {
    i18n: {
      localize: k => k, format: k => k
    }, user: {
      isGM: true
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  docs = {
  }
  globalThis.fromUuid = vi.fn(async uuid => docs[uuid] ?? null)
})

function spellWith(entries, hits, held) {
  const system = {
    hits, isActive: true, customEffects: entries, itemEffects: {
    }, targetOfEffect: held
  }
  return {
    type: 'itemSpell', system, update: vi.fn(async () => {})
  }
}

describe('dispelling part of a spell', () => {
  it('keeps a fixed value and lowers what came from the hits', async () => {
    const spell = spellWith({
      0: {
        transfer: true, category: 'armors', target: 'system.itemsProperties.armor', type: 'value', value: 2
      },
      1: {
        transfer: true, category: 'limits', target: 'system.limits.physicalLimit', type: 'hits', multiplier: 1
      },
    }, 5, ['A.fixed', 'A.hits'])
    docs['Actor.s.Item.spell'] = spell
    docs['A.fixed'] = effectItem('A.fixed', 'system.itemsProperties.armor', 2)
    docs['A.hits'] = effectItem('A.hits', 'system.limits.physicalLimit', 5, 'limits')

    await SR5_ThirdPartyHelpers.reduceTransferedEffect({
      target: {
        itemUuid: 'Actor.s.Item.spell'
      }, roll: {
        netHits: 2
      }, owner: {
      }
    })

    expect(docs['A.fixed'].update).not.toHaveBeenCalled()
    const lowered = docs['A.hits'].update.mock.calls[0][0].system
    expect(lowered.value).toBe(3)
    expect(lowered.customEffects[0].value).toBe(3)
    expect(spell.update.mock.calls[0][0].system.hits).toBe(3)
  })
})

describe('two entries of one spell on the same target', () => {
  it('tells them apart by the entry the effect was made from', async () => {
    const spell = spellWith({
      0: {
        transfer: true, category: 'armors', target: 'system.itemsProperties.armor', type: 'hits'
      },
      1: {
        transfer: true, category: 'armors', target: 'system.itemsProperties.armor', type: 'value', value: 2
      },
    }, 3, ['A.hits', 'A.fixed'])
    docs['Actor.s.Item.spell'] = spell
    docs['A.hits'] = effectItem('A.hits', 'system.itemsProperties.armor', 3, 'armors', '0')
    docs['A.fixed'] = effectItem('A.fixed', 'system.itemsProperties.armor', 2, 'armors', '1')
    await SR5_ThirdPartyHelpers.reduceTransferedEffect({
      target: {
        itemUuid: 'Actor.s.Item.spell'
      }, roll: {
        netHits: 2
      }, owner: {
      }
    })
    expect(docs['A.hits'].update.mock.calls[0][0].system.value).toBe(1)
    expect(docs['A.fixed'].update).not.toHaveBeenCalled()
  })
})

describe('the GM guard of a player dispelling by socket', async () => {
  const {
    reduceAllowed
  } = await import('../modules/rolls/roll-helpers/socket-guard.js')
  it('lets a malus go back up toward 0, never past it nor further down', () => {
    expect(reduceAllowed({
      value: -1, customEffects: {
        0: {
          value: -1
        }
      }
    }, {
      value: -3, customEffects: {
        0: {
          value: -3
        }
      }
    }, 2, true)).toBe(true)
    expect(reduceAllowed({
      value: 1
    }, {
      value: -3
    }, 2, true)).toBe(false)
    expect(reduceAllowed({
      value: -4
    }, {
      value: -3
    }, 2, true)).toBe(false)
    expect(reduceAllowed({
      value: 4
    }, {
      value: 3
    }, 2, true)).toBe(false)
  })
  it('reads a list of custom effects sent whole, the value alone may change (measured in play)', () => {
    const entry = {
      category: 'characterAttributes', forceAdd: true, target: 'system.attributes.strength.augmented', type: 'value'
    }
    const stored = {
      value: '-2', customEffects: [{
        ...entry, value: -2
      }]
    }
    expect(reduceAllowed({
      value: 0, customEffects: [{
        ...entry, value: 0
      }]
    }, stored, 3, true)).toBe(true)
    expect(reduceAllowed({
      value: 0, customEffects: [{
        ...entry, target: 'system.attributes.body.augmented', value: 0
      }]
    }, stored, 3, true)).toBe(false)
  })
})

describe('dispelledValue', () => {
  it('reads the multiplier of the source entry', () => {
    expect(dispelledValue({
      type: 'netHits', multiplier: 2
    }, 6, 2)).toBe(2)
    expect(dispelledValue({
      type: 'hitsReplace'
    }, 4, 1)).toBe(3)
  })
  it('brings a malus back toward 0 (Decrease Strength, -1 per net hit), never past it', () => {
    expect(dispelledValue({
      type: 'netHits', multiplier: -1
    }, -3, 2)).toBe(-1)
    expect(dispelledValue({
      type: 'netHits', multiplier: -1
    }, -3, 5)).toBe(0)
  })
  it('never goes below 0, and leaves fixed values and ratings alone', () => {
    expect(dispelledValue({
      type: 'hits'
    }, 2, 5)).toBe(0)
    expect(dispelledValue({
      type: 'value', value: 2
    }, 2, 1)).toBeNull()
    expect(dispelledValue({
      type: 'rating'
    }, 3, 1)).toBeNull()
    expect(dispelledValue(null, 3, 1)).toBeNull()
  })
  it('finds the entry by target, then category', () => {
    const entries = {
      0: {
        transfer: true, target: 't', category: 'a', type: 'value'
      }, 1: {
        transfer: true, target: 't', category: 'b', type: 'hits'
      }, 2: {
        transfer: false, target: 'u', type: 'hits'
      }
    }
    expect(sourceEntryOf(entries, 't', 'b').type).toBe('hits')
    expect(sourceEntryOf(entries, 'u')).toBeNull()
  })
})
