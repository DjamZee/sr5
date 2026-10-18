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
// Automatisation : Personnalisée opens the system's settings on the Presets tab
const openedSettings = []
vi.mock('../modules/interface/settings-window.js', () => ({
  SR5SettingsConfig: class {
    constructor(options){
      this.options = options
    }
    render(){
      openedSettings.push(this.options)
    }
  },
}))

const {
  RULE_LOCK_FAMILIES, RULE_LOCK_KEYS, presetLocks, presetOf, normalizeLocks, locksFromLegacy, legacyFromLocks,
  currentRuleLocks, ruleLockActive, refuseByRule, capByRule, shouldWhisper, resetWhispers, setRuleLocks,
  runRuleLocksMigration, socketRuleLockWhisper, ruleLockWhisperText, ruleLockBinds,
} = await import('../modules/system/rule-locks.js')
const {
  readFileSync
} = await import('node:fs')

// B13, lot 0 (PLAN-AUTOMATISATION-LEGERE.md, § 2): the shared function and its settings, no site wired yet

let store, notes
// Waits for the dynamic imports the code under test starts (not a fixed delay, which a loaded machine can outlast)
const flush = async () => {
  await vi.dynamicImportSettled()
  await new Promise(resolve => setTimeout(resolve, 0))
}

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

  it('the gamemaster spared by the world (idea 11): his action goes, he reads which lock it passed', async () => {
    store.sr5RuleLocksMigration = 2
    game.user = {
      id: 'gm', isGM: true, name: 'MJ'
    }
    // Unchecked (default): refused like anyone
    expect(refuseByRule('ammo', 'SR5.WARN_FiringModeAmmo', null, {
      actor
    })).toBe(true)
    expect(ruleLockBinds('ammo')).toBe(true)
    store.sr5RuleLocksGMExempt = true
    notes.length = 0
    expect(refuseByRule('ammo', 'SR5.WARN_FiringModeAmmo', null, {
      actor
    })).toBe(false)
    await flush()
    expect(notes[0][0]).toBe('info')
    expect(ruleLockBinds('ammo')).toBe(false)
    // The lock itself stays on, for the players and the sockets the gamemaster's browser handles
    expect(ruleLockActive('ammo')).toBe(true)
    // A player is never spared
    game.user = {
      id: 'p1', isGM: false, name: 'Joueuse'
    }
    expect(refuseByRule('ammo', 'SR5.WARN_FiringModeAmmo', null, {
      actor
    })).toBe(true)
  })

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
    // Worded as the whisper (the rule lifted, the action gone), never as the bare refusal
    expect(notes).toHaveLength(1)
    expect(notes[0][0]).toBe('info')
    expect(notes[0][1]).toContain('SR5.RULELOCKS_Whisper')
    expect(notes[0][1]).toContain('SR5.WARN_TargetIsTooFar')
    expect(whispers).toEqual([])
  })

  it('a refusal with a lifted wording tells the gamemaster that wording, not the refusal', async () => {
    store.sr5RuleLocksMigration = 2
    store.sr5RuleLocks = presetLocks('light')
    game.user = {
      id: 'gm', isGM: true, name: 'MJ'
    }
    expect(refuseByRule('actions', 'SR5.WARN_NoActionLeft', null, {
      actor, liftedKey: 'SR5.RULELOCKS_NoActionLeftLifted'
    })).toBe(false)
    await flush()
    expect(notes).toHaveLength(1)
    expect(notes[0][1]).toContain('SR5.RULELOCKS_NoActionLeftLifted')
    expect(notes[0][1]).not.toContain('SR5.WARN_NoActionLeft')
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

describe('the preset asked in a new world (wish of DjamZ, 07/10)', () => {
  let wait
  beforeEach(() => {
    store.sr5RuleLocksAsk = ''
    game.users.activeGM = {
      id: 'p1', isSelf: true
    }
    wait = vi.fn(async () => 'advanced')
    openedSettings.length = 0
    globalThis.foundry.applications = {
      api: {
        DialogV2: {
          wait
        }
      }
    }
  })

  it('a new world: the active gamemaster is asked once, "Automatisation : Avancée" is the book', async () => {
    await runRuleLocksMigration({
      newWorld: true
    })
    expect(wait).toHaveBeenCalledTimes(1)
    expect(store.sr5RuleLocks).toEqual(presetLocks('book'))
    expect(store.sr5RuleLocksAsk).toBe('done')
    expect(openedSettings).toEqual([])
    // The page reloaded: no window any more
    await runRuleLocksMigration()
    expect(wait).toHaveBeenCalledTimes(1)
  })

  it('the window closed without a choice: the book', async () => {
    wait.mockResolvedValue(null)
    await runRuleLocksMigration({
      newWorld: true
    })
    expect(store.sr5RuleLocks).toEqual(presetLocks('book'))
    expect(store.sr5RuleLocksAsk).toBe('done')
  })

  it('"light" lifts everything', async () => {
    wait.mockResolvedValue('light')
    await runRuleLocksMigration({
      newWorld: true
    })
    expect(store.sr5RuleLocks).toEqual(presetLocks('light'))
    expect(store.sr5RuleLocksPreset).toBe('light')
  })

  it('"Personnalisée" applies nothing and opens the settings on the Presets tab (Élise, 14/10)', async () => {
    wait.mockResolvedValue('custom')
    await runRuleLocksMigration({
      newWorld: true
    })
    // The book the migration wrote stays, untouched by a preset
    expect(store.sr5RuleLocks).toEqual(presetLocks('book'))
    expect(store.sr5RuleLocksAsk).toBe('done')
    expect(openedSettings).toEqual([{
      initialCategory: 'presets'
    }])
  })

  it('the window offers exactly the three automation answers, Avancée ticked', async () => {
    await runRuleLocksMigration({
      newWorld: true
    })
    const content = wait.mock.calls[0][0].content
    expect([...content.matchAll(/value="(\w+)"/g)].map(m => m[1])).toEqual(['light', 'advanced', 'custom'])
    expect(content).toMatch(/value="advanced" checked/)
  })

  it('an existing world, migrated now or long ago: no window, nothing changes', async () => {
    await runRuleLocksMigration()
    store.sr5RuleLocksMigration = 2
    await runRuleLocksMigration()
    expect(wait).not.toHaveBeenCalled()
    expect(store.sr5RuleLocksAsk).toBe('')
  })

  it('a gamemaster who is not the active one is not asked; the active one will be', async () => {
    game.users.activeGM = {
      id: 'gm', isSelf: false
    }
    await runRuleLocksMigration({
      newWorld: true
    })
    expect(wait).not.toHaveBeenCalled()
    expect(store.sr5RuleLocksAsk).toBe('pending')
    game.users.activeGM.isSelf = true
    await runRuleLocksMigration()
    expect(wait).toHaveBeenCalledTimes(1)
  })
})

describe('the text of the whisper (B13, lot 2)', () => {
  // The site's message says what the refusal did ("nothing is spent"): the whisper says the action went, and gives
  // that message as the reason of the refusal lifted only
  const lang = file => JSON.parse(readFileSync(new URL(`../lang/${file}`, import.meta.url), 'utf8'))

  it('says who acted, which rule was lifted and that the action went, then the site\'s message', () => {
    for (const [file, went] of [['fr.json', "l'action est partie"], ['en.json', 'the action went through']]) {
      const text = lang(file)['SR5.RULELOCKS_Whisper']
      expect(text.startsWith('{actor}')).toBe(true)
      expect(text).toContain(went)
      expect(text.indexOf('{family}')).toBeLessThan(text.indexOf(went))
      expect(text.indexOf(went)).toBeLessThan(text.indexOf('{message}'))
    }
  })

  it('is written with the family, the actor and the site\'s message', () => {
    const fr = lang('fr.json')
    game.i18n = {
      localize: k => fr[k] ?? k,
      format: (k, d = {
      }) => (fr[k] ?? k).replace(/\{(\w+)\}/g, (_m, name) => d[name] ?? `{${name}}`),
    }
    expect(ruleLockWhisperText('ammo', 'SR5.WARN_FiringModeAmmo', {
      needed: 20, left: 3
    }, 'Dodger')).toBe("Dodger : règle « Munitions et armes » levée, l'action est partie. Motif du refus levé : " +
      'Ce mode de tir demande 20 unités de munitions, il en reste 3.')
  })
})
