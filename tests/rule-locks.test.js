import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const whispers = []
const emits = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async (type, data) => {
      emits.push([type, data])
    },
  },
}))
vi.mock('../modules/entities/actors/entityActor-helpers.js', () => ({
  SR5_ActorHelper: {
    whisperGM: async text => {
      whispers.push(text)
    },
  },
}))

const {
  RULE_LOCK_FAMILIES, RULE_LOCK_KEYS, presetLocks, presetOf, normalizeLocks, locksFromLegacy, legacyFromLocks,
  currentRuleLocks, ruleLockActive, refuseByRule, capByRule, shouldWhisper, resetWhispers, setRuleLocks,
  runRuleLocksMigration, socketRuleLockWhisper,
} = await import('../modules/system/rule-locks.js')

// B13, lot 0 (PLAN-AUTOMATISATION-LEGERE.md, § 2): the shared function and its settings, no site wired yet

let store, notes
const flush = () => new Promise(resolve => setTimeout(resolve, 30))

beforeEach(() => {
  resetWhispers()
  whispers.length = 0
  emits.length = 0
  notes = []
  // A world as Foundry gives it before any change: every setting at its registered default
  store = {
    sr5BlockMissingActions: false, sr5StorageCheckGarageLifestyle: true, sr5LockpickRequiresKit: true,
    sr5RuleLocks: presetLocks('book'), sr5RuleLocksPreset: 'book', sr5RuleLocksMigration: 0,
  }
  game.settings = {
    get: (_s, k) => store[k],
    set: async (_s, k, v) => {
      store[k] = JSON.parse(JSON.stringify(v))
      return v
    },
  }
  game.user = {
    id: 'p1', isGM: false, name: 'Joueuse'
  }
  game.users = {
    activeGM: {
      id: 'gm'
    },
    get: id => ({
      id, name: id === 'p1' ? 'Joueuse' : 'MJ'
    }),
  }
  game.combat = null
  game.i18n = {
    localize: k => k,
    format: (k, d) => `${k}${d && Object.keys(d).length ? JSON.stringify(d) : ''}`,
  }
  globalThis.ui = {
    notifications: {
      warn: m => notes.push(['warn', m]), info: m => notes.push(['info', m])
    }
  }
})

describe('presets and families', () => {
  it('has the seven families of the survey, the box of "actions" and the two boxes of "objects"', () => {
    expect(RULE_LOCK_FAMILIES).toEqual(['actions', 'ranges', 'ammo', 'magic', 'matrix', 'body', 'objects'])
    expect(RULE_LOCK_KEYS).toEqual([...RULE_LOCK_FAMILIES, 'missingActions', 'garage', 'lockpick'])
  })

  it('"book" checks every box, "light" unchecks every box, anything else is "custom"', () => {
    expect(Object.values(presetLocks('book')).every(v => v === true)).toBe(true)
    expect(Object.values(presetLocks('light')).every(v => v === false)).toBe(true)
    expect(presetOf(presetLocks('book'))).toBe('book')
    expect(presetOf(presetLocks('light'))).toBe('light')
    expect(presetOf({
      ...presetLocks('book'), ammo: false
    })).toBe('custom')
    expect(presetOf({
      ...presetLocks('light'), garage: true
    })).toBe('custom')
  })

  it('reads a missing box as the book (a family added later stays locked)', () => {
    expect(normalizeLocks({
      actions: false
    })).toEqual({
      ...presetLocks('book'), actions: false
    })
    expect(normalizeLocks(undefined)).toEqual(presetLocks('book'))
  })

  it('a box of a family is on only while its family is on', () => {
    const locks = presetLocks('book')
    expect(ruleLockActive('objects', 'lockpick', locks)).toBe(true)
    expect(ruleLockActive('objects', 'lockpick', {
      ...locks, objects: false
    })).toBe(false)
    expect(ruleLockActive('objects', 'lockpick', {
      ...locks, lockpick: false
    })).toBe(false)
    expect(ruleLockActive('objects', null, {
      ...locks, lockpick: false
    })).toBe(true)
  })

  it('defaults to the book when no world is there to read', () => {
    const settings = game.settings
    game.settings = undefined
    expect(currentRuleLocks()).toEqual(presetLocks('book'))
    game.settings = settings
  })
})

describe('migration of the three former settings', () => {
  it('copies them as they stand: a default world keeps its missing actions unlocked, hence "custom"', async () => {
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks).toEqual({
      ...presetLocks('book'), missingActions: false
    })
    expect(store.sr5RuleLocksPreset).toBe('custom')
    expect(store.sr5RuleLocksMigration).toBe(2)
  })

  it('a world that had sr5BlockMissingActions checked finds the "missing actions" box checked', async () => {
    store.sr5BlockMissingActions = true
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks.missingActions).toBe(true)
    expect(store.sr5RuleLocksPreset).toBe('book')
  })

  it('keeps the garage and lockpick boxes a world had unchecked', async () => {
    store.sr5StorageCheckGarageLifestyle = false
    store.sr5LockpickRequiresKit = false
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks.garage).toBe(false)
    expect(store.sr5RuleLocks.lockpick).toBe(false)
    expect(store.sr5RuleLocks.objects).toBe(true)
  })

  it('runs once: a later change of the boxes is not overwritten', async () => {
    await runRuleLocksMigration()
    store.sr5RuleLocks = presetLocks('light')
    store.sr5BlockMissingActions = true
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks).toEqual(presetLocks('light'))
  })

  it('before the migration has run, the former settings still speak', () => {
    store.sr5BlockMissingActions = false
    expect(ruleLockActive('actions', 'missingActions')).toBe(false)
    store.sr5BlockMissingActions = true
    expect(ruleLockActive('actions', 'missingActions')).toBe(true)
    store.sr5LockpickRequiresKit = false
    expect(ruleLockActive('objects', 'lockpick')).toBe(false)
  })

  it('saving the boxes writes the preset and keeps the three former settings in step', async () => {
    await setRuleLocks({
      ...presetLocks('book'), objects: false
    })
    expect(store.sr5RuleLocksPreset).toBe('custom')
    expect(store.sr5BlockMissingActions).toBe(true)
    expect(store.sr5StorageCheckGarageLifestyle).toBe(false)
    expect(store.sr5LockpickRequiresKit).toBe(false)
    expect(store.sr5RuleLocksMigration).toBe(2)
    await setRuleLocks(presetLocks('light'))
    expect(store.sr5RuleLocksPreset).toBe('light')
    expect(legacyFromLocks(presetLocks('light'))).toEqual({
      sr5BlockMissingActions: false, sr5StorageCheckGarageLifestyle: false, sr5LockpickRequiresKit: false
    })
  })

  it('a default world keeps the "actions" family checked: the interruption, the active defense and the Edge still refuse', async () => {
    expect(ruleLockActive('actions')).toBe(true)
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks.actions).toBe(true)
    expect(ruleLockActive('actions')).toBe(true)
    expect(ruleLockActive('actions', 'missingActions')).toBe(false)
  })

  it('a new world starts with the book, every box checked, the former setting written in step', async () => {
    await runRuleLocksMigration({
      newWorld: true
    })
    expect(store.sr5RuleLocks).toEqual(presetLocks('book'))
    expect(store.sr5RuleLocksPreset).toBe('book')
    expect(store.sr5BlockMissingActions).toBe(true)
    expect(store.sr5RuleLocksMigration).toBe(2)
  })

  it('migration 2 moves the "actions" box of a world migrated once to "missing actions", and checks the family', async () => {
    store.sr5RuleLocksMigration = 1
    const {
      missingActions: _, ...v1
    } = {
      ...presetLocks('book'), actions: false, magic: false
    }
    store.sr5RuleLocks = v1
    expect(ruleLockActive('actions')).toBe(true)
    expect(ruleLockActive('actions', 'missingActions')).toBe(false)
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks).toEqual({
      ...presetLocks('book'), missingActions: false, magic: false
    })
    expect(store.sr5RuleLocksMigration).toBe(2)
  })

  it('migration 2 leaves a world chosen "light" light', async () => {
    store.sr5RuleLocksMigration = 1
    const {
      missingActions: _, ...v1
    } = presetLocks('light')
    store.sr5RuleLocks = v1
    await runRuleLocksMigration()
    expect(store.sr5RuleLocks).toEqual(presetLocks('light'))
    expect(store.sr5RuleLocksPreset).toBe('light')
  })

  it('locksFromLegacy reads only booleans set to true as checked', () => {
    expect(locksFromLegacy(() => undefined)).toEqual({
      ...presetLocks('book'), missingActions: false, garage: false, lockpick: false
    })
  })
})

describe('refuseByRule and capByRule', () => {
  const actor = {
    id: 'a1', name: 'Dodger'
  }

  it('lock on: the site\'s message, and the action stops', async () => {
    store.sr5RuleLocksMigration = 1
    expect(refuseByRule('ammo', 'SR5.WARN_FiringModeAmmo', null, {
      actor
    })).toBe(true)
    await flush()
    expect(notes).toEqual([['warn', 'SR5.WARN_FiringModeAmmo']])
    expect(whispers).toEqual([])
  })

  it('lock lifted: the action goes on, the player sees nothing, the gamemaster gets a whisper', async () => {
    store.sr5RuleLocksMigration = 1
    store.sr5RuleLocks = presetLocks('light')
    expect(refuseByRule('ammo', 'SR5.WARN_FiringModeAmmo', null, {
      actor
    })).toBe(false)
    await flush()
    expect(notes).toEqual([])
    // The player's browser writes no chat line (Foundry would show her own whisper to her): it asks the active GM
    expect(whispers).toEqual([])
    expect(emits).toEqual([['ruleLockWhisper', {
      family: 'ammo', key: 'SR5.WARN_FiringModeAmmo', data: {
      }, actor: 'Dodger'
    }]])
    // ... whose browser writes the whisper
    game.user = {
      id: 'gm', isGM: true, name: 'MJ'
    }
    await socketRuleLockWhisper({
      type: 'ruleLockWhisper', data: emits[0][1], userId: 'gm'
    }, 'p1')
    expect(whispers).toHaveLength(1)
    expect(whispers[0]).toContain('SR5.RULELOCKS_Whisper')
    expect(whispers[0]).toContain('Dodger')
  })

  it('no active gamemaster: nobody to tell, and the action still goes on', async () => {
    store.sr5RuleLocksMigration = 2
    store.sr5RuleLocks = presetLocks('light')
    game.users.activeGM = null
    expect(refuseByRule('ammo', 'SR5.WARN_FiringModeAmmo', null, {
      actor
    })).toBe(false)
    await flush()
    expect(emits).toEqual([])
    expect(notes).toEqual([])
  })

  it('the whisper is written only by the active gamemaster, for a family and a key the system knows', async () => {
    const ask = (data, userId = 'gm') => socketRuleLockWhisper({
      type: 'ruleLockWhisper', data, userId
    }, 'p1')
    game.user = {
      id: 'gm2', isGM: true, name: 'MJ 2'
    }
    await ask({
      family: 'ammo', key: 'SR5.WARN_FiringModeAmmo', data: {
      }, actor: 'Dodger'
    })
    game.user = {
      id: 'gm', isGM: true, name: 'MJ'
    }
    await ask({
      family: 'nope', key: 'SR5.WARN_FiringModeAmmo'
    })
    await ask({
      family: 'ammo', key: '<b>x</b>'
    })
    await ask({
      family: 'ammo', key: 'SR5.WARN_FiringModeAmmo', data: {
        a: {
          b: 1
        }
      }
    })
    expect(whispers).toEqual([])
    await ask({
      family: 'actions', key: 'SR5.WARN_NoActionLeft', data: {
        actor: 'Dodger', value: 1
      }
    })
    expect(whispers).toHaveLength(1)
  })

  it('the gamemaster acting with a lock lifted gets a notification, no chat line', async () => {
    store.sr5RuleLocksMigration = 1
    store.sr5RuleLocks = presetLocks('light')
    game.user = {
      id: 'gm', isGM: true, name: 'MJ'
    }
    expect(refuseByRule('ranges', 'SR5.WARN_TargetIsTooFar', null, {
      actor
    })).toBe(false)
    await flush()
    expect(notes).toEqual([['info', 'SR5.WARN_TargetIsTooFar']])
    expect(whispers).toEqual([])
  })

  it('whispers once per actor, message and combat round', async () => {
    store.sr5RuleLocksMigration = 1
    store.sr5RuleLocks = presetLocks('light')
    game.combat = {
      id: 'c1', round: 1, started: true
    }
    for (let i = 0; i < 10; i++) refuseByRule('ranges', 'SR5.WARN_FanningTooMany', null, {
      actor
    })
    refuseByRule('ranges', 'SR5.WARN_FanningTooMany', null, {
      actor: {
        id: 'a2', name: 'Pierre'
      }
    })
    refuseByRule('ranges', 'SR5.WARN_TargetIsTooFar', null, {
      actor
    })
    await flush()
    expect(emits).toHaveLength(3)
    game.combat.round = 2
    refuseByRule('ranges', 'SR5.WARN_FanningTooMany', null, {
      actor
    })
    await flush()
    expect(emits).toHaveLength(4)
  })

  it('out of combat, the same whisper waits ten seconds', () => {
    expect(shouldWhisper('a1', 'K', {
      combat: null, now: 0
    })).toBe(true)
    expect(shouldWhisper('a1', 'K', {
      combat: null, now: 9000
    })).toBe(false)
    expect(shouldWhisper('a1', 'K', {
      combat: null, now: 20000
    })).toBe(true)
  })

  it('a cap: capped with the lock on, the value entered with the lock lifted, untouched within it', async () => {
    store.sr5RuleLocksMigration = 1
    expect(capByRule('magic', 7, 5, 'SR5.WARN_SpellShapingMaxMagic', null)).toBe(5)
    expect(capByRule('magic', 4, 5, 'SR5.WARN_SpellShapingMaxMagic', null)).toBe(4)
    expect(notes).toHaveLength(1)
    store.sr5RuleLocks = {
      ...presetLocks('book'), magic: false
    }
    expect(capByRule('magic', 7, 5, 'SR5.WARN_SpellShapingMaxMagic', null, {
      actor
    })).toBe(7)
    await flush()
    expect(emits).toHaveLength(1)
  })
})
