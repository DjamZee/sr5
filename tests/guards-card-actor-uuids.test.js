import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')

// A scene copied with its tokens: the same token id on two scenes. The guards read a card's actors by id alone, where
// the action follows the card's uuid table (actorUuids, e66be4704): the guard and the action could aim at two
// different copies (Fritz, obs. 8). The guards now read the card's table too.

const UUID_B = 'Scene.s2.Token.t1'
let copyA, copyB
beforeEach(() => {
  vi.restoreAllMocks()
  copyA = {
    id: 't1', name: 'copie A', testUserPermission: () => false, system: {
    }
  }
  copyB = {
    id: 't1', name: 'copie B', testUserPermission: u => u?.id === 'owner', system: {
    }
  }
  //The viewed scene holds copy A; the card's table names copy B
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation((id, uuids) => {
    if (id && uuids?.[id] === UUID_B) return copyB
    return id === 't1' ? copyA : undefined
  })
})

const uuids = {
  t1: UUID_B
}

describe('the guards read a card the way its action does', () => {
  it('cardOf: the roller is the copy the card names, so its owner\'s card is believed', () => {
    const owner = {
      id: 'owner', isGM: false
    }
    game.messages = new Map([['m1', {
      id: 'm1', author: owner, flags: {
        sr5data: {
          owner: {
            actorId: 't1'
          }, actorUuids: uuids
        }
      }
    }]])
    const card = SR5_MiscellaneousHelpers.cardOf('m1')
    expect(card?.roller).toBe(copyB)
  })

  it('maglockUse: the lock aimed at is the copy the card names', () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue({
      data: {
        test: {
          type: 'skillDicePool', typeSub: 'locksmith'
        }, target: {
          actorId: 't1'
        }, actorUuids: uuids
      }, byGM: true
    })
    const hitsOf = vi.spyOn(SR5_MiscellaneousHelpers, 'hitsOf').mockReturnValue(null)
    SR5_MiscellaneousHelpers.maglockUse({
      messageId: 'm1'
    }, copyB, {
    })
    expect(hitsOf).toHaveBeenCalled()
  })

  it('matrixDamageOf: the attacker is the copy the card names', () => {
    const value = SR5_MiscellaneousHelpers.matrixDamageOf({
      byGM: true, data: {
        test: {
          type: 'matrixDefense'
        }, damage: {
          matrix: {
            value: 3
          }
        }, previousMessage: {
          actorId: 't1'
        }, actorUuids: uuids
      }
    }, {
      parent: copyB
    })
    expect(value).toBe(3)
  })

  it('mark.js: markCards, overwatchUse and eraseUse read the defense card\'s table', async () => {
    const defense = {
      byGM: true, data: {
        test: {
          type: 'matrixDefense'
        }, matrix: {
          overwatchScore: true
        }, roll: {
          hits: 2
        }, previousMessage: {
          actorId: 't1', messageId: 'm0'
        }, actorUuids: uuids
      }
    }
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(defense)
    await SR5_MarkHelpers.overwatchUse('m1', copyB)
    await SR5_MarkHelpers.markCards('m1').catch(() => null)
    defense.data.test.type = 'eraseMark'
    await SR5_MarkHelpers.eraseUse('m1').catch(() => null)
    const calls = SR5_EntityHelpers.getRealActorFromID.mock.calls.filter(([id]) => id === 't1')
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call[1]).toBe(uuids)
  })
})
