import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  handleTargetInfo, checkFanningTargets
} = await import('../modules/rolls/roll-prepare-case/rollData-Weapon.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_PrepareRollHelper
} = await import('../modules/rolls/roll-prepare-helpers.js')
const {
  SR5_SystemHelpers
} = await import('../modules/system/utilitySystem.js')
const {
  SR5_UtilityItem
} = await import('../modules/entities/items/utilityItem.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  SR5Conceal
} = await import('../modules/interface/conceal.js')
const {
  SR5Pickpocket
} = await import('../modules/interface/pickpocket.js')
const {
  SR5StorageLock
} = await import('../modules/interface/storage-lock-actions.js')
const {
  presetLocks, resetWhispers
} = await import('../modules/system/rule-locks.js')

// B13, lot 3 (PLAN-AUTOMATISATION-LEGERE.md, family 2 "ranges"): each site keeps its test, only its exit goes
// through refuseByRule. Book: refused as before. Lifted: the action goes on, the active GM is asked to whisper it,
// and the computation is the same (a shot beyond extreme range takes the extreme range modifier)

let settings, emits, distance
const flush = () => new Promise(resolve => setTimeout(resolve, 30))
const lift = () => {
  settings.sr5RuleLocks = {
    ...presetLocks('book'), ranges: false
  }
}
const whispered = () => emits.filter(([type]) => type === 'ruleLockWhisper').map(([, data]) => data.key)

beforeEach(() => {
  resetWhispers()
  // A world migrated to the book
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'), sr5LockpickRequiresKit: true,
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.i18n = {
    localize: k => k, format: k => k, has: () => true
  }
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse', targets: new Set()
  }
  globalThis.game.users = {
    activeGM: {
      id: 'gm'
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  emits = []
  vi.spyOn(SR5_SocketHandler, 'emitForGM').mockImplementation(async (type, data) => {
    emits.push([type, data])
  })

  // A scene with a measured distance between the shooter and the point aimed at
  distance = 100
  vi.spyOn(SR5_CombatHelpers, 'environmentScene').mockReturnValue({
    id: 's1'
  })
  vi.spyOn(SR5_CombatHelpers, 'environmentalColumns').mockReturnValue(null)
  vi.spyOn(SR5_CombatHelpers, 'airVisibilityRow').mockReturnValue(0)
  vi.spyOn(SR5_CombatHelpers, 'handleEnvironmentalModifiers').mockReturnValue(0)
  vi.spyOn(SR5_CombatHelpers, 'meleeEnvironmentalMod').mockReturnValue(0)
  vi.spyOn(SR5_CombatHelpers, 'meleeEnvironmentBalanced').mockReturnValue(false)
  vi.spyOn(SR5_EntityHelpers, 'getActorCanvasPosition').mockReturnValue({
    x: 0, y: 0
  })
  vi.spyOn(SR5_PrepareRollHelper, 'getTargetedActor').mockResolvedValue({
    type: 'actorPc', items: []
  })
  vi.spyOn(SR5_PrepareRollHelper, 'getTargetedActorID').mockResolvedValue('t1')
  vi.spyOn(SR5_SystemHelpers, 'getDistanceInMetersBetweenTwoPoint').mockImplementation(async () => distance)
  vi.spyOn(SR5_SystemHelpers, 'isInMeleeRange').mockReturnValue(false)
  vi.spyOn(SR5_SystemHelpers, 'getTemplateItemPosition').mockResolvedValue({
    x: 0, y: 0
  })
  vi.spyOn(SR5_SystemHelpers, 'findItemTemplate').mockReturnValue({
    id: 'tpl'
  })
  vi.spyOn(SR5_UtilityItem, 'getWeaponLightCompensation').mockReturnValue(0)
  vi.spyOn(SR5_UtilityItem, 'getWeaponLightCap').mockReturnValue(0)
  vi.spyOn(SR5_RollMessage, 'removeTemplate').mockResolvedValue()
  globalThis.canvas = {
    grid: {
    }, scene: {
      grid: {
        distance: 1.5
      }, tokens: []
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.users
  delete globalThis.canvas
})

const shooter = {
  id: 'a1', uuid: 'Actor.a1', name: 'Clo', isToken: false, items: [], system: {
  }
}
const token = (id, x = 0, y = 0) => ({
  document: {
    x, y, getOccupiedGridSpaceOffsets: () => []
  }, actor: {
    id, isToken: false
  }
})

// A pistol (range table 5/20/40/60 m), or another weapon built on the same base
const weapon = (system = {
}) => ({
  id: 'w1', uuid: 'Actor.a1.Item.w1', system: {
    category: 'rangedWeapon', type: 'heavyPistol', firingMode: {
    }, accessory: [], range: {
      short: {
        value: 5
      }, medium: {
        value: 20
      }, long: {
        value: 40
      }, extreme: {
        value: 60
      }
    }, ...system
  }
})
const rollData = () => ({
  target: {
  }, combat: {
    choke: {
    }, grenade: {
    }, firingMode: {
    }, ammo: {
    }
  }, chatCard: {
  }, dicePool: {
    modifiers: []
  }
})

describe('B13 lot 3, beyond extreme range (SR5 p. 186)', () => {
  it('book: the shot is refused, as before', async () => {
    game.user.targets = new Set([token('t1')])
    expect(await handleTargetInfo(rollData(), shooter, weapon())).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetIsTooFar')
  })
  it('family lifted: the shot goes, with the extreme range modifier, and the GM is whispered', async () => {
    lift()
    game.user.targets = new Set([token('t1')])
    const result = await handleTargetInfo(rollData(), shooter, weapon())
    expect(result).not.toBe(false)
    expect(result.target.range).toBe('extreme')
    expect(result.target.rangeInMeters).toBe(100)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    await flush()
    expect(whispered()).toEqual(['SR5.WARN_TargetIsTooFar'])
  })
  it('book: a grenade thrown too far loses its template; lifted, it keeps it and goes at extreme range', async () => {
    const grenade = weapon({
      category: 'grenade', type: 'grenade', blast: {
        radius: 10, damageFallOff: -1
      }
    })
    expect(await handleTargetInfo(rollData(), shooter, grenade)).toBe(false)
    expect(SR5_RollMessage.removeTemplate).toHaveBeenCalledWith(null, grenade.uuid)
    SR5_RollMessage.removeTemplate.mockClear()
    lift()
    const result = await handleTargetInfo(rollData(), shooter, grenade)
    expect(result.target.range).toBe('extreme')
    expect(SR5_RollMessage.removeTemplate).not.toHaveBeenCalled()
  })
  it('within extreme range nothing changes, lifted or not', async () => {
    distance = 50
    lift()
    const result = await handleTargetInfo(rollData(), shooter, weapon())
    expect(result.target.range).toBe('extreme')
    await flush()
    expect(whispered()).toEqual([])
  })
})

describe('B13 lot 3, melee reach (SR5 p. 187)', () => {
  const blade = weapon({
    category: 'meleeWeapon', type: 'blade', reach: {
      value: 0
    }
  })
  it('book: a target out of reach is refused', async () => {
    distance = 6
    game.user.targets = new Set([token('t1')])
    expect(await handleTargetInfo(rollData(), shooter, blade)).toBe(false)
  })
  it('family lifted: the attack goes', async () => {
    lift()
    distance = 6
    game.user.targets = new Set([token('t1')])
    const result = await handleTargetInfo(rollData(), shooter, blade)
    expect(result).not.toBe(false)
    // The weapon's Reach is copied by the caller (rollData-Weapon.js) before handleTargetInfo, whatever the scene
    await flush()
    expect(whispered()).toEqual(['SR5.WARN_TargetIsTooFar'])
  })
})

describe('B13 lot 3, one target per attack', () => {
  it('book: two targets are refused', async () => {
    distance = 10
    game.user.targets = new Set([token('t1'), token('t2')])
    expect(await handleTargetInfo(rollData(), shooter, weapon())).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetTooMany')
  })
  it('family lifted: the attack goes, at the range of the last target', async () => {
    lift()
    distance = 10
    game.user.targets = new Set([token('t1'), token('t2')])
    const result = await handleTargetInfo(rollData(), shooter, weapon())
    expect(result).not.toBe(false)
    expect(result.target.range).toBe('medium')
    await flush()
    expect(whispered()).toEqual(['SR5.WARN_TargetTooMany'])
  })
})

describe('B13 lot 3, flamethrower fanning (Gun H(e)aven 3 p. 3)', () => {
  const attacker = {
    x: 0, y: 0
  }
  it('book: too many, out of range or too far apart is refused', async () => {
    expect(await checkFanningTargets([token('1'), token('2'), token('3'), token('4')], attacker, 20, shooter)).toBe(false)
    distance = 30
    expect(await checkFanningTargets([token('1'), token('2')], attacker, 20, shooter)).toBe(false)
    distance = 10
    expect(await checkFanningTargets([token('1'), token('2')], attacker, 20, shooter)).toBe(false)
    expect(ui.notifications.warn.mock.calls.map(c => c[0])).toEqual([
      'SR5.WARN_FanningTooMany', 'SR5.WARN_FanningOutOfRange', 'SR5.WARN_FanningTooFar'
    ])
  })
  it('family lifted: the sweep strikes every target as aimed', async () => {
    lift()
    distance = 30
    const fanning = await checkFanningTargets([token('1'), token('2'), token('3'), token('4', 10)], attacker, 20, shooter)
    expect(fanning.actorIds).toEqual(['1', '2', '3', '4'])
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    await flush()
    expect(whispered()).toEqual(['SR5.WARN_FanningTooMany', 'SR5.WARN_FanningOutOfRange', 'SR5.WARN_FanningTooFar'])
  })
})

describe('B13 lot 3, pat-down out of reach (SR5 p. 422)', () => {
  const observer = {
    id: 'a1', name: 'Clo', isOwner: true, isToken: false
  }
  beforeEach(() => {
    game.user.targets = new Set([{
      document: {
        name: 'Garde', actor: {
          id: 't1'
        }
      }
    }])
    vi.spyOn(SR5Pickpocket, 'actorIdOf').mockReturnValue('t1')
    vi.spyOn(SR5Pickpocket, 'actorsInReach').mockReturnValue(false)
    vi.spyOn(SR5Conceal, 'askSearch').mockResolvedValue(null)
  })
  it('book: refused before the search is asked', async () => {
    await SR5Conceal.startSearch(observer, 'patDown')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_ConcealSearchReach')
    expect(SR5Conceal.askSearch).not.toHaveBeenCalled()
  })
  it('family lifted: the search is asked, and the GM is whispered', async () => {
    lift()
    await SR5Conceal.startSearch(observer, 'patDown')
    expect(SR5Conceal.askSearch).toHaveBeenCalled()
    await flush()
    expect(whispered()).toEqual(['SR5.WARN_ConcealSearchReach'])
  })
})

describe('B13 lot 3, lock picked from afar', () => {
  const storageToken = {
    uuid: 'Scene.s1.Token.st', parent: 's1'
  }
  const pickerToken = {
    uuid: 'Scene.s1.Token.pk', parent: 's1'
  }
  const storage = {
    token: storageToken
  }
  const picker = {
    name: 'Clo', token: pickerToken
  }
  it('book: refused', async () => {
    vi.spyOn(SR5StorageLock, 'squaresBetween').mockReturnValue(5)
    await SR5StorageLock.requestPick(storage, picker)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StorageLockTooFar')
    expect(emits).toEqual([])
  })
  it('family lifted: the request goes to the GM, who is whispered', async () => {
    lift()
    vi.spyOn(SR5StorageLock, 'squaresBetween').mockReturnValue(5)
    await SR5StorageLock.requestPick(storage, picker)
    await flush()
    expect(emits.map(([type]) => type).sort()).toEqual(['ruleLockWhisper', 'storageLockPick'])
  })
  it('family lifted: no token on the scene is still refused, there is no distance to forgive', async () => {
    lift()
    vi.spyOn(SR5StorageLock, 'squaresBetween').mockReturnValue(Infinity)
    await SR5StorageLock.requestPick(storage, picker)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StorageLockTooFar')
    expect(emits).toEqual([])
  })
})
