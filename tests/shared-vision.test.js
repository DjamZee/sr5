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
})
