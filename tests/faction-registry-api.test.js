import {
  describe, it, expect, vi, beforeAll, beforeEach
} from 'vitest'

// game.sr5.factionRegistry (topologie-sr5, lot 1-bis): a module reads copies of the registry and only
// the active gamemaster writes it, in the registry's turn (gm-ledger.js).
let stored
const updateLedger = vi.fn(async (key, mutate) => {
  stored = mutate(JSON.parse(JSON.stringify(stored)))
  return true
})
vi.mock('../modules/system/gm-ledger.js', () => ({
  updateLedger
}))

let api
const warn = vi.fn()

beforeAll(async () => {
  globalThis.foundry = {
    utils: {
      deepClone: o => JSON.parse(JSON.stringify(o))
    },
    applications: {
      instances: new Map()
    },
  }
  globalThis.ui = {
    notifications: {
      warn
    }
  }
  globalThis.game = {
    user: {
      isActiveGM: true
    },
    i18n: {
      localize: k => k
    },
    settings: {
      get: () => stored
    },
  }
  const {
    factionRegistryApi
  } = await import('../modules/interface/faction-registry.js')
  api = factionRegistryApi()
})

beforeEach(() => {
  stored = {
    factions: [{
      id: 'maf', name: 'Mafia', type: 'syndicate', enemies: [], members: ['v1'], contacts: []
    }],
    log: [{
      id: 'l', factionId: 'maf', actorId: 'pc', delta: 12, pending: false
    }],
    raises: {
    },
  }
  game.user.isActiveGM = true
  updateLedger.mockClear()
  warn.mockClear()
})

describe('game.sr5.factionRegistry', () => {
  it('reads copies: editing a read never touches the setting', () => {
    const data = api.data
    data.factions[0].name = 'X'
    api.faction('maf').members.push('v2')
    api.factionOfActor('v1').enemies.push('yak')
    expect(stored.factions[0]).toMatchObject({
      name: 'Mafia', members: ['v1'], enemies: []
    })
  })

  it('answers null for an unknown faction or actor', () => {
    expect(api.faction('none')).toBeNull()
    expect(api.factionOfActor('nobody')).toBeNull()
    expect(api.factionOfContact(undefined)).toBeNull()
  })

  it('gives the score and the attitude of the registry', () => {
    expect(api.score('maf', 'pc')).toBe(12)
    expect(api.attitudeFor('pc', {
      id: 'v1'
    })).toMatchObject({
      faction: 'Mafia', score: 12, shift: 1
    })
  })

  it('lets the active gamemaster write through the registry turn', async () => {
    await api.update(d => d.factions.push({
      id: 'yak', name: 'Yakuza', type: 'syndicate', enemies: [], members: [], contacts: []
    }))
    expect(updateLedger).toHaveBeenCalledWith('sr5Factions', expect.any(Function))
    expect(stored.factions.map(f => f.id)).toEqual(['maf', 'yak'])
  })

  it('refuses any other user before writing', async () => {
    game.user.isActiveGM = false
    expect(api.canWrite).toBe(false)
    expect(await api.update(d => d.factions.length = 0)).toBe(false)
    expect(updateLedger).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    expect(stored.factions).toHaveLength(1)
  })

  it('is frozen: a module cannot replace update()', () => {
    expect(Object.isFrozen(api)).toBe(true)
  })
})
