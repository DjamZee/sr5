import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// The world setting "Vérifier les jets des joueurs et joueuses" (DjamZ, 08/10, off by default). Unchecked, a player's
// card on an actor she owns stands as written, as a GM's (cardOf's byGM): no hits counted again, no alert. Either way,
// a card on an actor its author does not own is refused, and the GM's say (grant) stays on a player's card.

const {
  playerRollsChecked, standsAsGM, PLAYER_ROLLS_SETTING
} = await import('../modules/rolls/roll-helpers/socket-guard.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  trustedMatrixAction
} = await import('../modules/rolls/roll-helpers/matrix-card.js')

const player = {
  id: 'p', name: 'Clo', isGM: false
}, stranger = {
  id: 's', name: 'Zed', isGM: false
}, gm = {
  id: 'g', name: 'MJ', isGM: true
}
const hacker = {
  id: 'h', uuid: 'Actor.h', name: 'Jean Bob', testUserPermission: user => user?.id === 'p', system: {
    specialAttributes: {
      edge: {
        augmented: {
          value: 2
        }
      }
    },
    matrix: {
      actions: {
        bruteForce: {
          limit: {
            linkedAttribute: 'attack', value: 0
          }, test: {
            dicePool: 2
          }
        }
      }
    },
  }
}
//A card that announces 5 hits on 30 dice, the sheet's pool 2: what the GM saw for Jean Bob (08/10)
const results = new Array(30).fill(0).map((_, i) => ({
  result: i < 25 ? 2 : 5, active: true
}))
const message = author => ({
  id: 'm1', author, flags: {
    sr5data: {
      owner: {
        actorId: 'h'
      }, test: {
        type: 'matrixAction', typeSub: 'bruteForce'
      }, roll: {
        hits: 5, r: {
          terms: [{
            results
          }]
        }
      }
    }
  }
})

let checked
beforeEach(() => {
  globalThis.game.settings = {
    get: (ns, key) => {
      if (key !== PLAYER_ROLLS_SETTING) throw new Error('not registered')
      return checked
    }
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'h' ? hacker : undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.settings
})

describe('the setting', () => {
  it('is read; without any setting (no world) the rolls are checked', () => {
    checked = false
    expect(playerRollsChecked()).toBe(false)
    checked = true
    expect(playerRollsChecked()).toBe(true)
    delete globalThis.game.settings
    expect(playerRollsChecked()).toBe(true)
  })
  it('a GM\'s card always stands as written; an owner\'s only while unchecked; nobody else\'s', () => {
    checked = false
    expect(standsAsGM(gm, false)).toBe(true)
    expect(standsAsGM(player, true)).toBe(true)
    expect(standsAsGM(stranger, false)).toBe(false)
    checked = true
    expect(standsAsGM(player, true)).toBe(false)
    expect(standsAsGM(null, true)).toBe(false)
  })
})

describe('cardOf, the single entry', () => {
  for (const [state, byGM] of [[false, true], [true, false]]) {
    it(`${state ? 'checked' : 'unchecked'}: the owner's card ${byGM ? 'stands as written' : 'is counted again'}, never a GM's`, async () => {
      checked = state
      game.messages = new Map([['m1', message(player)]])
      const card = SR5_MiscellaneousHelpers.cardOf('m1')
      expect(card.byGM).toBe(byGM)
      expect(card.gm).toBe(false)
      //The matrix action read again: 5 hits as written, or 0 counted on the 2 first dice, with the alert's overPool
      const action = await trustedMatrixAction({
        owner: {
          messageId: 'm1'
        }, roll: {
          hits: 5
        }
      }, {
        cardOf: id => SR5_MiscellaneousHelpers.cardOf(id),
        poolCap: (roller, path) => SR5_MiscellaneousHelpers.poolCap(roller, path),
      })
      expect(action.hits).toBe(byGM ? 5 : 0)
      expect(action.overPool ?? null).toEqual(byGM ? null : {
        dice: 30, cap: 4
      })
    })
  }
  it('refuses a card on an actor its author does not own, checked or not', () => {
    for (const state of [false, true]) {
      checked = state
      game.messages = new Map([['m1', message(stranger)]])
      expect(SR5_MiscellaneousHelpers.cardOf('m1')).toBe(null)
    }
  })
  it('keeps the GM\'s say on a player\'s card, unchecked too', async () => {
    checked = false
    game.messages = new Map([['m1', message(player)]])
    const card = SR5_MiscellaneousHelpers.cardOf('m1')
    const confirm = vi.spyOn(SR5_MiscellaneousHelpers, 'confirmUse').mockResolvedValue(false)
    expect(await SR5_MiscellaneousHelpers.grant({
      card, key: 'm1|use|x'
    }, player)).toBe(false)
    expect(confirm).toHaveBeenCalled()
  })
})
