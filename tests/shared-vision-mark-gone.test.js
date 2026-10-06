import {
  describe, it, expect, vi
} from 'vitest'

// Last security pass before the djamz.11 (Olympe, after Uma): only the active gamemaster cleans the list of a
// token, on his own scenes, and not at all when he is away. A player whose Snoop mark was erased kept seeing
// through the camera on any other scene. Each client now reads the source of vision itself.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
  },
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
    getRealActorFromID: () => undefined,
  },
}))
vi.mock('../modules/system/utilitySystem.js', () => ({
  SR5_SystemHelpers: {
    srLog: () => {},
  },
}))

const {
  SR5SharedVision
} = await import('../modules/interface/shared-vision.js')

const camera = marks => ({
  id: 'cam', type: 'actorDevice', system: {
  }, statuses: new Set(),
  items: [{
    type: 'itemDevice', system: {
      isActive: true, marks
    }
  }],
})
const tokenOf = actor => ({
  actor, flags: {
    sr5: {
      sharedVision: [{
        userId: 'p1', source: 'snoop', markOwnerId: 'hacker'
      }]
    }
  }
})

describe('a Snoop whose mark was erased', () => {
  it('no longer lets the player see through the camera, even before the gamemaster cleans the list', () => {
    const scene = {
      tokens: [tokenOf(camera([]))]
    }
    expect(SR5SharedVision.tokensSeenBy('p1', scene)).toEqual([])
  })

  it('still does while the hacker keeps his mark (SR5 p. 241)', () => {
    const token = tokenOf(camera([{
      ownerId: 'hacker', value: 1
    }]))
    expect(SR5SharedVision.tokensSeenBy('p1', {
      tokens: [token]
    })).toEqual([token])
  })
})
