import {
  describe, it, expect
} from 'vitest'
import {
  defaultLockFor, isLocked, isLockedAway, pickStages, pickPool, pickLimit, lockTools,
  extendedTest, isPickRequestAllowed, lockedOwnership, unlockedOwnership,
} from '../modules/interface/storage-lock.js'

const lock = (over = {
}) => ({
  type: 'maglock', rating: 4, wireless: false, antiTamper: 0, locked: true, ...over
})
const storageItem = (id, l) => ({
  id, type: 'itemStorage', system: {
    lock: l
  }
})
const actorWith = (...items) => ({
  items
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
  it('tells an item in a locked storage from one in an open one', () => {
    const actor = actorWith(storageItem('safe', lock()), storageItem('bag', lock({
      locked: false
    })))
    expect(isLockedAway({
      system: {
        storedIn: 'safe'
      }
    }, actor)).toBe(true)
    expect(isLockedAway({
      system: {
        storedIn: 'bag'
      }
    }, actor)).toBe(false)
    expect(isLockedAway({
      system: {
        storedIn: ''
      }
    }, actor)).toBe(false)
    expect(isLockedAway({
      system: {
        storedIn: 'safe'
      }
    }, null)).toBe(false)
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
  it('Locksmith + Agility, Agility - 1 untrained', () => {
    expect(pickPool(3, 4)).toBe(7)
    expect(pickPool(0, 4)).toBe(3)
    expect(pickPool(0, 0)).toBe(0)
  })
  it('an autopicker adds its rating to the limit (gear table p. 450)', () => {
    expect(pickLimit(5, 0)).toBe(5)
    expect(pickLimit(5, 3)).toBe(8)
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
    const r = await extendedTest(6, 5, 0, d.roll)
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
  it('a critical glitch ends it on a failure', async () => {
    const r = await extendedTest(5, 1, 0, async () => ({
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
  it('brings everyone but the key holders down to Limited, and gives it back', () => {
    const before = {
      default: 2, alice: 3, bob: 3, carol: 0
    }
    const {
      ownership, saved
    } = lockedOwnership(before, ['alice'])
    expect(ownership).toEqual({
      default: 1, alice: 3, bob: 1, carol: 0
    })
    expect(saved).toEqual({
      default: 2, bob: 3
    })
    expect(unlockedOwnership(ownership, saved)).toEqual(before)
  })
})
