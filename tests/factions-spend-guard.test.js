import {
  describe, it, expect, vi, beforeAll, beforeEach
} from 'vitest'

// Spending Faction Reputation (Cutting Aces p. 159-160) is the active gamemaster's alone: a gamemaster
// who is not the active one must be refused BEFORE any effect (reputation item, contact, Influence).
vi.mock('../modules/system/calendar.js', () => ({
  worldTimeToComponents: () => ({
    year: 2080, month: 0
  }),
  calendarStartYear: () => 2070,
}))

let SR5FactionsApp
const warn = vi.fn()
const createEmbeddedDocuments = vi.fn(async () => [{
  uuid: 'Actor.pc.Item.new'
}])
const contactUpdate = vi.fn()
const registry = {
  factions: [{
    id: 'hw', name: 'Halloweeners', type: 'gang', enemies: [], members: [], contacts: ['Actor.pc.Item.c']
  }],
  log: [{
    id: 'l', factionId: 'hw', actorId: 'pc', delta: 50, pending: false
  }],
  raises: {
  },
}
const settingsSet = vi.fn()

beforeAll(async () => {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => class extends Base {},
        DialogV2: {
          confirm: vi.fn(async () => true), prompt: vi.fn(async () => ({
            name: 'X', influence: 1
          }))
        },
      },
      instances: new Map(),
    },
    utils: {
      randomID: () => 'id', deepClone: o => JSON.parse(JSON.stringify(o))
    },
  }
  globalThis.ui = {
    notifications: {
      warn, info: vi.fn()
    }
  }
  globalThis.fromUuid = vi.fn(async () => ({
    name: 'C', parent: {
      id: 'pc'
    }, system: {
      connection: 1
    }, update: contactUpdate
  }))
  ;({
    SR5FactionsApp
  } = await import('../modules/interface/factions-app.js'))
})

const fakeApp = kind => {
  const values = {
    spFaction: 'hw', spActor: 'pc', spKind: kind, spContact: 'Actor.pc.Item.c'
  }
  // A real instance: the window's private helpers refuse any other receiver
  const app = new SR5FactionsApp()
  Object.defineProperty(app, 'element', {
    value: {
      querySelector: sel => {
        const name = /name="?([\w-]+)"?/.exec(sel)?.[1]
        return name in values ? {
          value: values[name]
        } : null
      },
      querySelectorAll: () => [],
    },
  })
  return app
}

const setUser = isActiveGM => {
  globalThis.game = {
    user: {
      isGM: true, isActiveGM
    },
    i18n: {
      localize: k => k, format: k => k
    },
    settings: {
      get: () => registry, set: settingsSet
    },
    actors: {
      get: () => ({
        id: 'pc', createEmbeddedDocuments
      })
    },
    time: {
      worldTime: 0
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('faction spending guard', () => {
  it.each(['streetCred', 'notoriety', 'newContact', 'contactInfluence', 'serviceAsk'])(
    'a gamemaster who is not the active one changes nothing (%s)', async kind => {
      setUser(false)
      await SR5FactionsApp.DEFAULT_OPTIONS.actions.spend.call(fakeApp(kind))
      expect(warn).toHaveBeenCalledWith('SR5.FACTION_OnlyGM')
      expect(createEmbeddedDocuments).not.toHaveBeenCalled()
      expect(contactUpdate).not.toHaveBeenCalled()
      expect(settingsSet).not.toHaveBeenCalled()
    })

  it('the active gamemaster spends', async () => {
    setUser(true)
    await SR5FactionsApp.DEFAULT_OPTIONS.actions.spend.call(fakeApp('streetCred'))
    expect(createEmbeddedDocuments).toHaveBeenCalledTimes(1)
    expect(settingsSet).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })
})
