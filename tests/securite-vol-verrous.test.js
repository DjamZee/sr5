import {
  describe, it, expect, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

const {
  trustedChoice, answeredByGM
} = await import('../modules/rolls/roll-helpers/pickpocket-rules.js')
const {
  dialogRights
} = await import('../modules/interface/storage-lock.js')
const {
  SR5StorageLockRights
} = await import('../modules/interface/storage-lock-rights.js')

// Security pass, pickpocket and locks (Hilde, 06/10)
describe('a thief card the player wiped after the theft (replay)', () => {
  const gm = {
    isGM: true
  }, player = {
    isGM: false
  }
  const perception = (author, thiefId) => ({
    author, flags: {
      sr5data: {
        test: {
          type: 'pickpocketPerception'
        }, previousMessage: {
          messageId: thiefId
        }
      }
    }
  })

  it('is still answered: the GM\'s own Perception card says so', () => {
    expect(answeredByGM([perception(gm, 'thief1')], 'thief1')).toBe(true)
  })
  it('a Perception card written by the player herself proves nothing', () => {
    expect(answeredByGM([perception(player, 'thief1')], 'thief1')).toBe(false)
  })
  it('the GM\'s alert of a thief caught red-handed spends the card too', () => {
    expect(answeredByGM([{
      author: gm, flags: {
        sr5: {
          pickpocketAnswered: 'thief1'
        }
      }
    }], 'thief1')).toBe(true)
  })
  it('another thief card is not answered by it', () => {
    expect(answeredByGM([perception(gm, 'thief1')], 'thief2')).toBe(false)
    expect(answeredByGM([perception(gm, 'thief1')], null)).toBe(false)
  })
})

describe('the object a retouched thief card names', () => {
  const small = {
    id: 'small', type: 'itemGear', system: {
      concealment: {
        value: 0
      }
    }
  }
  const large = {
    id: 'rifle', type: 'itemGear', system: {
      concealment: {
        value: 6
      }
    }
  }
  const giver = {
    items: [small, large]
  }
  it('a small object the thief could have chosen locks the GM\'s list', () => {
    expect(trustedChoice(giver, 'small')).toBe('small')
  })
  it('a bigger one (or one the giver does not hold) is left to the GM', () => {
    expect(trustedChoice(giver, 'rifle')).toBe(null)
    expect(trustedChoice(giver, 'elsewhere')).toBe(null)
    expect(trustedChoice(giver, null)).toBe(null)
  })
})

describe("Foundry's ownership window on a locked storage (==ownership, noHook)", () => {
  let storage
  beforeEach(() => {
    game.user = {
      id: 'gm', isGM: true
    }
    game.actors = {
      get: () => null
    }
    globalThis.canvas = {
      scene: null
    }
    game.scenes = []
    game.users = [{
      id: 'gm', isGM: true
    }, {
      id: 'p1', isGM: false
    }, {
      id: 'p2', isGM: false
    }]
    storage = {
      type: 'actorStorage',
      system: {
        lock: {
          type: 'mechanical', locked: true
        }
      },
      ownership: {
        default: 0, gm: 3, p1: 1, p2: 1
      },
      getFlag: () => ({
        p1: 3
      }),
    }
  })

  it('never sends a right above Limited: what the GM chose is his wish', () => {
    const changes = {
      '==ownership': {
        default: 0, gm: 3, p1: 3, p2: 3
      }
    }
    SR5StorageLockRights.hold(storage, changes, {
      noHook: true
    })
    expect(changes['==ownership']).toEqual({
      default: 0, gm: 3, p1: 1, p2: 1
    })
    expect(changes.flags.sr5['==lockOwnership']).toEqual({
      default: 0, p1: 3, p2: 3
    })
  })
  it('a Limited the GM sets there is his wish, told apart from the lock\'s own', () => {
    const changes = {
      '==ownership': {
        default: 0, gm: 3, p1: 1
      }
    }
    SR5StorageLockRights.hold(storage, changes, {
      noHook: true
    })
    expect(changes.flags.sr5['==lockOwnership']).toEqual({
      default: 0, p1: 1
    })
  })
  it('the GMs and the key holders get what was chosen', () => {
    expect(dialogRights({
      gm: 3, p1: 3, default: 2
    }, ['gm', 'p1'])).toEqual({
      ownership: {
        gm: 3, p1: 3, default: 1
      }, saved: {
        default: 2
      }
    })
  })
  it('leaves an open storage alone', () => {
    storage.system.lock.locked = false
    const changes = {
      '==ownership': {
        p1: 3
      }
    }
    SR5StorageLockRights.hold(storage, changes, {
      noHook: true
    })
    expect(changes['==ownership']).toEqual({
      p1: 3
    })
  })
  it('runs in the actor\'s own _preUpdate, which noHook does not skip', () => {
    const source = readFileSync(new URL('../modules/entities/actors/entityActor.js', import.meta.url), 'utf8')
    expect(source).toMatch(/async _preUpdate\(changes, options, user\) \{[^}]*SR5StorageLockRights\.hold\(this, changes, options\)/)
    const actions = readFileSync(new URL('../modules/interface/storage-lock-actions.js', import.meta.url), 'utf8')
    expect(actions).not.toMatch(/Hooks\.on\("preUpdateActor"/)
  })
})
