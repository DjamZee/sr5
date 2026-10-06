import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  sr5HookPreUpdateActor
} = await import('../modules/hooks/actor.js')
const {
  noteOverwatch, sr5HookOverwatchDrop, sr5HookPreUpdateTokenOverwatch, sr5HookPreUpdateActorDeltaOverwatch,
  sr5HookUpdateTokenOverwatch
} = await import('../modules/system/overwatch-guard.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

// A player lowered her own Overwatch Score by actor.update (Jakob, 4 -> 0). Her browser now drops the lowering unless
// a reboot asks for it; the GMs are told of every lowering a player writes.

const player = {
  id: 'p1', name: 'Joueuse', isGM: false
}
const gm = {
  id: 'gm', name: 'MJ', isGM: true
}
const deck = (score) => ({
  uuid: 'Actor.d', name: 'Decker', isToken: false, type: 'actorPc', items: [],
  _source: {
    system: {
      matrix: {
        overwatchScore: score
      }
    }
  },
  system: {
    matrix: {
      overwatchScore: score
    }
  },
})

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  game.users = {
    get: id => ({
      p1: player, gm
    })[id], activeGM: gm
  }
})

describe('a player writing her own Overwatch Score', () => {
  beforeEach(() => {
    game.user = player
  })

  it('a lowering is dropped, dotted or nested, the rest of the update kept', () => {
    const dotted = {
      'system.matrix.overwatchScore': 0, 'system.matrix.x': 1
    }
    sr5HookPreUpdateActor(deck(4), dotted, {
    })
    expect(dotted).toEqual({
      'system.matrix.x': 1
    })
    const nested = {
      system: {
        matrix: {
          overwatchScore: 0, x: 1
        }
      }
    }
    sr5HookPreUpdateActor(deck(4), nested, {
    })
    expect(nested.system.matrix).toEqual({
      x: 1
    })
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_OverwatchGMOnly')
  })

  it('a rise, the same score, and a reboot go through', () => {
    for (const [score, options] of [[6, {
    }], [4, {
    }], [0, {
      sr5OverwatchLower: 'reboot'
    }]]) {
      const changes = {
        'system.matrix.overwatchScore': score
      }
      sr5HookPreUpdateActor(deck(4), changes, options)
      expect(changes['system.matrix.overwatchScore']).toBe(score)
    }
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('the GM lowers it freely', () => {
    game.user = gm
    const changes = {
      'system.matrix.overwatchScore': 0
    }
    sr5HookPreUpdateActor(deck(4), changes, {
    })
    expect(changes['system.matrix.overwatchScore']).toBe(0)
  })
})

describe('the GMs told of a lowering', () => {
  beforeEach(() => {
    game.user = gm
    globalThis.ChatMessage = {
      create: vi.fn(async () => {}), getWhisperRecipients: () => [gm]
    }
  })

  it('a player\'s lowering is whispered to the GMs, with whether a reboot was announced', async () => {
    noteOverwatch(deck(4))
    await sr5HookOverwatchDrop(deck(0), {
      system: {
        matrix: {
          overwatchScore: 0
        }
      }
    }, {
      sr5OverwatchLower: 'reboot'
    }, 'p1')
    expect(ChatMessage.create).toHaveBeenCalledTimes(1)
    expect(ChatMessage.create.mock.calls[0][0].whisper).toEqual(['gm'])
  })

  it('a rise, a GM\'s lowering, or an update without the score say nothing', async () => {
    noteOverwatch(deck(4))
    await sr5HookOverwatchDrop(deck(6), {
      'system.matrix.overwatchScore': 6
    }, {
    }, 'p1')
    await sr5HookOverwatchDrop(deck(0), {
      'system.matrix.overwatchScore': 0
    }, {
    }, 'gm')
    noteOverwatch(deck(4))
    await sr5HookOverwatchDrop(deck(4), {
      name: 'x'
    }, {
    }, 'p1')
    expect(ChatMessage.create).not.toHaveBeenCalled()
  })
})

// Erna's review: the Emulate swap of an AI pushing her limit after the roll was dropped (Data Trails p. 159, 14 -> 11
// stayed 14), and an unlinked token's score was lowered through the token or its delta, unseen
describe('the lowerings Erna measured', () => {
  beforeEach(() => {
    game.user = player
  })

  it('the Emulate swap, written by the AI\'s owner, goes through as a lowering of her own', async () => {
    const ai = {
      ...deck(14), update: vi.fn(async (changes, options) => sr5HookPreUpdateActor(ai, changes, options))
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(ai)
    await SR5_ActorHelper.overwatchIncrease(-3, 'd')
    const [changes, options] = ai.update.mock.calls[0]
    expect(options).toEqual({
      sr5OverwatchLower: 'emulate'
    })
    expect(changes.system.matrix.overwatchScore).toBe(11)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('"system.matrix": {...} is read too', () => {
    const changes = {
      'system.matrix': {
        overwatchScore: 0, x: 1
      }
    }
    sr5HookPreUpdateActor(deck(4), changes, {
    })
    expect(changes).toEqual({
      'system.matrix': {
        x: 1
      }
    })
  })

  it('an unlinked token: a lowering through the token or its delta is dropped, a rise kept', () => {
    const token = {
      actorLink: false, actor: deck(8)
    }
    for (const changes of [{
      'delta.system.matrix.overwatchScore': 0
    }, {
      delta: {
        system: {
          matrix: {
            overwatchScore: 0
          }
        }
      }
    }, {
      'delta.system': {
        'matrix.overwatchScore': 0
      }
    }]) {
      sr5HookPreUpdateTokenOverwatch(token, changes, {
      })
      expect(JSON.stringify(changes)).not.toContain('overwatchScore')
    }
    const delta = {
      'system.matrix.overwatchScore': 1
    }
    sr5HookPreUpdateActorDeltaOverwatch({
      parent: token
    }, delta, {
    })
    expect(delta).toEqual({
    })
    const rise = {
      'delta.system.matrix.overwatchScore': 9
    }
    sr5HookPreUpdateTokenOverwatch(token, rise, {
    })
    expect(rise['delta.system.matrix.overwatchScore']).toBe(9)
  })

  it('the GMs are told of a lowering written in a token\'s delta', async () => {
    game.user = gm
    globalThis.ChatMessage = {
      create: vi.fn(async () => {}), getWhisperRecipients: () => [gm]
    }
    const before = {
      ...deck(8), isToken: true, token: {
        uuid: 'Scene.s.Token.t'
      }
    }
    noteOverwatch(before)
    await sr5HookUpdateTokenOverwatch({
      actorLink: false, actor: {
        ...before, system: {
          matrix: {
            overwatchScore: 0
          }
        }
      }
    }, {
      'delta.system.matrix.overwatchScore': 0
    }, {
    }, 'p1')
    expect(ChatMessage.create).toHaveBeenCalledTimes(1)
  })
})
