import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_MiscellaneousHelpers, CONSUMED_CARDS
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  healCardDiceKey
} = await import('../modules/system/heal-ledger.js')

// sr5ConsumedCards had no ceiling: 1.6 MB after 50 sessions of 300 cards, written whole at every card spent. The
// active GM purges it at load, in the register's turn: a key leaves only when its card is no longer in the chat log.

let store
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const gm = {
  id: 'gm', isGM: true
}
const diceCard = (dice) => ({
  owner: {
    actorId: 'healer', itemUuid: ''
  }, roll: {
    r: {
      terms: [{
        results: dice.map(result => ({
          result
        }))
      }]
    }
  }
})

beforeEach(() => {
  store = {
  }
  game.settings = {
    get: (s, k) => store[k],
    set: async (s, k, v) => {
      await tick()
      store[k] = JSON.parse(JSON.stringify(v))
      return v
    },
  }
  game.user = gm
  game.users = {
    get: id => (id === 'gm' ? gm : null), activeGM: gm
  }
  game.messages = new Map([
    ['aaaaaaaaaaaaaaa1', {
      id: 'aaaaaaaaaaaaaaa1', flags: {
        sr5data: diceCard([5, 6, 2])
      }
    }],
  ])
})

describe('the purge of the spent cards', () => {
  it('drops a key only when its card is gone from the chat log', async () => {
    const liveDice = `${healCardDiceKey(diceCard([5, 6, 2]))}|firstAid`
    const goneDice = `${healCardDiceKey(diceCard([1, 1, 4]))}|firstAid`
    store[CONSUMED_CARDS] = {
      'aaaaaaaaaaaaaaa1|overwatch|Scene.s.Token.t': 1,
      'bbbbbbbbbbbbbbb2|mark|': 1,
      'bbbbbbbbbbbbbbb2|firstAid|': 1,
      [liveDice]: 1,
      [goneDice]: 1,
      'Actor.a.Item.b|bbbbbbbbbbbbbbb2|def': 1,
    }
    await SR5_MiscellaneousHelpers.purgeConsumed()
    expect(Object.keys(store[CONSUMED_CARDS]).sort()).toEqual([
      'Actor.a.Item.b|bbbbbbbbbbbbbbb2|def', 'aaaaaaaaaaaaaaa1|overwatch|Scene.s.Token.t', liveDice,
    ].sort())
  })

  it('keeps a card spent while it purges', async () => {
    store[CONSUMED_CARDS] = {
      'bbbbbbbbbbbbbbb2|mark|': 1
    }
    await Promise.all([
      SR5_MiscellaneousHelpers.purgeConsumed(),
      SR5_MiscellaneousHelpers.consume('aaaaaaaaaaaaaaa1|mark|'),
    ])
    expect(Object.keys(store[CONSUMED_CARDS])).toEqual(['aaaaaaaaaaaaaaa1|mark|'])
  })

  it('is the active GM\'s alone', async () => {
    store[CONSUMED_CARDS] = {
      'bbbbbbbbbbbbbbb2|mark|': 1
    }
    game.users.activeGM = {
      id: 'other'
    }
    await SR5_MiscellaneousHelpers.purgeConsumed()
    expect(Object.keys(store[CONSUMED_CARDS])).toEqual(['bbbbbbbbbbbbbbb2|mark|'])
  })
})
