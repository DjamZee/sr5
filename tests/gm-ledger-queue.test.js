import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_MiscellaneousHelpers, CONSUMED_CARDS
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')

// The registers of the GM: two writes begun together read the same state, and the second erased the first (Thomas,
// measured on 30002). The server is played here as Foundry's is: game.settings.get returns the new value only once
// the server has answered, a few ticks after the set.

let store
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function slowServer(){
  store = {
  }
  game.settings = {
    get: (s, k) => store[k],
    set: async (s, k, v) => {
      await tick()
      store[k] = JSON.parse(JSON.stringify(v))
      return v
    },
  }
}

const gm = {
  id: 'gm', isGM: true, isActiveGM: true
}
beforeEach(() => {
  vi.restoreAllMocks()
  slowServer()
  game.user = gm
  game.users = {
    get: id => (id === 'gm' ? gm : null), activeGM: gm, filter: fn => [gm].filter(fn)
  }
})

describe('the spent cards (sr5ConsumedCards)', () => {
  it('keeps both keys when "Overwatch" and a mark are spent on the same card at once', async () => {
    const [a, b] = await Promise.all([
      SR5_MiscellaneousHelpers.consume('card1|overwatch|npc'),
      SR5_MiscellaneousHelpers.consume('card1|mark|npc'),
    ])
    expect([a, b]).toEqual([true, true])
    expect(Object.keys(store[CONSUMED_CARDS]).sort()).toEqual(['card1|mark|npc', 'card1|overwatch|npc'])
  })

  it('still spends a card once', async () => {
    const results = await Promise.all([
      SR5_MiscellaneousHelpers.consume('card2|overwatch|npc'),
      SR5_MiscellaneousHelpers.consume('card2|overwatch|npc'),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe('the queue (gm-ledger.js)', () => {
  it('lets the next write through when one fails', async () => {
    const {
      updateLedger
    } = await import('../modules/system/gm-ledger.js')
    const failed = updateLedger('reg', () => {
      throw new Error('boom')
    })
    const next = updateLedger('reg', l => ({
      ...l, a: 1
    }))
    await expect(failed).rejects.toThrow('boom')
    expect(await next).toBe(true)
    expect(store.reg).toEqual({
      a: 1
    })
  })

  it('writes nothing when the change returns null', async () => {
    const {
      updateLedger
    } = await import('../modules/system/gm-ledger.js')
    expect(await updateLedger('reg2', () => null)).toBe(false)
    expect(store.reg2).toBeUndefined()
  })
})

describe('every register keeps two writes begun together', () => {
  it('sr5HealSpellLedger: two cards claimed at once stay claimed, one card is claimed once', async () => {
    const {
      claimHealCard, HEAL_LEDGER
    } = await import('../modules/system/heal-ledger.js')
    expect(await Promise.all([claimHealCard('m1'), claimHealCard('m2')])).toEqual([true, true])
    expect(Object.keys(store[HEAL_LEDGER]).sort()).toEqual(['m1', 'm2'])
    const twice = await Promise.all([claimHealCard('m3'), claimHealCard('m3')])
    expect(twice.filter(Boolean)).toHaveLength(1)
  })

  it('sr5HealSpellLedger: a release does not erase a claim made meanwhile', async () => {
    const {
      claimHealCard, releaseHealCard, HEAL_LEDGER
    } = await import('../modules/system/heal-ledger.js')
    await claimHealCard('m1')
    await Promise.all([releaseHealCard('m1'), claimHealCard('m2')])
    expect(Object.keys(store[HEAL_LEDGER])).toEqual(['m2'])
  })

  it('sr5WoundGroupLedger: two patients treated at once, and no more than 200 patients kept', async () => {
    const {
      recordTreatment, woundLedgerAfter, WOUND_GROUP_LEDGER
    } = await import('../modules/system/heal-ledger.js')
    await Promise.all([recordTreatment('Actor.a', 'firstAid', 3), recordTreatment('Actor.b', 'heal', 2)])
    expect(store[WOUND_GROUP_LEDGER]).toEqual({
      'Actor.a': {
        firstAid: 3
      }, 'Actor.b': {
        heal: 2
      }
    })
    let ledger = {
    }
    for (let i = 0; i < 205; i++) ledger = woundLedgerAfter(ledger, `Actor.${i}`, 'heal', 1)
    // The patient treated again goes last: the oldest others leave first
    expect(ledger['Actor.4']).toBeUndefined()
    ledger = woundLedgerAfter(ledger, 'Actor.5', 'firstAid', 2)
    ledger = woundLedgerAfter(ledger, 'Actor.new', 'heal', 1)
    expect(Object.keys(ledger)).toHaveLength(200)
    expect(ledger['Actor.5']).toEqual({
      firstAid: 2
    })
    expect(ledger['Actor.6']).toBeUndefined()
    expect(ledger['Actor.204']).toBeDefined()
  })

  it('aegisLedger: two technomancers hit at once', async () => {
    const {
      setAegisLedger, AEGIS_LEDGER
    } = await import('../modules/system/aegis.js')
    await Promise.all([
      setAegisLedger({
        uuid: 'Actor.t1'
      }, {
        damage: 1
      }),
      setAegisLedger({
        uuid: 'Actor.t2'
      }, {
        damage: 2
      }),
    ])
    expect(Object.keys(store[AEGIS_LEDGER]).sort()).toEqual(['Actor.t1', 'Actor.t2'])
  })

  it('sr5ShopOrderLedger: two purchases entered at once', async () => {
    const {
      ledgerOrders, ORDER_LEDGER
    } = await import('../modules/interface/shop-orders.js')
    await Promise.all([ledgerOrders({
      o1: {
        paid: 10
      }
    }), ledgerOrders({
      o2: {
        paid: 20
      }
    })])
    expect(Object.keys(store[ORDER_LEDGER]).sort()).toEqual(['o1', 'o2'])
  })

  it('sr5ShopRetryLedger: two availability cards recorded at once', async () => {
    game.time = {
      worldTime: 0
    }
    const {
      recordShopCard, RETRY_LEDGER
    } = await import('../modules/interface/shop-retry.js')
    const card = id => ({
      id, author: gm, flags: {
        sr5shop: {
          results: [],
        }
      }
    })
    await Promise.all([recordShopCard(card('c1')), recordShopCard(card('c2'))])
    expect(Object.keys(store[RETRY_LEDGER]).sort()).toEqual(['c1', 'c2'])
  })

  it('sr5SpiritLedger: two values set at once', async () => {
    const {
      setCharacterField, SPIRIT_LEDGER
    } = await import('../modules/system/spirit-ledger.js')
    await Promise.all([setCharacterField('a1', 'spiritIndex', 2), setCharacterField('a2', 'wildIndex', 3)])
    expect(Object.keys(store[SPIRIT_LEDGER].characters).sort()).toEqual(['a1', 'a2'])
  })

  it('the factions: two factions created at once', async () => {
    gm.isActiveGM = true
    const {
      SR5FactionRegistry
    } = await import('../modules/interface/faction-registry.js')
    await Promise.all([
      SR5FactionRegistry.update(d => d.factions.push({
        id: 'f1'
      })),
      SR5FactionRegistry.update(d => d.factions.push({
        id: 'f2'
      })),
    ])
    const setting = Object.keys(store)[0]
    expect(store[setting].factions.map(f => f.id).sort()).toEqual(['f1', 'f2'])
  })
})

describe('the registers of the clocks and of the table', () => {
  it('sr5HungerLedger: two creatures entered at once', async () => {
    game.time = {
      worldTime: 0, calendar: {
        format: t => String(t)
      }
    }
    globalThis.ChatMessage = {
      create: vi.fn(), getWhisperRecipients: () => [gm]
    }
    const {
      toggleHunger
    } = await import('../modules/system/hunger.js')
    await Promise.all([toggleHunger({
      uuid: 'Actor.h1', name: 'H1'
    }), toggleHunger({
      uuid: 'Actor.h2', name: 'H2'
    })])
    expect(Object.keys(store.sr5HungerLedger.creatures).sort()).toEqual(['Actor.h1', 'Actor.h2'])
  })

  it('sr5TacnetLedger: two members joining one unit at once both stay on its roster', async () => {
    globalThis.ChatMessage = {
      create: vi.fn()
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn(), warn: vi.fn()
      }
    }
    const item = {
      uuid: 'Item.unit', name: 'Unit', system: {
        tacnetLevel: 3, deviceRating: 6
      }, parent: {
        uuid: 'Actor.bearer'
      }
    }
    const docs = {
      'Item.unit': item, 'Actor.m1': {
        name: 'M1'
      }, 'Actor.m2': {
        name: 'M2'
      }
    }
    globalThis.fromUuid = async uuid => docs[uuid]
    const {
      requestRoster, TACNET_LEDGER
    } = await import('../modules/system/tacnet.js')
    await Promise.all([requestRoster(item, 'Actor.m1', 'join'), requestRoster(item, 'Actor.m2', 'join')])
    expect([...store[TACNET_LEDGER]['Item.unit']].sort()).toEqual(['Actor.m1', 'Actor.m2'])
  })
})

describe('no register is written outside the queue', () => {
  it('finds game.settings.set on a register nowhere but in gm-ledger.js', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    // The settings a GM or a user sets from a form, not registers read again and written back
    const allowed = /sr5StorageViewMode|systemMigrationVersion|SHEET_SIZE_SETTING|sr5ShopExcludedPacks|sr5ShopBuyerMode|sr5ShopBuyerFolder|sr5ShopCreationMode/
    const offenders = []
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, {
        withFileTypes: true
      })) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (file.endsWith('.js') && !file.endsWith('gm-ledger.js')) {
          fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            if (/settings\.set\(/.test(line) && !allowed.test(line) && !/^\s*\/\//.test(line)) offenders.push(`${file}:${i + 1}`)
          })
        }
      }
    }
    walk('modules')
    expect(offenders).toEqual([])
  })
})
