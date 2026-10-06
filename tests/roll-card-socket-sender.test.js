import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')

// Security 06/10: the GM side of "updateRollCard" rewrote any card with what any sender gave, so one line typed in a
// player's console changed the hits, the damage or the buttons of someone else's card
describe("the updateRollCard socket", () => {
  let update
  beforeEach(() => {
    vi.restoreAllMocks()
    update = vi.spyOn(SR5_RollMessage, 'updateRollCard').mockResolvedValue()
    const owned = {
      testUserPermission: (user) => user?.id === 'owner'
    }
    game.user = {
      id: 'gm', isGM: true
    }
    game.users = {
      get: (id) => ({
        id, isGM: id === 'gm2'
      })
    }
    game.actors = {
      get: (id) => id === 'a1' ? owned : undefined
    }
    game.scenes = {
      get: () => undefined
    }
    game.messages = {
      get: () => ({
        speaker: {
          actor: 'a1'
        }
      })
    }
  })
  const send = (senderId) => SR5_RollMessage._socketUpdateRollCard({
    data: {
      message: 'm1', newMessage: {
        roll: {
          hits: 30
        }
      }
    }
  }, senderId)

  it("is refused from a player who does not own the card's actor", async () => {
    await send('stranger')
    expect(update).not.toHaveBeenCalled()
  })

  it("is applied for the owner of the card's actor, and for a GM", async () => {
    await send('owner')
    await send('gm2')
    expect(update).toHaveBeenCalledTimes(2)
  })
})
