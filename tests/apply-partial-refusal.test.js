import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//Fritz's S2 on Pauline's remainder c: a spell with a damage entry and an attribute entry. The GM declined the damage,
//the attribute was posed, and applyExternalEffect said "refused": the card kept its button and a second click posed the
//attribute twice. Something posed spends the card
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

const DAMAGE = {
  category: 'conditionMonitors', target: 'stun.addDamage', type: 'value', value: 2, transfer: true
}
const ATTRIBUTE = {
  category: 'characterAttributes', target: 'system.attributes.strength.augmented', type: 'value', value: -1, transfer: true
}

let created
function target() {
  created = []
  return {
    name: 'Cible', isToken: false, isOwner: true, items: [],
    system: {
      conditionMonitors: {
        stun: {
          value: 10, actual: {
            base: 0, value: 0
          }
        }
      }
    },
    createEmbeddedDocuments: async (_, docs) => docs.map(d => {
      const doc = {
        uuid: `Actor.c.Item.${created.length}`, system: {
        }
      }
      created.push(d)
      return doc
    }),
  }
}

const apply = entries => {
  globalThis.fromUuid = async () => ({
    name: 'Sort', type: 'itemSpell', system: {
      itemRating: 0, targetOfEffect: [], systemEffects: {
      }, customEffects: entries
    }
  })
  return SR5_ActorHelper.applyExternalEffect('c', {
    owner: {
      itemUuid: 'Actor.m.Item.s', actorId: 'm', speakerActor: 'Mage'
    },
    roll: {
      hits: 3, netHits: 3
    }, test: {
      type: 'spell'
    },
  }, 'customEffects')
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(target())
  vi.spyOn(SR5_EntityHelpers, 'getLabelByKey').mockReturnValue('label')
  vi.spyOn(SR5_ActorHelper, 'confirmUnresistedDamage').mockResolvedValue(false)
  vi.spyOn(SR5_ActorHelper, 'linkEffectToSource').mockResolvedValue()
  game.user = {
    isGM: true
  }
})

describe('applyExternalEffect, damage declined', () => {
  it('spends the card when another entry was posed', async () => {
    expect(await apply({
      0: DAMAGE, 1: ATTRIBUTE
    })).toBe(true)
    expect(created).toHaveLength(1)
  })
  it('keeps it when nothing was posed', async () => {
    expect(await apply({
      0: DAMAGE
    })).toBe(false)
    expect(created).toHaveLength(0)
  })
})
