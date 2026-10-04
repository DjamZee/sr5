import {
  describe, it, expect, beforeEach
} from 'vitest'

const {
  getSharedViewers, isSharedWith, withViewer, withoutViewer, hasMarkFrom, canStreamVision, isViewerStillValid, decideVisionSource
} = await import('../modules/system/shared-vision.js')

const token = list => ({
  flags: {
    sr5: {
      sharedVision: list
    }
  }
})

describe('shared vision list (SR5 p. 241)', () => {
  it('reads the users who see through a token', () => {
    expect(getSharedViewers(token([{
      userId: 'u1', source: 'share'
    }]))).toHaveLength(1)
    expect(getSharedViewers({
    })).toEqual([])
    expect(isSharedWith(token([{
      userId: 'u1'
    }]), 'u1')).toBe(true)
    expect(isSharedWith(token([{
      userId: 'u1'
    }]), 'u2')).toBe(false)
  })

  it('adds a user once, and takes him out', () => {
    let list = withViewer([], {
      userId: 'u1'
    })
    list = withViewer(list, {
      userId: 'u1', source: 'snoop', markOwnerId: 'a1'
    })
    expect(list).toEqual([{
      userId: 'u1', source: 'snoop', markOwnerId: 'a1'
    }])
    expect(withoutViewer(list, 'u1')).toEqual([])
  })
})

describe('the device keeps sending what it sees', () => {
  const camera = (system = {
  }, items = []) => ({
    type: 'actorDevice',
    system: {
      wirelessTurnedOn: true, conditionMonitors: {
        condition: {
          value: 9, actual: {
            value: 0
          }
        }, matrix: {
          value: 9, actual: {
            value: 0
          }
        }
      }, ...system
    },
    items,
    statuses: new Set(),
  })

  it('stops when the wireless is off (SR5 p. 424)', () => {
    expect(canStreamVision(camera())).toBe(true)
    expect(canStreamVision(camera({
      wirelessTurnedOn: false
    }))).toBe(false)
  })

  it('stops when the device is bricked (SR5 p. 229) or destroyed', () => {
    const bricked = camera()
    bricked.system.conditionMonitors.matrix.actual.value = 9
    expect(canStreamVision(bricked)).toBe(false)
    const dead = camera()
    dead.statuses.add('dead')
    expect(canStreamVision(dead)).toBe(false)
  })

  it('a Snoop lasts as long as the snooper keeps a mark (SR5 p. 241)', () => {
    const marked = camera({
    }, [{
      type: 'itemDevice', system: {
        isActive: true, marks: [{
          ownerId: 'hacker', value: 1
        }]
      }
    }])
    const entry = {
      userId: 'u1', source: 'snoop', markOwnerId: 'hacker'
    }
    expect(hasMarkFrom(marked, 'hacker')).toBe(true)
    expect(isViewerStillValid(entry, marked)).toBe(true)
    marked.items[0].system.marks = []
    expect(isViewerStillValid(entry, marked)).toBe(false)
    //A share from the owner needs no mark
    expect(isViewerStillValid({
      userId: 'u1', source: 'share'
    }, marked)).toBe(true)
  })
})

describe('who sees through the token', () => {
  it('a player in the list sees through it, the GM is left to the core', () => {
    expect(decideVisionSource({
      isGM: false, sharedWithMe: true
    })).toBe(true)
    expect(decideVisionSource({
      isGM: false, sharedWithMe: false
    })).toBe(null)
    expect(decideVisionSource({
      isGM: true, sharedWithMe: true
    })).toBe(null)
  })
})

describe('SR5Token gives the vision of a hidden camera to the player it is shared with', () => {
  let SR5Token
  beforeEach(async () => {
    //The core refuses a hidden token to a player (Token#_isVisionSource, V13)
    globalThis.foundry.canvas.placeables.Token ??= class {}
    globalThis.foundry.canvas.placeables.Token.prototype._isVisionSource = function() {
      return !this.document.hidden
    }
    globalThis.canvas = {
      visibility: {
        tokenVision: true
      }
    }
    globalThis.game = {
      user: {
        id: 'u1', isGM: false
      }
    }
    SR5Token = (await import('../modules/interface/token.js')).SR5Token
  })

  const make = (flags) => {
    const t = new SR5Token()
    t.document = {
      hidden: true, ...flags
    }
    t.hasSight = true
    return t
  }

  it('shared: a source, though hidden', () => {
    expect(make(token([{
      userId: 'u1'
    }]))._isVisionSource()).toBe(true)
  })

  it('not shared: the core decides, and refuses it', () => {
    expect(make({
    })._isVisionSource()).toBe(false)
  })

  describe('jumped into a drone (SR5 p. 231, 266)', () => {
    const drone = (controlMode, isOwner = true) => ({
      id: 'drone1', type: 'actorDrone', isOwner, system: {
        controlMode, vehicleOwner: {
          id: 'rigger1'
        }
      }
    })
    const rigger = {
      id: 'rigger1', type: 'actorPc', isOwner: true
    }
    const withActors = actors => {
      globalThis.game.actors = actors
      globalThis.canvas.tokens = {
        placeables: []
      }
      //The riggers are read once and kept: a new set of actors is a change of them
      SR5Token.clearJumpedInRiggers()
    }
    const visible = actor => {
      const t = make({
        id: 'tok-' + actor.id
      })
      t.document.hidden = false
      t.actor = actor
      return t
    }

    it('the body of the rigger gives no vision while he is jumped in', () => {
      withActors([drone('rigging')])
      expect(visible(rigger)._isVisionSource()).toBe(false)
    })

    it('the drone he is jumped into is his eyes, though he keeps his body selected', () => {
      withActors([drone('rigging')])
      //The core refuses a token that is not selected while the player keeps another one selected
      globalThis.foundry.canvas.placeables.Token.prototype._isVisionSource = function() {
        return false
      }
      expect(visible(drone('rigging'))._isVisionSource()).toBe(true)
    })

    it('a drone of another player gives no vision', () => {
      withActors([drone('rigging', false)])
      globalThis.foundry.canvas.placeables.Token.prototype._isVisionSource = function() {
        return false
      }
      expect(visible(drone('rigging', false))._isVisionSource()).toBe(false)
    })

    it('in remote control, the body sees again (SR5 p. 267)', () => {
      withActors([drone('remote')])
      expect(visible(rigger)._isVisionSource()).toBe(true)
    })
  })
})

describe('who is jumped in', () => {
  it('a drone in rigging control with a controller', async () => {
    const {
      isJumpedInDrone, jumpedInRiggerIds
    } = await import('../modules/system/shared-vision.js')
    const d = {
      type: 'actorDrone', system: {
        controlMode: 'rigging', vehicleOwner: {
          id: 'r1'
        }
      }
    }
    expect(isJumpedInDrone(d)).toBe(true)
    expect(isJumpedInDrone({
      ...d, system: {
        ...d.system, controlMode: 'autopilot'
      }
    })).toBe(false)
    expect([...jumpedInRiggerIds([d])]).toEqual(['r1'])
    expect(decideVisionSource({
      isGM: false, sharedWithMe: true, isBlindBody: true
    })).toBe(false)
  })
})

describe('a request sent by socket (second review, Uma)', async () => {
  const {
    isViewerRequestAllowed, hidesItsOwnSight
  } = await import('../modules/system/shared-vision.js')
  const camera = {
    id: 'cam', type: 'actorDevice', items: [{
      type: 'itemDevice', system: {
        isActive: true, marks: [{
          ownerId: 'hacker', value: 1
        }]
      }
    }], system: {
    }
  }
  const hacker = {
    id: 'hacker', type: 'actorPc'
  }
  const ask = (entry, {
    remove = false, owns = [], actor = camera
  } = {
  }) => isViewerRequestAllowed({
    actor, entry, remove, senderId: 'clo',
    senderOwns: a => owns.includes(a?.id),
    getActor: id => (id === 'hacker' ? hacker : undefined),
  })

  it('refuses a player who adds herself to a camera she does not own', () => {
    expect(ask({
      userId: 'clo', source: 'share'
    })).toBe(false)
  })
  it('lets the owner invite', () => {
    expect(ask({
      userId: 'other', source: 'share'
    }, {
      owns: ['cam']
    })).toBe(true)
  })
  it('refuses to take another user out, unless the sender owns the device', () => {
    expect(ask({
      userId: 'other'
    }, {
      remove: true
    })).toBe(false)
    expect(ask({
      userId: 'other'
    }, {
      remove: true, owns: ['cam']
    })).toBe(true)
    expect(ask({
      userId: 'clo'
    }, {
      remove: true
    })).toBe(true)
  })
  it('refuses a Snoop for another user, for a hacker she does not own, or with no mark', () => {
    expect(ask({
      userId: 'other', source: 'snoop', markOwnerId: 'hacker'
    }, {
      owns: ['hacker']
    })).toBe(false)
    expect(ask({
      userId: 'clo', source: 'snoop', markOwnerId: 'hacker'
    })).toBe(false)
    expect(ask({
      userId: 'clo', source: 'snoop', markOwnerId: 'ghost'
    }, {
      owns: ['ghost']
    })).toBe(false)
    expect(ask({
      userId: 'clo', source: 'snoop', markOwnerId: 'hacker'
    }, {
      owns: ['hacker']
    })).toBe(true)
  })
  it('refuses any actor that is neither a drone nor a device', () => {
    expect(ask({
      userId: 'clo', source: 'share'
    }, {
      owns: ['pc'], actor: {
        id: 'pc', type: 'actorPc'
      }
    })).toBe(false)
  })

  it('a device seen through hides its own sight from a viewer who does not own it', () => {
    expect(hidesItsOwnSight({
      isGM: false, sharedWithMe: true, isOwner: false
    })).toBe(true)
    expect(hidesItsOwnSight({
      isGM: false, sharedWithMe: true, isOwner: true
    })).toBe(false)
    expect(hidesItsOwnSight({
      isGM: true, sharedWithMe: true, isOwner: false
    })).toBe(false)
  })
})

describe('the wireless of a device is on its device item (second review, Uma)', () => {
  it('a camera whose device has its wireless off sends nothing', () => {
    const camera = wireless => ({
      type: 'actorDevice', statuses: new Set(), system: {
      }, items: [{
        type: 'itemDevice', system: {
          isActive: true, wirelessTurnedOn: wireless
        }
      }]
    })
    expect(canStreamVision(camera(true))).toBe(true)
    expect(canStreamVision(camera(false))).toBe(false)
  })
})

describe('the camera itself stays out of sight (second review, Uma)', () => {
  it('seen through, it shows only if the viewer\'s other eyes see it', async () => {
    //The core shows any token whose vision is active (Token#isVisible, V13)
    Object.defineProperty(globalThis.foundry.canvas.placeables.Token.prototype, 'isVisible', {
      configurable: true, get() {
        return !Object.values(this.vision.suppression).includes(true)
      }
    })
    globalThis.game = {
      user: {
        id: 'u1', isGM: false
      }
    }
    const {
      SR5Token
    } = await import('../modules/interface/token.js')
    const make = isOwner => {
      const t = new SR5Token()
      t.document = token([{
        userId: 'u1'
      }])
      t.vision = {
        suppression: {
        }
      }
      t.actor = {
        isOwner
      }
      return t
    }
    const seen = make(false)
    expect(seen.isVisible).toBe(false)
    expect(seen.vision.suppression).toEqual({
    })
    expect(make(true).isVisible).toBe(true)
  })
})

describe('the riggers jumped in are read once (second review, Uma)', () => {
  it('reads the actors once until cleared', async () => {
    const {
      SR5Token
    } = await import('../modules/interface/token.js')
    let reads = 0
    globalThis.game = {
      actors: {
        filter: () => {
          reads++
          return []
        }
      }
    }
    globalThis.canvas = {
      tokens: {
        placeables: []
      }
    }
    SR5Token.clearJumpedInRiggers()
    SR5Token.getJumpedInRiggers()
    SR5Token.getJumpedInRiggers()
    expect(reads).toBe(1)
    SR5Token.clearJumpedInRiggers()
    SR5Token.getJumpedInRiggers()
    expect(reads).toBe(2)
  })
})
