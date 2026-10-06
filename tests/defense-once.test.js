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
const {
  mayDefend, recordDefense, defenseKey, hasDefended
} = await import('../modules/system/defense-once.js')

// Séance F, T11 (DjamZ, 06/10): a target defends once against one attack; the card stays for the other targets,
// the active GM keeps the registry and may reopen a defense by hand

let store, whispers
const gm = {
  id: 'gm', isGM: true, name: 'MJ'
}
const player = {
  id: 'p1', isGM: false, name: 'J1'
}

beforeEach(() => {
  vi.restoreAllMocks()
  store = {
  }
  whispers = []
  game.settings = {
    get: (s, k) => store[k],
    set: async (s, k, v) => {
      store[k] = JSON.parse(JSON.stringify(v))
      return v
    },
  }
  game.user = gm
  game.users = {
    activeGM: gm
  }
  globalThis.ChatMessage = {
    create: vi.fn(async data => whispers.push(data)),
    getWhisperRecipients: () => [gm],
  }
  ui.notifications.warn = vi.fn()
  // a card is trusted when a GM wrote it or an owner of its roller (cardOf, tested elsewhere)
  vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => (id.startsWith('forged') ? null : {
    id
  }))
})

const defenseCard = (id, attack, defender, type = 'defense') => ({
  id, author: player, flags: {
    sr5data: {
      test: {
        type
      }, previousMessage: {
        messageId: attack
      }, owner: {
        actorId: defender, speakerActor: defender
      }
    }
  }
})

describe('the active GM records each defense card', () => {
  it('records the first defense of a target, and tells the GMs of a second one', async () => {
    expect(await recordDefense(defenseCard('d1', 'attack1', 'diego'))).toBe(true)
    expect(store[CONSUMED_CARDS][defenseKey('attack1', 'diego')]).toBeTruthy()

    // the same defense rolled again, from the button or the console
    expect(await recordDefense(defenseCard('d2', 'attack1', 'diego'))).toBe(false)
    expect(whispers).toHaveLength(1)
    expect(whispers[0].whisper).toEqual(['gm'])
    expect(whispers[0].content).toContain('SR5.DefenseRepeated')
  })

  it('lets another target of the same attack defend', async () => {
    await recordDefense(defenseCard('d1', 'attack1', 'diego'))
    expect(await recordDefense(defenseCard('d3', 'attack1', 'ganger'))).toBe(true)
    expect(whispers).toHaveLength(0)
  })

  it('records two defenses created together once each, and only one per target', async () => {
    const results = await Promise.all([
      recordDefense(defenseCard('d1', 'attack1', 'diego')),
      recordDefense(defenseCard('d2', 'attack1', 'diego')),
      recordDefense(defenseCard('d3', 'attack1', 'ganger', 'matrixDefense')),
    ])
    expect(results.filter(r => r === true)).toHaveLength(2)
    expect(results.filter(r => r === false)).toHaveLength(1)
  })

  it('ignores a card that no GM nor owner of its roller wrote', async () => {
    expect(await recordDefense(defenseCard('forged1', 'attack1', 'diego'))).toBe(null)
    expect(store[CONSUMED_CARDS]).toBeUndefined()
  })

  it('is done by the active GM only', async () => {
    game.user = player
    expect(await recordDefense(defenseCard('d1', 'attack1', 'diego'))).toBe(null)
    game.user = {
      id: 'gm2', isGM: true
    }
    expect(await recordDefense(defenseCard('d1', 'attack1', 'diego'))).toBe(null)
    expect(store[CONSUMED_CARDS]).toBeUndefined()
  })

  it('leaves the cards that are not a defense', async () => {
    expect(await recordDefense(defenseCard('r1', 'attack1', 'diego', 'resistanceCard'))).toBe(null)
  })
})

describe('the button "Se défendre"', () => {
  const diego = {
    id: 'diego', name: 'Diego', isToken: false
  }

  it('rolls a first defense, and refuses a second one to a player', async () => {
    game.user = player
    expect(await mayDefend('defenseRangedWeapon', 'attack1', {
    }, diego)).toBe(true)
    store[CONSUMED_CARDS] = {
      [defenseKey('attack1', 'diego')]: 1
    }
    expect(await mayDefend('defenseRangedWeapon', 'attack1', {
    }, diego)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_AlreadyDefended')
    // another target still defends from the same card
    expect(await mayDefend('defenseRangedWeapon', 'attack1', {
    }, {
      id: 'ganger', isToken: false
    })).toBe(true)
  })

  it('reads the token of an unlinked defender', async () => {
    game.user = player
    store[CONSUMED_CARDS] = {
      [defenseKey('attack1', 'tok1')]: 1
    }
    expect(await mayDefend('powerDefense', 'attack1', {
    }, {
      id: 'base', isToken: true, token: {
        id: 'tok1', name: 'Ganger'
      }
    })).toBe(false)
  })

  it('lets the GM reopen a defense, which leaves the registry', async () => {
    store[CONSUMED_CARDS] = {
      [defenseKey('attack1', 'diego')]: 1, other: 2
    }
    foundry.applications.api.DialogV2 = {
      confirm: vi.fn(async () => true)
    }
    expect(await mayDefend('defenseMeleeWeapon', 'attack1', {
    }, diego)).toBe(true)
    expect(hasDefended('attack1', 'diego')).toBe(false)
    expect(store[CONSUMED_CARDS].other).toBe(2)

    store[CONSUMED_CARDS] = {
      [defenseKey('attack1', 'diego')]: 1
    }
    foundry.applications.api.DialogV2.confirm = vi.fn(async () => false)
    expect(await mayDefend('defenseMeleeWeapon', 'attack1', {
    }, diego)).toBe(false)
    expect(hasDefended('attack1', 'diego')).toBe(true)
  })

  it('reads the attack carried by a shot through a barrier', async () => {
    game.user = player
    store[CONSUMED_CARDS] = {
      [defenseKey('attack0', 'diego')]: 1
    }
    expect(await mayDefend('defenseThroughAndInto', 'barrierCard', {
      originalAttackMessage: {
        owner: {
          messageId: 'attack0'
        }
      }
    }, diego)).toBe(false)
  })

  it('leaves the other buttons alone', async () => {
    game.user = player
    store[CONSUMED_CARDS] = {
      [defenseKey('attack1', 'diego')]: 1
    }
    expect(await mayDefend('resistanceCard', 'attack1', {
    }, diego)).toBe(true)
  })
})
