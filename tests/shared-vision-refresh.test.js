import {
  describe, it, expect, vi
} from 'vitest'

// Measured in Foundry 13.351: a changed shared vision list left the camera without a vision source,
// because initializeVision alone does not build the source of a token whose answer changed.

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
    getRealActorFromID: id => globalThis.__actors?.[id],
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

describe('the gamemaster checks what a player asks (second review, Uma)', () => {
  const camera = (marks = []) => ({
    id: 'cam', type: 'actorDevice', system: {
    }, statuses: new Set(),
    items: [{
      type: 'itemDevice', system: {
        isActive: true, marks
      }
    }],
    testUserPermission: () => false,
  })
  const tokenOf = actor => ({
    uuid: 'Scene.s.Token.t', isOwner: true, actor, flags: {
    }, update: vi.fn(),
  })
  const setup = actor => {
    const tokenDocument = tokenOf(actor)
    globalThis.fromUuid = async () => tokenDocument
    globalThis.game = {
      users: {
        get: id => ({
          id
        })
      }
    }
    return tokenDocument
  }

  it('writes nothing for a player who adds herself to a camera she does not own', async () => {
    const tokenDocument = setup(camera())
    await SR5SharedVision._socketSetViewer({
      data: {
        tokenUuid: 'x', entry: {
          userId: 'clo', source: 'share'
        }
      }
    }, 'clo')
    expect(tokenDocument.update).not.toHaveBeenCalled()
  })

  it('writes nothing for a Snoop with no mark', async () => {
    globalThis.__actors = {
      hacker: {
        id: 'hacker', testUserPermission: () => true
      }
    }
    const tokenDocument = setup(camera())
    await SR5SharedVision._socketSetViewer({
      data: {
        tokenUuid: 'x', entry: {
          userId: 'clo', source: 'snoop', markOwnerId: 'hacker'
        }
      }
    }, 'clo')
    expect(tokenDocument.update).not.toHaveBeenCalled()
  })

  it('writes the Snoop of a hacker she owns, who holds a mark', async () => {
    globalThis.__actors = {
      hacker: {
        id: 'hacker', testUserPermission: () => true
      }
    }
    const tokenDocument = setup(camera([{
      ownerId: 'hacker', value: 1
    }]))
    await SR5SharedVision._socketSetViewer({
      data: {
        tokenUuid: 'x', entry: {
          userId: 'clo', source: 'snoop', markOwnerId: 'hacker'
        }
      }
    }, 'clo')
    expect(tokenDocument.update).toHaveBeenCalledOnce()
  })

  it('the See through button gives nothing once the mark is gone', async () => {
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
    globalThis.game = {
      i18n: {
        format: k => k
      }, user: {
        isGM: false, id: 'clo'
      }
    }
    const cam = camera()
    const tokenDocument = tokenOf(cam)
    cam.getActiveTokens = () => [tokenDocument]
    expect(await SR5SharedVision.startSnoop(cam, 'hacker')).toBe(false)
    expect(tokenDocument.update).not.toHaveBeenCalled()
    expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith('SR5.SharedVisionNoMark')
  })
})

describe('drawing the shared vision again', () => {
  it('builds the source of a token that became a vision source, and drops the one that no longer is', () => {
    const token = (hasVision, isSource) => ({
      vision: hasVision ? {
      } : undefined,
      _isVisionSource: () => isSource,
      initializeVisionSource: vi.fn(),
    })
    const camera = token(false, true)
    const dropped = token(true, false)
    const unchanged = token(true, true)
    globalThis.canvas = {
      ready: true,
      tokens: {
        placeables: [camera, dropped, unchanged]
      },
      perception: {
        update: vi.fn()
      },
    }
    globalThis.document ??= {
      getElementById: () => null
    }
    SR5SharedVision.refresh()
    expect(camera.initializeVisionSource).toHaveBeenCalledOnce()
    expect(dropped.initializeVisionSource).toHaveBeenCalledOnce()
    expect(unchanged.initializeVisionSource).not.toHaveBeenCalled()
  })
})
