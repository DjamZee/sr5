import {
  describe, it, expect, vi
} from 'vitest'

const {
  SR5_SocketHandler
} = await import('../modules/socket.js')

// Security 06/10: a player's request went to the first GM connected, not to the active GM, and the handlers that
// write a ledger only for the active GM dropped it without a word when two GMs were connected
describe("emitForGM", () => {
  it("sends to the active GM, not to the first GM of the list", async () => {
    const first = {
      id: 'gm1', isGM: true, active: true
    }
    const activeGM = {
      id: 'gm2', isGM: true, active: true
    }
    const users = [first, activeGM]
    users.activeGM = activeGM
    game.user = {
      id: 'p', isGM: false
    }
    game.users = users
    const emit = vi.fn()
    game.socket = {
      emit
    }
    await SR5_SocketHandler.emitForGM('heal', {
    })
    expect(emit.mock.calls[0][1].userId).toBe('gm2')
  })
})

// Marta's measure (06/10): a message without userId, forged in a player's console, ran on every client. Both GMs
// were asked to confirm the same damage, and it was applied twice
describe("the socket router", () => {
  const listen = async () => {
    const {
      SR5_ActorHelper
    } = await import('../modules/entities/actors/entityActor-helpers.js')
    const takeDamage = vi.spyOn(SR5_ActorHelper, '_socketTakeDamage').mockResolvedValue()
    takeDamage.mockClear()
    let route
    game.socket = {
      on: (_name, handler) => route = handler
    }
    SR5_SocketHandler.registerSocketListeners()
    return {
      route, takeDamage
    }
  }
  const forged = {
    type: 'takeDamage', data: {
      actorId: 'npc', options: {
        damage: {
          value: 3, type: 'stun'
        }
      }
    }
  }

  it("runs nothing for a message that names no user", async () => {
    game.user = {
      id: 'gm1', isGM: true
    }
    const {
      route, takeDamage
    } = await listen()
    await route(forged, 'player')
    expect(takeDamage).not.toHaveBeenCalled()
  })

  it("runs a message on the user it names, and there only", async () => {
    const {
      route, takeDamage
    } = await listen()
    game.user = {
      id: 'gm2', isGM: true
    }
    await route({
      ...forged, userId: 'gm1'
    }, 'player')
    expect(takeDamage).not.toHaveBeenCalled()
    game.user = {
      id: 'gm1', isGM: true
    }
    await route({
      ...forged, userId: 'gm1'
    }, 'player')
    expect(takeDamage).toHaveBeenCalledTimes(1)
  })
})
