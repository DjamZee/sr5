import {
  describe, it, expect, vi, beforeAll, beforeEach
} from 'vitest'

// An actor dragged from the sidebar onto a faction of the gamemaster's window joins it (lot 3 of the organisations,
// topologie-sr5): a vendor without a token on the scene can then be a member, which sr5.vendorPrice reads.
// One main faction (Cutting Aces p. 156): it leaves any other. Player characters are refused, and only the active
// gamemaster writes.
let saved = null
vi.mock('../modules/system/gm-ledger.js', () => ({
  updateLedger: vi.fn(async (key, mutate) => {
    saved = mutate(JSON.parse(JSON.stringify(globalThis.game.settings.get())))
    return true
  }),
}))

let SR5FactionsApp
const info = vi.fn()
const warn = vi.fn()
const actors = {
  'Actor.vendor': {
    id: 'vendor', type: 'actorGrunt', isToken: false
  },
  'Actor.pc': {
    id: 'pc', type: 'actorPc', isToken: false
  },
  'Compendium.megapack.actors.Actor.vendor': {
    id: 'vendor', type: 'actorGrunt', isToken: false, pack: 'megapack.actors', inCompendium: true
  },
  'Scene.s.Token.t.Actor.vendor': {
    id: 'vendor', type: 'actorGrunt', isToken: true, token: {
      actorId: 'vendor'
    }
  },
}
const registry = () => ({
  factions: [
    {
      id: 'fixers', name: 'Les fixers', type: 'society', enemies: [], members: ['vendor'], contacts: []
    },
    {
      id: 'mafia', name: 'Mafia de Seattle', type: 'syndicate', enemies: [], members: ['other'], contacts: []
    },
  ],
  log: [], raises: {
  },
})

const drop = uuid => ({
  preventDefault: vi.fn(), uuid
})

beforeAll(async () => {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => class extends Base {},
      },
      instances: new Map(),
      ux: {
        TextEditor: {
          implementation: {
            getDragEventData: event => event.uuid ? {
              type: 'Actor', uuid: event.uuid
            } : {
              type: 'Item', uuid: 'Item.x'
            }
          }
        }
      },
    },
    utils: {
      randomID: () => 'id', deepClone: o => JSON.parse(JSON.stringify(o))
    },
  }
  globalThis.ui = {
    notifications: {
      warn, info
    }
  }
  globalThis.fromUuid = vi.fn(async uuid => actors[uuid] ?? null)
  ;({
    SR5FactionsApp
  } = await import('../modules/interface/factions-app.js'))
})

const setUser = isActiveGM => {
  const data = registry()
  globalThis.game = {
    user: {
      isGM: true, isActiveGM
    },
    i18n: {
      localize: k => k, format: k => k
    },
    settings: {
      get: () => data
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  saved = null
})

describe('dropping an actor on a faction', () => {
  it('a vendor joins the faction and leaves its other one', async () => {
    setUser(true)
    await SR5FactionsApp.prototype._onDropActor(drop('Actor.vendor'), 'mafia')
    expect(saved.factions.find(f => f.id === 'mafia').members).toEqual(['other', 'vendor'])
    expect(saved.factions.find(f => f.id === 'fixers').members).toEqual([])
  })

  it('a token actor joins as its base actor', async () => {
    setUser(true)
    await SR5FactionsApp.prototype._onDropActor(drop('Scene.s.Token.t.Actor.vendor'), 'mafia')
    expect(saved.factions.find(f => f.id === 'mafia').members).toEqual(['other', 'vendor'])
  })

  it('a player character is refused, with a word', async () => {
    setUser(true)
    await SR5FactionsApp.prototype._onDropActor(drop('Actor.pc'), 'mafia')
    expect(saved).toBeNull()
    expect(info).toHaveBeenCalledWith('SR5.FACTION_DropNoPc')
  })

  // Relecture de Fabrice#6075 (22/10): a compendium actor's id is not a world actor's
  it('an actor dragged from a compendium is refused, with a word', async () => {
    setUser(true)
    await SR5FactionsApp.prototype._onDropActor(drop('Compendium.megapack.actors.Actor.vendor'), 'mafia')
    expect(saved).toBeNull()
    expect(info).toHaveBeenCalledWith('SR5.FACTION_DropNoPack')
  })

  it('what is not an actor changes nothing', async () => {
    setUser(true)
    await SR5FactionsApp.prototype._onDropActor(drop(null), 'mafia')
    expect(saved).toBeNull()
  })

  it('a gamemaster who is not the active one changes nothing', async () => {
    setUser(false)
    await SR5FactionsApp.prototype._onDropActor(drop('Actor.vendor'), 'mafia')
    expect(saved).toBeNull()
    expect(warn).toHaveBeenCalledWith('SR5.FACTION_OnlyGM')
  })

  it('the selected tokens go the same way (affiliate)', async () => {
    setUser(true)
    await SR5FactionsApp.affiliate('fixers', ['other'])
    expect(saved.factions.find(f => f.id === 'fixers').members).toEqual(['vendor', 'other'])
    expect(saved.factions.find(f => f.id === 'mafia').members).toEqual([])
  })
})
