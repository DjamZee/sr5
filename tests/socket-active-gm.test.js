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
