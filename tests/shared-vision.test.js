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
