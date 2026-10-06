import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(), emitForPlayer: vi.fn(),
  },
}))

const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_GrappleHelpers
} = await import('../modules/rolls/roll-helpers/grapple.js')

// Last security pass before the djamz.11 (Olympe): the "actorRoll" socket rolled whatever card it was sent, for
// any sender. One line in a player's console had the GM (or another player) roll and post a resistance card of
// any damage, under his own name, so that every later check believed it.

const users = {
  gm: {
    id: 'gm', isGM: true
  },
  owner: {
    id: 'owner', isGM: false
  },
  stranger: {
    id: 'stranger', isGM: false
  },
}
const forged = {
  damage: {
    value: 99, type: 'physical'
  }, test: {
  }, owner: {
  }, previousMessage: {
  }
}

let actors
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = users.gm
  game.users = {
    get: id => users[id], activeGM: users.gm
  }
  actors = {
    held: {
      id: 'held', isOwner: true, effects: [{
        flags: {
          sr5: {
            grapple: {
              role: 'held', partner: 'holder'
            }
          }
        }
      }]
    },
    holder: {
      id: 'holder', testUserPermission: user => user?.id === 'owner', system: {
        attributes: {
          strength: {
            augmented: {
              value: 4
            }
          }
        }
      }
    },
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
  vi.spyOn(SR5_PrepareRollTest, 'rollTest').mockResolvedValue()
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    damage: {
    }, test: {
    }, owner: {
    }, previousMessage: {
    }
  }))
})

const send = (data, senderId, userId = 'gm') => SR5Actor._socketRollTest({
  userId, data
}, senderId)

describe('the actorRoll socket', () => {
  it('never rolls the card a player sends', async () => {
    await send({
      actorId: 'held', rollType: 'resistanceCard', chatData: forged
    }, 'stranger')
    expect(SR5_PrepareRollTest.rollTest).not.toHaveBeenCalled()
  })

  it('rolls a GM\'s request as sent (a resistance to an area spell)', async () => {
    game.user = users.owner
    await send({
      actorId: 'held', rollType: 'spellResistance', chatData: forged
    }, 'gm', 'owner')
    expect(SR5_PrepareRollTest.rollTest).toHaveBeenCalledWith(actors.held, 'spellResistance', undefined, forged)
  })

  it('builds the crush of a hold again, for the owner of the holder, never from the request (SR5 p. 196)', async () => {
    await send({
      actorId: 'held', rollType: 'resistanceCard', use: 'grappleCrush', holderId: 'holder', chatData: forged
    }, 'owner')
    const chatData = SR5_PrepareRollTest.rollTest.mock.calls[0]?.[3]
    expect(chatData?.damage.value).toBe(4)
    expect(chatData?.damage.type).toBe('stun')
  })

  it('refuses a crush from a player who holds nobody, or not that fighter', async () => {
    await send({
      actorId: 'held', rollType: 'resistanceCard', use: 'grappleCrush', holderId: 'holder'
    }, 'stranger')
    actors.held.effects = []
    await send({
      actorId: 'held', rollType: 'resistanceCard', use: 'grappleCrush', holderId: 'holder'
    }, 'owner')
    expect(SR5_PrepareRollTest.rollTest).not.toHaveBeenCalled()
  })

  it('is only rolled by the user it was sent to', async () => {
    await send({
      actorId: 'held', rollType: 'spellResistance', chatData: forged
    }, 'gm', null)
    expect(SR5_PrepareRollTest.rollTest).not.toHaveBeenCalled()
  })

  it('the crush of a hold sends only who crushes whom', async () => {
    const {
      SR5_SocketHandler
    } = await import('../modules/socket.js')
    game.user = users.owner
    actors.held.isOwner = false
    vi.spyOn(SR5_EntityHelpers, 'getUserOwner').mockReturnValue(null)
    await SR5_GrappleHelpers.crush('holder', 'held')
    expect(SR5_SocketHandler.emitForGM).toHaveBeenCalledWith('actorRoll', {
      actorId: 'held', rollType: 'resistanceCard', rollKey: null, use: 'grappleCrush', holderId: 'holder'
    })
  })
})
