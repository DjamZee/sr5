import {
  describe, it, expect, beforeEach, afterEach, vi
} from 'vitest'
import fs from 'node:fs'
import {
  convergenceTeller, mergePending, pendingIn, pendingStillDue, requestConvergenceNotice, postPendingNotice,
  applyConvergenceNotice, registerConvergenceWatch, CONVERGENCE_PENDING_FLAG
} from '../modules/system/convergence-threshold.js'
import {
  foundryHooks
} from './fixtures/foundry-hooks.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

// Relecture du 21/10, D5: the card of the convergence is written by the active gamemaster's browser only. Any other
// leaves it pending on the actor; with no gamemaster connected, it is posted at their return.
describe('who tells the card', () => {
  it('the active gamemaster posts; the writer defers when no gamemaster is connected; Matrice silences all', () => {
    expect(convergenceTeller({
      activeGM: true, gmConnected: true
    })).toBe('post')
    expect(convergenceTeller({
      gmConnected: false, writer: true
    })).toBe('defer')
    expect(convergenceTeller({
      gmConnected: false, writer: false
    })).toBeNull()
    expect(convergenceTeller({
      gmConnected: true, writer: true
    })).toBeNull()
    expect(convergenceTeller({
      activeGM: true, matrice: true
    })).toBeNull()
  })
  it('a pending card stays forced, is read from an update, and a crossing waits on the score', () => {
    expect(mergePending({
      forced: true
    }, {
      forced: false
    })).toEqual({
      forced: true
    })
    expect(mergePending(undefined, {
    })).toEqual({
      forced: false
    })
    expect(pendingIn({
      flags: {
        sr5: {
          [CONVERGENCE_PENDING_FLAG]: {
            forced: false
          }
        }
      }
    })).toEqual({
      forced: false
    })
    expect(pendingIn({
      flags: {
        sr5: {
          [`-=${CONVERGENCE_PENDING_FLAG}`]: null
        }
      }
    })).toBeNull()
    expect(pendingStillDue({
      forced: false
    }, 41, 40)).toBe(true)
    expect(pendingStillDue({
      forced: false
    }, 0, 40)).toBe(false)
    expect(pendingStillDue({
      forced: true
    }, 0, 40)).toBe(true)
    expect(pendingStillDue(null, 50, 40)).toBe(false)
  })
})

describe('in Foundry', () => {
  const saved = {
  }
  let created, matrice, hooks

  function persona(flags = {
  }, score = 41) {
    const actor = {
      uuid: 'Actor.dk', name: 'Decker', type: 'actorPc', flags: {
        sr5: {
          ...flags
        }
      },
      items: [{
        type: 'itemDevice', system: {
          isActive: true
        }
      }],
      system: {
        matrix: {
          overwatchScore: score, programs: {
          }
        }
      },
      update: vi.fn(async changes => {
        for (const [key, value] of Object.entries(changes)) {
          const name = key.split('.').pop()
          if (name.startsWith('-=')) delete actor.flags.sr5[name.slice(2)]
          else actor.flags.sr5[name] = value
        }
        return actor
      }),
    }
    return actor
  }
  function browser({
    gm, gmConnected = gm
  }) {
    const user = {
      id: gm ? 'gm' : 'player', isGM: gm
    }
    Object.assign(globalThis.game, {
      user, users: {
        activeGM: gmConnected ? {
          id: 'gm'
        } : null
      },
      modules: {
        get: () => ({
          active: matrice
        })
      },
      actors: [], scenes: [],
    })
  }

  beforeEach(() => {
    for (const key of ['user', 'users', 'modules', 'actors', 'scenes']) saved[key] = globalThis.game[key]
    saved.ChatMessage = globalThis.ChatMessage
    saved.Hooks = globalThis.Hooks
    saved.escape = globalThis.foundry.utils.escapeHTML
    created = []
    matrice = false
    globalThis.foundry.utils.escapeHTML ??= text => text
    globalThis.ChatMessage = {
      create: vi.fn(async data => created.push(data)), getWhisperRecipients: () => [{
        id: 'gm'
      }]
    }
    hooks = foundryHooks()
    globalThis.Hooks = hooks
  })
  afterEach(() => {
    for (const key of ['user', 'users', 'modules', 'actors', 'scenes']) globalThis.game[key] = saved[key]
    globalThis.ChatMessage = saved.ChatMessage
    globalThis.Hooks = saved.Hooks
    globalThis.foundry.utils.escapeHTML = saved.escape
  })

  it('a forced card rolled on a player\'s browser is left pending, never whispered from there', async () => {
    browser({
      gm: false, gmConnected: true
    })
    const actor = persona()
    await requestConvergenceNotice(actor, {
      forced: true
    })
    expect(created).toHaveLength(0)
    expect(actor.flags.sr5[CONVERGENCE_PENDING_FLAG]).toEqual({
      forced: true
    })
  })
  it('the active gamemaster posts a pending card once, to the gamemasters, and clears it', async () => {
    browser({
      gm: true
    })
    const actor = persona({
      [CONVERGENCE_PENDING_FLAG]: {
        forced: true
      }
    }, 0)
    await postPendingNotice(actor)
    expect(created).toHaveLength(1)
    expect(created[0].whisper).toEqual(['gm'])
    expect(created[0].flags.sr5.convergence.forced).toBe(true)
    expect(actor.flags.sr5[CONVERGENCE_PENDING_FLAG]).toBeUndefined()
    await postPendingNotice(actor)
    expect(created).toHaveLength(1)
  })
  it('a crossing with no gamemaster connected is posted at their return (ready), not lost', async () => {
    // The player's browser wrote the rise from 38 to 41: no gamemaster, it leaves the card pending
    browser({
      gm: false, gmConnected: false
    })
    registerConvergenceWatch()
    const actor = persona({
    }, 41)
    hooks.callAll('updateActor', actor, {
      system: {
        matrix: {
          overwatchScore: 41
        }
      }
    }, {
      sr5OverwatchPrevious: 38
    }, 'player')
    await vi.waitFor(() => expect(actor.flags.sr5[CONVERGENCE_PENDING_FLAG]).toEqual({
      forced: false
    }))
    expect(created).toHaveLength(0)
    // The gamemaster logs in
    browser({
      gm: true
    })
    globalThis.game.actors = [actor]
    hooks.callAll('ready')
    await vi.waitFor(() => expect(created).toHaveLength(1))
    expect(actor.flags.sr5[CONVERGENCE_PENDING_FLAG]).toBeUndefined()
  })
  it('a crossing pending, then a reboot: no card at the gamemaster\'s return', async () => {
    browser({
      gm: true
    })
    await postPendingNotice(persona({
      [CONVERGENCE_PENDING_FLAG]: {
        forced: false
      }
    }, 0))
    expect(created).toHaveLength(0)
  })
  it('with the module Matrice active, nothing is asked nor posted', async () => {
    matrice = true
    browser({
      gm: false, gmConnected: true
    })
    const actor = persona()
    await requestConvergenceNotice(actor, {
      forced: true
    })
    expect(actor.update).not.toHaveBeenCalled()
    browser({
      gm: true
    })
    await requestConvergenceNotice(actor, {
      forced: true
    })
    expect(created).toHaveLength(0)
  })
  it('the redefine-ownership glitch asks, never posts, and a failed convergence does not read « appliquée »', () => {
    const roll = read('../modules/rolls/roll-test-case/test-MatrixAction.js')
    expect(roll).toMatch(/requestConvergenceNotice\(actor, \{\s*forced: true/)
    expect(roll).not.toMatch(/postConvergenceNotice/)
    const source = read('../modules/system/convergence-threshold.js')
    const apply = source.slice(source.indexOf('export async function applyConvergenceNotice'))
    expect(apply).toMatch(/catch \(error\)[\s\S]*"flags\.sr5\.convergence\.applied": false/)
    expect(typeof applyConvergenceNotice).toBe('function')
    expect(read('../modules/system/matrix-host-presence.js')).not.toContain('CONVERGENCE_SCORE')
  })
})
