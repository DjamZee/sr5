import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  cardNetHits, effectCardVerdict
} from '../modules/rolls/roll-helpers/effect-card.js'

//Pauline's remainder e: a spell nobody resists writes no net hits on its card. The GM's window read "?" for them, and
//an effect of net hits got 0. Its net hits are its hits over the threshold its description gives, if any (SR5 p. 284,
//step 4; p. 47, excess hits)
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

describe('cardNetHits', () => {
  it('gives the hits of a card without net hits, over its threshold', () => {
    expect(cardNetHits({
      hits: 4
    })).toBe(4)
    expect(cardNetHits({
      hits: 4
    }, 3)).toBe(1)
    expect(cardNetHits({
      hits: 2
    }, 3)).toBe(0)
  })
  it('keeps the net hits a resistance wrote', () => {
    expect(cardNetHits({
      hits: 4, netHits: 2
    })).toBe(2)
    expect(cardNetHits({
      hits: 4, netHits: 0
    })).toBe(0)
  })
})

describe("the GM's verdict on an unresisted spell card", () => {
  it('counts its net hits as its hits, without a mismatch', () => {
    const sixes = {
      terms: [{
        results: Array(3).fill({
          result: 6, active: true
        })
      }]
    }
    const v = effectCardVerdict({
      authorOwnsCaster: true, itemOnCaster: true, rollJSON: sixes, pool: 6, force: 6, magic: 6,
      claimedHits: 3, claimedNetHits: cardNetHits({
        hits: 3
      }),
    })
    expect([v.netHits, v.mismatch]).toEqual([3, false])
  })
})

describe('applyExternalEffect, a spell nobody resists', () => {
  const STOP = new Error('stop after creation')
  let created
  beforeEach(() => {
    vi.restoreAllMocks()
    created = undefined
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue({
      isToken: false, items: [],
      createEmbeddedDocuments: async (_, docs) => {
        created = docs[0]; throw STOP
      },
    })
    vi.spyOn(SR5_EntityHelpers, 'getLabelByKey').mockReturnValue('label')
    globalThis.fromUuid = async () => ({
      name: 'Diminution de Force', type: 'itemSpell', system: {
        itemRating: 0, targetOfEffect: [], systemEffects: {
        },
        customEffects: {
          0: {
            category: 'characterAttributes', target: 'system.attributes.strength.augmented', type: 'netHits', multiplier: -1, transfer: true
          }
        }
      }
    })
  })
  const apply = (roll, threshold) => SR5_ActorHelper.applyExternalEffect('target', {
    owner: {
      itemUuid: 'Item.spell', actorId: 'mage', speakerActor: 'Mage'
    },
    roll, threshold, test: {
      type: 'spell'
    },
  }, 'customEffects').catch(e => {
    if (e !== STOP) throw e
  })

  it('gives the effect its hits as net hits', async () => {
    await apply({
      hits: 3
    })
    expect(created['system.value']).toBe(-3)
  })
  it('takes its threshold off', async () => {
    await apply({
      hits: 3
    }, {
      value: 1
    })
    expect(created['system.value']).toBe(-2)
  })
})
