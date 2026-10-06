import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  onUserConnected, pendingRelays
} = await import('../modules/system/relay-watch.js')

// Séance F, T12 (DjamZ, 06/10): a player sends damage on an NPC, the window opens on the active GM, who leaves
// without answering (Marta's F7). Nothing reached the new active GM and the player was told nothing. She is now told
// to click again; nothing is replayed

const gm1 = {
  id: 'gm1', isGM: true, active: true, name: 'MJ2'
}
const gm2 = {
  id: 'gm2', isGM: true, active: true, name: 'Gamemaster'
}
let sent
beforeEach(() => {
  sent = []
  const users = [gm1, gm2]
  users.activeGM = gm1
  game.users = users
  game.user = {
    id: 'p1', isGM: false
  }
  game.socket = {
    emit: vi.fn(async (_name, message) => sent.push(message))
  }
  ui.notifications.warn = vi.fn()
  // the requests left by a previous test
  onUserConnected(gm1, false)
  onUserConnected(gm2, false)
  ui.notifications.warn.mockClear()
})

describe('a request relayed to the GM', () => {
  it('is told lost when its GM disconnects before answering', async () => {
    await SR5_SocketHandler.emitForGM('takeDamage', {
      actorId: 'npc'
    })
    expect(sent[0].relayId).toBeTruthy()
    expect(pendingRelays()).toBe(1)

    // another GM leaving, or a GM connecting, changes nothing
    expect(onUserConnected(gm2, false)).toBe(0)
    expect(onUserConnected(gm1, true)).toBe(0)
    expect(onUserConnected({
      id: 'p2', isGM: false
    }, false)).toBe(0)
    expect(ui.notifications.warn).not.toHaveBeenCalled()

    expect(onUserConnected(gm1, false)).toBe(1)
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1)
    expect(ui.notifications.warn.mock.calls[0][0]).toBe('SR5.WARN_RelayLost')
    expect(pendingRelays()).toBe(0)
  })

  it('is forgotten once the GM is done with it, his answer included', async () => {
    await SR5_SocketHandler.emitForGM('heal', {
    })
    const request = sent[0]

    // on the GM's browser: the handler, then the acknowledgment to the sender
    // the handler is spied before the router keeps it
    const {
      SR5_ActorHelper
    } = await import('../modules/entities/actors/entityActor-helpers.js')
    const heal = vi.spyOn(SR5_ActorHelper, '_socketHeal').mockResolvedValue()
    let route
    game.socket.on = (_name, handler) => route = handler
    SR5_SocketHandler.registerSocketListeners()
    game.user = gm1
    await route(request, 'p1')
    expect(heal).toHaveBeenCalledTimes(1)
    const ack = sent.at(-1)
    expect(ack).toMatchObject({
      type: 'relayDone', userId: 'p1', data: {
        relayId: request.relayId
      }
    })

    // back on the player's browser
    game.user = {
      id: 'p1', isGM: false
    }
    await route(ack, 'gm1')
    expect(pendingRelays()).toBe(0)
    expect(onUserConnected(gm1, false)).toBe(0)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('is acknowledged even when its handler fails', async () => {
    await SR5_SocketHandler.emitForGM('takeDamage', {
      actorId: 'npc'
    })
    const {
      SR5_ActorHelper
    } = await import('../modules/entities/actors/entityActor-helpers.js')
    vi.spyOn(SR5_ActorHelper, '_socketTakeDamage').mockRejectedValue(new Error('boom'))
    let route
    game.socket.on = (_name, handler) => route = handler
    SR5_SocketHandler.registerSocketListeners()
    game.user = gm1
    await expect(route(sent[0], 'p1')).rejects.toThrow('boom')
    expect(sent.at(-1).type).toBe('relayDone')
  })
})
