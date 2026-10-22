import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import fs from 'node:fs'

// Tests des API publiques (Inès, 22/10): game.sr5 as the modules of DjamZ meet it (Landing Page, Matrice, Câblage
// Maison, Technologie prototype…). What it holds is what docs/API-publique.md promises, every hook the system calls is
// written there; the calls kept for the gamemaster refuse a player before writing; a bad argument answers the empty
// value of the call, never an error.

// config.js writes CONFIG.statusEffects while it is being imported
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const emitForGM = vi.fn()
const emitForPlayer = vi.fn()
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM, emitForPlayer
  },
}))
const updateLedger = vi.fn(async () => true)
vi.mock('../modules/system/gm-ledger.js', () => ({
  updateLedger
}))

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const doc = read('../docs/API-publique.md')

/** The keys of game.sr5 as init.js writes them, in order */
function apiKeys() {
  const source = read('../modules/hooks/init.js')
  const block = source.slice(source.indexOf('game.sr5 = {'), source.indexOf('\n  }\n', source.indexOf('game.sr5 = {')))
  return [...block.matchAll(/^ {4}(\w+)(?=[:,\n])/gm)].map(match => match[1])
}

/** Every file of the system's modules, as text */
function moduleSources(dir = new URL('../modules/', import.meta.url)) {
  return fs.readdirSync(dir, {
    withFileTypes: true
  }).flatMap(entry => entry.isDirectory() ? moduleSources(new URL(`${entry.name}/`, dir)) :
    entry.name.endsWith('.js') ? [fs.readFileSync(new URL(entry.name, dir), 'utf8')] : [])
}

// The public API of 13.1.0: a key added or taken away is a change for the modules, and for the page that lists it
const API = ['config', 'entities', 'migration', 'macros', 'rollItemMacro', 'rollMacro', 'compendiumBrowser', 'shop',
  'primaryLifestyle', 'creationOverLimitItems', 'dealership', 'factions', 'factionRegistry', 'shopAudit',
  'convertMentorQualities', 'revertMentorConversion', 'activateAutomaticPowers', 'panCrown', 'combat', 'matrix',
  'tokenDefaults', 'vendors', 'spriteTypes', 'commcode', 'contacts', 'infoBroker']

// Every hook the system calls for the modules
const HOOKS = ['sr5.rollReminders', 'sr5.vendorPrice', 'sr5.purchaseFunds', 'sr5.vendorRefusal',
  'sr5.initiativeReminders', 'sr5.situationalArmor', 'sr5.fadingResistance', 'sr5.essenceCostFor',
  'sr5.matrixMarkCap', 'sr5.matrixEffectiveMarks', 'sr5.matrixHostEntry', 'sr5.matrixDirectConnection',
  'sr5.matrixAdministrator', 'sr5.iceLegitimateUser', 'sr5.matrixPerceptionInfo', 'sr5.panCrownGraph',
  'sr5.panCrownVisibility', 'sr5.panCrownActions', 'sr5.panCrownRendered', 'sr5.panCrownClosed',
  'sr5.panCrownClickIcon', 'sr5.matrixHostChanged', 'sr5.matrixMarksChanged', 'sr5.overwatchChanged',
  'sr5.matrixActionResolved', 'sr5ChaseActionResolved']

describe('game.sr5, what docs/API-publique.md promises', () => {
  it('holds exactly the keys of the page, in the order of init.js', () => {
    expect(apiKeys()).toEqual(API)
  })
  it('every key is written on the page', () => {
    for (const key of API) expect(doc, key).toContain(`game.sr5.${key}`)
  })
  it('every hook the system calls is on the page, and no other', () => {
    const sources = moduleSources().join('\n')
    const called = new Set()
    // A hook named in the code: Hooks.callAll("sr5…"), verdictCall(…)("sr5.…"), a constant `…HOOK = "sr5.…"`, or a
    // table of hooks (PAN_CROWN_HOOKS, MATRIX_HOOKS)
    for (const match of sources.matchAll(/(?:callAll\??\.?\(\s*|\)\(\s*|HOOK\s*=\s*|^\s+\w+:\s*)"(sr5\.[a-z]\w+)"/gm)) called.add(match[1])
    for (const match of sources.matchAll(/callAll\??\.?\(\s*"(sr5[A-Z]\w+)"/g)) called.add(match[1])
    expect([...called].sort()).toEqual([...HOOKS].sort())
    for (const hook of HOOKS) expect(doc, hook).toContain(`\`${hook}\``)
  })
})

describe('the frozen parts of the API: a module cannot replace a call of the system', () => {
  it('commcode, contacts, infoBroker, factionRegistry, tokenDefaults', async () => {
    globalThis.foundry.applications ??= {
      api: {
        ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}
      }, instances: new Map()
    }
    const {
      commcodeApi, contactsApi
    } = await import('../modules/interface/commcode-api.js')
    const {
      infoBrokerApi
    } = await import('../modules/interface/info-broker-api.js')
    const {
      factionRegistryApi
    } = await import('../modules/interface/faction-registry.js')
    const {
      SR5TokenDefaultsApi
    } = await import('../modules/system/token-defaults.js')
    for (const api of [commcodeApi(), commcodeApi().directory, contactsApi(), contactsApi().favorActions, infoBrokerApi(),
      infoBrokerApi().tabs, factionRegistryApi(), SR5TokenDefaultsApi]) expect(Object.isFrozen(api)).toBe(true)
  })
})

describe('game.sr5.commcode: every request goes through the active gamemaster (commcode-traffic.js)', () => {
  let traffic
  const users = new Map()
  const gm = {
    id: 'gm', isGM: true, isActiveGM: true
  }
  const player = {
    id: 'joueuse', isGM: false, isActiveGM: false
  }
  users.set('gm', gm).set('joueuse', player)
  const warn = vi.fn()
  beforeEach(async () => {
    traffic ??= await import('../modules/interface/commcode-traffic.js')
    emitForGM.mockClear()
    emitForPlayer.mockClear()
    updateLedger.mockClear()
    warn.mockClear()
    globalThis.ui = {
      notifications: {
        warn, info: vi.fn()
      }
    }
    globalThis.game = {
      ...globalThis.game, user: gm, users, actors: [], scenes: [], items: [],
      i18n: {
        localize: key => key, format: key => key
      },
      settings: {
        get: () => false
      },
    }
    globalThis.fromUuidSync = vi.fn(() => null)
  })

  it('a player\'s request leaves for the gamemaster, a gamemaster\'s is handled on her browser', async () => {
    game.user = player
    await traffic.requestCommcode('send', {
      to: '#JN-0000-0000-01', text: 'Rendez-vous'
    })
    expect(emitForGM).toHaveBeenCalledWith('commcodeRequest', expect.objectContaining({
      op: 'send', to: '#JN-0000-0000-01'
    }))
    game.user = gm
    await traffic.requestCommcode('nimporte')
    expect(emitForGM).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('SR5.COMMCODE_Refused_unknown')
  })
  it('only the active gamemaster answers, and only a known user', async () => {
    game.user = {
      ...gm, isActiveGM: false
    }
    await traffic.handleCommcodeRequest({
      op: 'nimporte'
    }, 'joueuse')
    game.user = gm
    await traffic.handleCommcodeRequest({
      op: 'nimporte'
    }, 'inconnu')
    expect(emitForPlayer).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
  it('refuses a player who speaks for a commcode no sheet carries: the gamemaster\'s', async () => {
    await traffic.handleCommcodeRequest({
      op: 'send', kind: 'call', to: '#JN-0000-0000-01', asCommcode: '#JN-0000-0000-02'
    }, 'joueuse')
    expect(emitForPlayer).toHaveBeenCalledWith('commcodeRefused', {
      reason: 'gm'
    }, 'joueuse')
    expect(updateLedger).not.toHaveBeenCalled()
  })
  it('refuses an empty message, no recipient, a device that is none or not hers, before writing', async () => {
    const reasons = async data => {
      emitForPlayer.mockClear()
      await traffic.handleCommcodeRequest({
        op: 'send', ...data
      }, 'joueuse')
      return emitForPlayer.mock.calls.map(call => call[1].reason)
    }
    expect(await reasons({
      kind: 'message', to: '#JN-0000-0000-01', text: '   '
    })).toEqual(['empty'])
    expect(await reasons({
      kind: 'call', to: '  '
    })).toEqual(['noRecipient'])
    expect(await reasons({
      kind: 'call', to: '#JN-0000-0000-01', deviceUuid: 'Actor.x.Item.inconnu'
    })).toEqual(['noDevice'])
    fromUuidSync.mockReturnValue({
      type: 'itemDevice', system: {
        commcode: '#PC-0000-0000-01'
      }, parent: {
        testUserPermission: () => false
      }
    })
    expect(await reasons({
      kind: 'call', to: '#JN-0000-0000-01', deviceUuid: 'Actor.autre.Item.commlink'
    })).toEqual(['owner'])
    expect(updateLedger).not.toHaveBeenCalled()
  })
  it('an unknown refusal is told as "unknown"', () => {
    traffic.warnRefusal('nimporte')
    expect(warn).toHaveBeenCalledWith('SR5.COMMCODE_Refused_unknown')
  })
})

describe('game.sr5.contacts and game.sr5.infoBroker: a bad argument, the empty answer', () => {
  it('the commcode of what is not a contact is ""', async () => {
    const {
      contactCommcodeOf
    } = await import('../modules/interface/commcode-api.js')
    expect(await contactCommcodeOf(null)).toBe('')
    expect(await contactCommcodeOf({
      type: 'itemGear'
    }, {
      create: true
    })).toBe('')
  })
  it('the buyer of the broker\'s window: none without one, never one a player does not own', async () => {
    const {
      brokerBuyer
    } = await import('../modules/interface/info-broker-api.js')
    const mine = {
      isOwner: true
    }, theirs = {
      isOwner: false
    }
    expect(brokerBuyer(null)).toBeNull()
    expect(brokerBuyer(mine, {
      isGM: false
    })).toBe(mine)
    expect(brokerBuyer(theirs, {
      isGM: false
    })).toBeNull()
    expect(brokerBuyer(theirs, {
      isGM: true
    })).toBe(theirs)
  })
})

describe('game.sr5.panCrown.setReveal: the gamemaster alone reveals a device to the table', () => {
  it('writes nothing for a player, nor without a node or a device', async () => {
    const {
      setPanReveal, setPanRevealTo
    } = await import('../modules/canvas/pan-crown/pan-crown.js')
    const item = {
      flags: {
      }, setFlag: vi.fn(async () => {}), unsetFlag: vi.fn(async () => {})
    }
    globalThis.fromUuidSync = vi.fn(uuid => uuid === 'Actor.x.Item.cam' ? item : null)
    globalThis.game = {
      ...globalThis.game, user: {
        isGM: false
      }
    }
    await setPanReveal({
      uuid: 'Actor.x.Item.cam'
    }, true)
    await setPanRevealTo({
      uuid: 'Actor.x.Item.cam'
    }, ['pc'])
    expect(item.setFlag).not.toHaveBeenCalled()
    game.user = {
      isGM: true
    }
    await setPanReveal(null, true)
    await setPanReveal({
      uuid: 'Actor.x.Item.inconnu'
    }, true)
    expect(item.setFlag).not.toHaveBeenCalled()
    await setPanReveal({
      uuid: 'Actor.x.Item.cam'
    }, true)
    expect(item.setFlag).toHaveBeenCalledWith('sr5', 'panReveal', true)
    await setPanRevealTo({
      uuid: 'Actor.x.Item.cam'
    }, ['pc', 'pc', 3, ''])
    expect(item.setFlag).toHaveBeenLastCalledWith('sr5', 'panRevealTo', ['pc'])
  })
})
