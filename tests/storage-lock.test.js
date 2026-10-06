import {
  describe, it, expect
} from 'vitest'
import {
  defaultLockFor, isLocked, pickStages, pickPool, pickLimit, lockTools, underLimit, antiTamperOf,
  extendedTest, isPickRequestAllowed, lockedOwnership, unlockedOwnership, lockedRightsChange,
} from '../modules/interface/storage-lock.js'

// Security lot (Sixtine, after Odile): the GM's change of rights while it is shut
describe('a right granted while it is shut', () => {
  it('never reaches the server above Limited: it becomes the wish', () => {
    const result = lockedRightsChange({
      p1: 3
    }, {
    }, ['gm'])
    expect(result.ownership).toEqual({
      p1: 1
    })
    expect(result.saved).toEqual({
      p1: 3
    })
  })
  it('a Limited set by hand is the GM\'s wish, kept once it is open', () => {
    const result = lockedRightsChange({
      p1: 1
    }, {
      p1: 3
    }, ['gm'])
    expect(result.saved).toEqual({
      p1: 1
    })
    // The sync that follows keeps it, and opening applies it
    const after = lockedOwnership({
      p1: 1
    }, result.saved, ['gm'])
    expect(after.saved).toEqual({
      p1: 1
    })
    expect(unlockedOwnership({
      p1: 1
    }, after.saved)).toEqual({
      p1: 1
    })
  })
  it('key holders, GMs and keys sent back to the default are left alone', () => {
    const result = lockedRightsChange({
      gm: 3, key: 3, '-=p2': null
    }, {
    }, ['gm', 'key'])
    expect(result.ownership).toEqual({
      gm: 3, key: 3, '-=p2': null
    })
    expect(result.saved).toEqual({
    })
  })
  it('the default level is held back like a user', () => {
    expect(lockedRightsChange({
      default: 3
    }, {
    }, []).ownership).toEqual({
      default: 1
    })
  })
})

const lock = (over = {
}) => ({
  type: 'maglock', rating: 4, wireless: false, antiTamper: 0, locked: true, ...over
})

describe('defaultLockFor', () => {
  it('gives a safe a rating 4 maglock, wireless off, locked', () => {
    expect(defaultLockFor('safe')).toEqual({
      type: 'maglock', rating: 4, wireless: false, antiTamper: 0, locked: true
    })
  })
  it('gives nothing to the other storages', () => {
    for (const type of ['stash', 'backpack', 'cache', 'garage', '']) expect(defaultLockFor(type)).toBeNull()
  })
})

describe('isLocked / isLockedAway', () => {
  it('needs both a lock and the lock shut', () => {
    expect(isLocked({
      system: {
        lock: lock()
      }
    })).toBe(true)
    expect(isLocked({
      system: {
        lock: lock({
          locked: false
        })
      }
    })).toBe(false)
    expect(isLocked({
      system: {
        lock: lock({
          type: ''
        })
      }
    })).toBe(false)
    expect(isLocked({
      system: {
      }
    })).toBe(false)
  })
})

describe('picking tests (SR5 p. 365)', () => {
  it('a mechanical lock is one test against its rating', () => {
    expect(pickStages(lock({
      type: 'mechanical', rating: 3
    }))).toEqual([{
      key: 'lock', threshold: 3
    }])
  })
  it('a maglock is the casing, then the rewiring, both at rating x 2', () => {
    expect(pickStages(lock({
      rating: 4
    })).map(s => s.threshold)).toEqual([8, 8])
  })
  it('no lock, nothing to pick', () => {
    expect(pickStages(lock({
      type: ''
    }))).toEqual([])
  })
  it('takes the sheet pool, Locksmith + Agility otherwise', () => {
    expect(pickPool({
      rating: {
        value: 3
      }, test: {
        dicePool: 6
      }
    }, 4)).toBe(6)
    expect(pickPool({
      rating: {
        value: 3
      }
    }, 4)).toBe(7)
  })
  it('an autopicker rating stands in for Locksmith when better (p. 365, arbitrage de DjamZ)', () => {
    const untrained = {
      rating: {
        value: 0
      }, canDefault: false
    }
    expect(pickPool(untrained, 4, 3)).toBe(7)
    expect(pickPool({
      rating: {
        value: 5
      }, test: {
        dicePool: 9
      }
    }, 4, 3)).toBe(9)
  })
  it('untrained, no dice unless the skill can be defaulted', () => {
    expect(pickPool({
      rating: {
        value: 0
      }, canDefault: false
    }, 4)).toBe(0)
    expect(pickPool({
      rating: {
        value: 0
      }, canDefault: true
    }, 4)).toBe(3)
  })
  it('an autopicker adds its rating to the limit, on a mechanical lock only (p. 450)', () => {
    expect(pickLimit(5, 0, 'mechanical')).toBe(5)
    expect(pickLimit(5, 3, 'mechanical')).toBe(8)
    expect(pickLimit(5, 3, 'maglock')).toBe(5)
  })
  it('shutting a maglock again is one test: the casing put back', () => {
    expect(pickStages(lock({
      rating: 3
    }), true)).toEqual([{
      key: 'casingBack', threshold: 6
    }])
    expect(pickStages(lock({
      type: 'mechanical', rating: 3
    }), true)).toEqual([{
      key: 'lock', threshold: 3
    }])
  })
  it('a limit of 0 lets no hit through', () => {
    expect(underLimit(4, 0)).toBe(0)
    expect(underLimit(4, 2)).toBe(2)
  })
  it('only a maglock has an anti-tamper system', () => {
    expect(antiTamperOf(lock({
      antiTamper: 3
    }))).toBe(3)
    expect(antiTamperOf(lock({
      type: 'mechanical', antiTamper: 3
    }))).toBe(0)
  })
})

describe('lockTools', () => {
  const gear = (name, itemRating = 0) => ({
    type: 'itemGear', name, system: {
      itemRating
    }
  })
  it('finds a kit and the best autopicker by name', () => {
    expect(lockTools([gear('Kit de serrurerie')])).toEqual({
      kit: true, autopicker: 0
    })
    expect(lockTools([gear('Autocrocheteur', 2), gear('Autopicker', 4)])).toEqual({
      kit: true, autopicker: 4
    })
    expect(lockTools([gear('Medkit')])).toEqual({
      kit: false, autopicker: 0
    })
  })
  it('a kit put away in a storage does not count', () => {
    expect(lockTools([gear('Kit de serrurerie')], () => true).kit).toBe(false)
  })
})

describe('extendedTest', () => {
  const dice = (...hits) => {
    const pools = []
    return {
      pools, roll: async (n) => {
        pools.push(n)
        return {
          hits: hits.shift() ?? 0, glitch: false, criticalGlitch: false
        }
      }
    }
  }
  it('rolls one die fewer each time until the threshold is met', async () => {
    const d = dice(2, 2, 2)
    const r = await extendedTest(6, 5, 6, d.roll)
    expect(d.pools).toEqual([6, 5, 4])
    expect(r).toMatchObject({
      hits: 6, rolls: 3, reached: true
    })
  })
  it('counts hits under the limit', async () => {
    const r = await extendedTest(3, 4, 1, dice(3, 3, 3).roll)
    expect(r).toMatchObject({
      hits: 3, reached: false
    })
  })
  it('a limit of 0 means no hit at all', async () => {
    const r = await extendedTest(3, 1, 0, dice(3, 3, 3).roll)
    expect(r).toMatchObject({
      hits: 0, reached: false
    })
  })
  it('a critical glitch ends it on a failure', async () => {
    const r = await extendedTest(5, 1, 5, async () => ({
      hits: 0, glitch: true, criticalGlitch: true
    }))
    expect(r).toMatchObject({
      rolls: 1, reached: false, criticalGlitch: true
    })
  })
})

describe('isPickRequestAllowed (GM check of a socket request)', () => {
  const storage = (locked = true) => ({
    id: 's', type: 'actorStorage', system: {
      lock: lock({
        locked
      })
    }
  })
  const picker = {
    id: 'p', type: 'actorPc'
  }
  const base = {
    storage: storage(), picker, relock: false, distance: 1, senderOwns: () => true
  }
  it('lets an owner beside a locked storage pick it', () => {
    expect(isPickRequestAllowed(base)).toBe(true)
  })
  it('refuses a sender who does not own the picker (forged request)', () => {
    expect(isPickRequestAllowed({
      ...base, senderOwns: () => false
    })).toBe(false)
  })
  it('refuses a picker too far away', () => {
    expect(isPickRequestAllowed({
      ...base, distance: 5
    })).toBe(false)
    expect(isPickRequestAllowed({
      ...base, distance: Infinity
    })).toBe(false)
  })
  it('refuses to open what is open, or to shut what is shut', () => {
    expect(isPickRequestAllowed({
      ...base, storage: storage(false)
    })).toBe(false)
    expect(isPickRequestAllowed({
      ...base, relock: true
    })).toBe(false)
    expect(isPickRequestAllowed({
      ...base, storage: storage(false), relock: true
    })).toBe(true)
  })
  it('refuses a storage as picker, or a missing one', () => {
    expect(isPickRequestAllowed({
      ...base, picker: {
        id: 'x', type: 'actorStorage'
      }
    })).toBe(false)
    expect(isPickRequestAllowed({
      ...base, storage: null
    })).toBe(false)
  })
})

describe('ownership follows the lock', () => {
  const keep = ['alice', 'gm']
  it('holds everyone but the key holders and GMs at Limited, and gives it back', () => {
    const before = {
      default: 2, alice: 3, gm: 3, bob: 3, carol: 0
    }
    const {
      ownership, saved
    } = lockedOwnership(before, {
    }, keep)
    expect(ownership).toEqual({
      default: 1, alice: 3, gm: 3, bob: 1, carol: 0
    })
    expect(saved).toEqual({
      default: 2, bob: 3
    })
    expect(unlockedOwnership(ownership, saved)).toEqual(before)
  })
  it('is idempotent: fed its own result, it changes nothing', () => {
    const first = lockedOwnership({
      default: 3, bob: 2
    }, {
    }, keep)
    const again = lockedOwnership(first.ownership, first.saved, keep)
    expect(again.changed).toBe(false)
    expect(again.ownership).toEqual(first.ownership)
  })
  it('a right granted while it is shut is held back, and applies once open (Olive #1)', () => {
    // Shut, nobody above Limited; then the GM grants Owner to all
    const shut = lockedOwnership({
      default: 0
    }, {
    }, keep)
    const granted = lockedOwnership({
      ...shut.ownership, default: 3
    }, shut.saved, keep)
    expect(granted.ownership.default).toBe(1)
    expect(granted.saved.default).toBe(3)
    expect(unlockedOwnership(granted.ownership, granted.saved).default).toBe(3)
  })
  it('a change the GM makes while it is shut survives the opening (Olive #2)', () => {
    // Shut with default Observer kept aside, then the GM raises it to Owner
    const shut = lockedOwnership({
      default: 2
    }, {
    }, keep)
    const raised = lockedOwnership({
      ...shut.ownership, default: 3
    }, shut.saved, keep)
    expect(unlockedOwnership(raised.ownership, raised.saved).default).toBe(3)
    // ...or takes it away: it stays away
    const removed = lockedOwnership({
      ...shut.ownership, default: 0
    }, shut.saved, keep)
    expect(removed.saved.default).toBeUndefined()
    expect(unlockedOwnership(removed.ownership, removed.saved).default).toBe(0)
  })
  it('a right set by hand after opening is not overwritten', () => {
    expect(unlockedOwnership({
      default: 0, bob: 3
    }, {
      default: 2, bob: 2
    })).toEqual({
      default: 0, bob: 3
    })
  })
})
