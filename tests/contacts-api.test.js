import {
  describe, it, expect, vi, beforeAll, beforeEach
} from 'vitest'

// The API pour CONTACTS (landing-metroplexes-sr5): game.sr5.commcode, game.sr5.contacts and the faction attitude
// steps of game.sr5.factions. Every request goes to the active gamemaster through requestCommcode; a contact played
// without a sheet answers on system.commcode, taken from the Landing Page's flag where the module had kept it.
const requestCommcode = vi.fn(async () => undefined)
const setDirectory = vi.fn(async () => undefined)
let directoryFlag = []
vi.mock('../modules/interface/commcode-traffic.js', () => ({
  requestCommcode,
  setDirectory,
  directoryFlagOf: () => directoryFlag,
  readTraffic: () => ({
    entries: [
      {
        id: 'e1', kind: 'call', status: 'ringing', to: {
          commcode: '#JN-0000-0000-01', devices: []
        }
      },
      {
        id: 'e2', kind: 'call', status: 'ringing', to: {
          commcode: '#PC-0000-0000-01', devices: [{
            actorName: 'Rex'
          }]
        }
      },
      {
        id: 'e3', kind: 'message', status: 'delivered', to: {
          commcode: '#JN-0000-0000-01', devices: []
        }
      },
    ],
    interceptions: []
  }),
  openFor: vi.fn(),
}))
vi.mock('../modules/interface/commcode-window.js', () => ({
  commcodeOfActor: actor => actor?.code ?? '',
  SR5CommcodeWindow: {
    openMine: vi.fn()
  },
}))
const onFavorAction = vi.fn(() => 'done')
vi.mock('../modules/interface/contact-favors.js', () => ({
  FAVOR_ACTIONS: ['ask', 'obtained', 'service', 'repay', 'improve', 'adjust', 'intimidate'],
  onFavorAction,
}))

let api, contacts, rules
const contact = (id, system = {
}, flags = {
}, extra = {
}) => ({
  id, type: 'itemContact', name: `Contact ${id}`, system, flags, isOwner: true,
  update: vi.fn(async function(data){
    this.system.commcode = data['system.commcode']
  }), ...extra
})

beforeAll(async () => {
  globalThis.foundry.utils.randomID = () => 'newid'
  globalThis.foundry.utils.isEmpty = o => !Object.keys(o ?? {
  }).length
  globalThis.foundry.applications = {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: Base => class extends Base {},
    },
    instances: new Map(),
  }
  const mod = await import('../modules/interface/commcode-api.js')
  api = mod.commcodeApi()
  contacts = mod.contactsApi()
  rules = await import('../modules/interface/contact-commcode.js')
})

let pc
beforeEach(() => {
  requestCommcode.mockClear()
  setDirectory.mockClear()
  onFavorAction.mockClear()
  directoryFlag = []
  pc = {
    id: 'pc', name: 'Rex', type: 'actorPc', items: []
  }
  globalThis.game = {
    ...globalThis.game,
    actors: [pc],
    scenes: [],
    items: [],
    i18n: {
      localize: k => k, format: (k, d) => `${k}:${d.name}`
    },
  }
})

describe('game.sr5.commcode', () => {
  it('sends a call from a device through the gamemaster', async () => {
    await api.call({
      deviceUuid: 'Actor.pc.Item.c', to: '#JN-0000-0000-01', text: 'Salut'
    })
    expect(requestCommcode).toHaveBeenCalledWith('send', expect.objectContaining({
      deviceUuid: 'Actor.pc.Item.c', to: '#JN-0000-0000-01', text: 'Salut', kind: 'call'
    }))
  })

  it('answers and refuses on the called end by default, hangs up on the user\'s end', async () => {
    await api.answer('e1')
    expect(requestCommcode).toHaveBeenLastCalledWith('answer', {
      entryId: 'e1', side: 'to'
    })
    await api.refuse('e1')
    expect(requestCommcode).toHaveBeenLastCalledWith('refuse', {
      entryId: 'e1', side: 'to'
    })
    await api.hangup('e1')
    expect(requestCommcode).toHaveBeenLastCalledWith('hangup', {
      entryId: 'e1', side: undefined
    })
    await api.say('e1', 'Oui ?', {
      side: 'to'
    })
    expect(requestCommcode).toHaveBeenLastCalledWith('line', {
      entryId: 'e1', text: 'Oui ?', side: 'to'
    })
  })

  it('lists the ringing calls no device answers, as copies', () => {
    const calls = api.unanswered()
    expect(calls.map(e => e.id)).toEqual(['e1'])
    calls[0].status = 'changed'
    expect(api.unanswered()[0].status).toBe('ringing')
  })

  it('adds a contact to the directory once, renaming a commcode already listed', async () => {
    directoryFlag = [{
      id: 'a', name: 'Ancien', commcode: '#JN-0000-0000-01', key: ''
    }]
    await api.directory.add(pc, {
      name: 'Johnson', commcode: '#JN-0000-0000-01'
    })
    expect(setDirectory).toHaveBeenLastCalledWith(pc, [{
      id: 'a', name: 'Johnson', commcode: '#JN-0000-0000-01', key: ''
    }])
    await api.directory.add(pc, {
      name: 'Fixer', commcode: '#FX-0000-0000-01'
    })
    expect(setDirectory.mock.lastCall[1]).toHaveLength(2)
    expect(setDirectory.mock.lastCall[1][1]).toMatchObject({
      id: 'newid', name: 'Fixer'
    })
  })

  // Relecture du 22/10: entries() gave a player the traffic of every character of the world
  it('gives the gamemaster the whole register, a player only what her characters\' devices see', () => {
    pc.testUserPermission = (user, level) => user.id === 'joueuse' && level === 'OWNER'
    pc.items = [{
      type: 'itemDevice', system: {
        commcode: '#PC-0000-0000-01'
      }
    }]
    const other = {
      id: 'npc', items: [{
        type: 'itemDevice', system: {
          commcode: '#JN-0000-0000-01'
        }
      }], testUserPermission: () => false
    }
    game.actors = [pc, other]
    game.user = {
      id: 'mj', isGM: true
    }
    expect(api.entries().map(e => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect(api.unanswered().map(e => e.id)).toEqual(['e1'])
    game.user = {
      id: 'joueuse', isGM: false
    }
    expect(api.entries().map(e => e.id)).toEqual(['e2'])
    expect(api.unanswered()).toEqual([])
    game.user = {
      id: 'autre', isGM: false
    }
    expect(api.entries()).toEqual([])
    delete game.user
  })

  it('generates a commcode none of the devices or contacts has', () => {
    expect(api.generate()).toMatch(/^#[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/)
  })
})

describe('the commcode of a contact (system.commcode)', () => {
  it('takes the Landing Page\'s flag when the contact has none, and nothing else', () => {
    const flagged = contact('a', {
      commcode: ''
    }, {
      'landing-metroplexes-sr5': {
        commcode: '#JN-AAAA-BBBB-01'
      }
    })
    expect(rules.contactCommcodeFromFlag(flagged)).toEqual({
      'system.commcode': '#JN-AAAA-BBBB-01'
    })
    expect(rules.contactCommcodeFromFlag(contact('b', {
      commcode: '#XX-0000-0000-00'
    }, flagged.flags))).toEqual({
    })
    expect(rules.contactCommcodeFromFlag(contact('c', {
    }))).toEqual({
    })
    expect(rules.contactCommcodeFromFlag({
      ...flagged, type: 'itemDevice'
    })).toEqual({
    })
  })

  it('finds a contact by its commcode, on a character or in the world\'s items', () => {
    const own = contact('a', {
      commcode: '#JN-0000-0000-01'
    }, {
    }, {
      parent: pc
    })
    pc.items = [own]
    const loose = contact('b', {
      commcode: '#jn-0000-0000-02'
    })
    game.items = [loose]
    expect(contacts.ofCommcode('#jn-0000-0000-01')).toEqual([own])
    expect(contacts.ofCommcode('#JN-0000-0000-02')).toEqual([loose])
    expect(contacts.ofCommcode('')).toEqual([])
    expect(rules.contactLabelOf(own)).toBe('Contact a (SR5.COMMCODE_ContactOf:Rex)')
    expect(rules.contactLabelOf(loose)).toBe('Contact b')
  })

  it('gives a contact its commcode at the first call, written by its owner', async () => {
    const c = contact('a', {
      commcode: ''
    }, {
    }, {
      parent: pc
    })
    pc.items = [c]
    expect(await contacts.commcodeOf(c)).toBe('')
    const code = await contacts.commcodeOf(c, {
      create: true
    })
    expect(code).toMatch(/^#/)
    expect(c.update).toHaveBeenCalledWith({
      'system.commcode': code
    })
    expect(await contacts.commcodeOf(c, {
      create: true
    })).toBe(code)
    expect(c.update).toHaveBeenCalledTimes(1)
  })

  it('does not write the commcode of a contact the user does not own', async () => {
    const c = contact('a', {
      commcode: ''
    }, {
    }, {
      parent: pc, isOwner: false
    })
    expect(await contacts.commcodeOf(c, {
      create: true
    })).toBe('')
    expect(c.update).not.toHaveBeenCalled()
  })

  it('answers on the grunt made from the contact when there is one', async () => {
    const c = contact('a', {
      commcode: '#JN-0000-0000-01', isCreated: true
    }, {
    }, {
      parent: pc
    })
    game.actors = [pc, {
      type: 'actorGrunt', system: {
        creatorItemId: 'a', creatorId: 'pc'
      }, items: [], code: '#GR-0000-0000-01'
    }]
    expect(await contacts.commcodeOf(c)).toBe('#GR-0000-0000-01')
  })

  it('counts the contacts\' commcodes among those already given', async () => {
    const {
      worldCommcodes
    } = await import('../modules/interface/commcode-default.js')
    pc.items = [contact('a', {
      commcode: '#JN-0000-0000-01'
    }), {
      type: 'itemDevice', system: {
        commcode: '#PC-0000-0000-01'
      }
    }]
    expect(worldCommcodes()).toEqual(['#PC-0000-0000-01', '#JN-0000-0000-01'])
  })
})

describe('game.sr5.contacts.favor', () => {
  it('runs the sheet\'s favor action, "ask" by default', () => {
    const c = contact('a')
    expect(contacts.favor(c)).toBe('done')
    expect(onFavorAction).toHaveBeenLastCalledWith(c, 'ask')
    contacts.favor(c, 'repay')
    expect(onFavorAction).toHaveBeenLastCalledWith(c, 'repay')
    expect(contacts.favorActions).toContain('intimidate')
  })
})

describe('game.sr5.factions attitude steps (Cutting Aces p. 160)', () => {
  it('gives the table\'s steps and moves an attitude by them', async () => {
    const {
      SR5FactionsApp
    } = await import('../modules/interface/factions-app.js')
    expect(SR5FactionsApp.attitudeShift(25)).toBe(4)
    expect(SR5FactionsApp.attitudeShift(12)).toBe(1)
    expect(SR5FactionsApp.attitudeShift(-12)).toBe(-1)
    expect(SR5FactionsApp.shiftAttitude('neutral', 1)).toBe('friendly')
    expect(SR5FactionsApp.shiftAttitude('neutral', -2)).toBe('prejudiced')
    expect(SR5FactionsApp.attitudes[0]).toBe('friendly')
  })
})
