import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// S4 (ticket 4 d'Adrore): the generic hooks of the Matrix. Without a subscriber, nothing changes (the book)

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

import {
  foundryHooks
} from './fixtures/foundry-hooks.js'

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}

const {
  MATRIX_HOOKS, matrixMarkCap, matrixEffectiveMarks, announceMarksChanged, announceOverwatchChanged, overwatchInChanges
} = await import('../modules/system/matrix-hooks.js')
const {
  SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  markCount
} = await import('../modules/system/matrix-api.js')

/** A Hooks.callAll that hands every call to the subscribers given, by hook */
function hooksWith(subscribers = {
}) {
  const calls = []
  return {
    calls,
    call: (hook, ...args) => {
      calls.push([hook, ...args])
      subscribers[hook]?.(...args)
    },
  }
}

describe('C2 sr5.matrixMarkCap', () => {
  it('is 3 without a subscriber (SR5 p. 237), and hands {attacker, target, cap}', () => {
    const h = hooksWith()
    expect(matrixMarkCap({
      attacker: 'a', target: 't'
    }, h.call)).toBe(3)
    expect(h.calls[0]).toEqual([MATRIX_HOOKS.markCap, {
      attacker: 'a', target: 't', cap: 3
    }])
  })
  it('takes a whole number of 1 or more from a module, nothing else', () => {
    expect(matrixMarkCap({
    }, hooksWith({
      [MATRIX_HOOKS.markCap]: v => v.cap = 6
    }).call)).toBe(6)
    expect(matrixMarkCap({
    }, hooksWith({
      [MATRIX_HOOKS.markCap]: v => v.cap = 0
    }).call)).toBe(3)
    expect(matrixMarkCap({
    }, hooksWith({
      [MATRIX_HOOKS.markCap]: v => v.cap = "6"
    }).call)).toBe(3)
    expect(matrixMarkCap({
    }, hooksWith({
      [MATRIX_HOOKS.markCap]: () => {
        throw new Error('boom')
      }
    }).call)).toBe(3)
  })
  it('the API takes as many marks as the cap', () => {
    expect(markCount(5)).toBe(3)
    expect(markCount(5, 6)).toBe(5)
  })
})

describe('C3 sr5.matrixEffectiveMarks', () => {
  it('gives the real marks without a subscriber, and what a module counts', () => {
    const h = hooksWith()
    expect(matrixEffectiveMarks({
      viewer: 'v', target: 't', key: 'controlDevice', marks: 1
    }, h.call)).toBe(1)
    expect(h.calls[0]).toEqual([MATRIX_HOOKS.effectiveMarks, {
      viewer: 'v', target: 't', key: 'controlDevice', marks: 1
    }])
    expect(matrixEffectiveMarks({
      marks: 0
    }, hooksWith({
      [MATRIX_HOOKS.effectiveMarks]: v => v.marks = 3
    }).call)).toBe(3)
    expect(matrixEffectiveMarks({
      marks: 2
    }, hooksWith({
      [MATRIX_HOOKS.effectiveMarks]: v => v.marks = -1
    }).call)).toBe(2)
  })
})

describe('C4 and C5', () => {
  it('C4 hands (target, ownerId, value, previous, source), and says nothing when nothing changed', () => {
    const h = hooksWith()
    announceMarksChanged('item', 'hacker', 2, 1, 'mark', h.call)
    announceMarksChanged('item', 'hacker', 2, 2, 'mark', h.call)
    expect(h.calls).toEqual([[MATRIX_HOOKS.marksChanged, 'item', 'hacker', 2, 1, 'mark']])
  })
  it('C5 hands (actor, value, previous)', () => {
    const h = hooksWith()
    announceOverwatchChanged('actor', 12, 4, h.call)
    expect(h.calls).toEqual([[MATRIX_HOOKS.overwatchChanged, 'actor', 12, 4]])
  })
  it('reads the score in flat or nested changes', () => {
    expect(overwatchInChanges({
      'system.matrix.overwatchScore': 5
    })).toBe(5)
    expect(overwatchInChanges({
      system: {
        matrix: {
          overwatchScore: 0
        }
      }
    })).toBe(0)
    expect(overwatchInChanges({
      system: {
        matrix: {
        }
      }
    })).toBeUndefined()
  })
})

describe('the marks of markItem, through the hooks', () => {
  let device, hacker, deck, target, seen
  beforeEach(() => {
    vi.restoreAllMocks()
    game.user = {
      isGM: true, id: 'gm'
    }
    seen = []
    // Foundry's own Hooks (the verdict of the cap is asked of its subscribers one by one, verdictCall)
    globalThis.Hooks = foundryHooks(Object.fromEntries(Object.values(MATRIX_HOOKS).map(hook => [hook, (...args) => {
      seen.push([hook, ...args])
      if (hook === MATRIX_HOOKS.markCap && globalThis.__cap) args[0].cap = globalThis.__cap
    }])))
    const doc = data => {
      const d = {
        ...data, update: vi.fn(async changes => {
          for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(d, path, value)
        })
      }
      return d
    }
    device = doc({
      type: 'itemDevice', uuid: 'Actor.t.Item.d', name: 'Commlink', system: {
        isActive: true, marks: [{
          ownerId: 'hacker', value: 3
        }]
      }
    })
    target = {
      id: 't', name: 'Cible', items: [device], system: {
        matrix: {
        }
      }
    }
    device.parent = target
    deck = doc({
      type: 'itemDevice', system: {
        isActive: true, markedItems: []
      }
    })
    hacker = {
      id: 'hacker', name: 'Hackeuse', items: [deck], system: {
        matrix: {
          deviceType: 'cyberdeck'
        }
      }
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => ({
      t: target, hacker
    })[id])
    globalThis.fromUuid = vi.fn(async uuid => uuid === device.uuid ? device : null)
  })
  afterEach(() => {
    delete globalThis.__cap
  })
  it('stays at 3 by the book, and nothing is told when nothing changed', async () => {
    await SR5_MarkHelpers.markItem('t', 'hacker', 1)
    expect(device.system.marks[0].value).toBe(3)
    expect(seen.filter(c => c[0] === MATRIX_HOOKS.marksChanged)).toEqual([])
  })
  it('goes past 3 when a module raises the cap, and C4 tells it', async () => {
    globalThis.__cap = 6
    deck.system.markedItems = [{
      uuid: device.uuid, value: 3
    }]
    await SR5_MarkHelpers.markItem('t', 'hacker', 2)
    expect(device.system.marks[0].value).toBe(5)
    expect(seen.find(c => c[0] === MATRIX_HOOKS.marksChanged)).toEqual([MATRIX_HOOKS.marksChanged, device, 'hacker', 5, 3, 'mark'])
    expect(deck.system.markedItems[0].value).toBe(5)
  })
})
