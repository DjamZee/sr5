import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Two players who click "Stop" on the same token at the same second: the gamemaster read the
// list twice before either write had landed, and the second write put the first player back
// (MESURES-F, F4). The writes of one token now wait for each other and read the list just before.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
  },
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
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
const {
  SR5_SocketHandler
} = await import('../modules/socket.js')

//The active gamemaster writes, unless a test says otherwise
beforeEach(() => {
  vi.clearAllMocks()
  globalThis.game = {
    user: {
      id: 'gm', isGM: true
    },
    users: {
      activeGM: {
        id: 'gm'
      },
      get: id => ({
        id
      }),
    },
  }
})

// A token whose flags change only once the server has answered, like Foundry's
function token(viewers, uuid = 'Scene.s.Token.drone') {
  const doc = {
    uuid, isOwner: true,
    flags: {
      sr5: {
        sharedVision: viewers
      }
    },
    update: vi.fn(async changes => {
      await new Promise(resolve => setTimeout(resolve, 5))
      doc.flags.sr5.sharedVision = changes['flags.sr5.sharedVision']
    }),
  }
  return doc
}

const viewer = userId => ({
  userId, source: 'invite'
})

describe('shared vision: writes of one token queue up', () => {
  it('two players who stop at once are both taken out', async () => {
    const drone = token([viewer('a'), viewer('b'), viewer('c')])
    await Promise.all([
      SR5SharedVision.setViewer(drone, {
        userId: 'a'
      }, true),
      SR5SharedVision.setViewer(drone, {
        userId: 'b'
      }, true),
    ])
    expect(drone.flags.sr5.sharedVision.map(e => e.userId)).toEqual(['c'])
  })

  it('one who joins while another leaves: both are kept', async () => {
    const drone = token([viewer('a')])
    await Promise.all([
      SR5SharedVision.setViewer(drone, {
        userId: 'a'
      }, true),
      SR5SharedVision.setViewer(drone, viewer('b')),
    ])
    expect(drone.flags.sr5.sharedVision.map(e => e.userId)).toEqual(['b'])
  })

  it('a failed write does not hold back the next one', async () => {
    const drone = token([viewer('a'), viewer('b')])
    drone.update.mockImplementationOnce(async () => {
      throw new Error('refused')
    })
    await expect(SR5SharedVision.setViewer(drone, {
      userId: 'a'
    }, true)).rejects.toThrow('refused')
    await SR5SharedVision.setViewer(drone, {
      userId: 'b'
    }, true)
    expect(drone.flags.sr5.sharedVision.map(e => e.userId)).toEqual(['a'])
  })
})

// Hector's review: the owner of the drone wrote the token herself while another player went through the
// gamemaster's queue, and stayed listed. Every write of the list now goes through that one queue.
describe('shared vision: one writer for the owner and the others', () => {
  const asPlayer = (activeGM = true) => {
    game.user = {
      id: 'owner', isGM: false
    }
    game.users.activeGM = activeGM ? {
      id: 'gm'
    } : null
  }

  it('the owner asks the gamemaster too while one is connected', async () => {
    asPlayer()
    const drone = token([viewer('owner'), viewer('b')])
    await SR5SharedVision.setViewer(drone, {
      userId: 'owner'
    }, true)
    expect(drone.update).not.toHaveBeenCalled()
    expect(SR5_SocketHandler.emitForGM).toHaveBeenCalledWith('sharedVisionSetViewer', {
      tokenUuid: drone.uuid, entry: {
        userId: 'owner'
      }, remove: true
    })
  })

  it('with no gamemaster connected, the owner writes herself', async () => {
    asPlayer(false)
    const drone = token([viewer('owner'), viewer('b')])
    await SR5SharedVision.setViewer(drone, {
      userId: 'owner'
    }, true)
    expect(SR5_SocketHandler.emitForGM).not.toHaveBeenCalled()
    expect(drone.flags.sr5.sharedVision.map(e => e.userId)).toEqual(['b'])
  })

  it('the owner and another player who stop at once are both taken out by the gamemaster', async () => {
    const drone = token([viewer('owner'), viewer('b'), viewer('c')])
    drone.actor = {
      type: 'actorDrone', testUserPermission: user => user.id === 'owner'
    }
    globalThis.fromUuid = async () => drone
    const stop = userId => SR5SharedVision._socketSetViewer({
      data: {
        tokenUuid: drone.uuid, entry: {
          userId
        }, remove: true
      }
    }, userId)
    await Promise.all([stop('owner'), stop('b')])
    expect(drone.flags.sr5.sharedVision.map(e => e.userId)).toEqual(['c'])
  })

  it('the share window changes only who was ticked or unticked, in the queue', async () => {
    const drone = token([viewer('a'), viewer('b')])
    drone.actor = {
      type: 'actorDrone'
    }
    game.users.filter = () => [{
      id: 'a', name: 'A'
    }, {
      id: 'b', name: 'B'
    }, {
      id: 'c', name: 'C'
    }]
    game.i18n = {
      localize: k => k, format: k => k
    }
    globalThis.foundry = {
      utils: {
        escapeHTML: s => s
      },
      applications: {
        api: {
          DialogV2: {
            //The GM unticks A and ticks C, while B stops by himself before the window closes
            wait: async () => {
              await SR5SharedVision.setViewer(drone, {
                userId: 'b'
              }, true)
              return {
                action: 'ok', element: {
                  querySelector: sel => ({
                    checked: sel.includes('"b"') || sel.includes('"c"')
                  })
                }
              }
            }
          }
        }
      }
    }
    await SR5SharedVision.openShareDialog(drone)
    expect(drone.flags.sr5.sharedVision.map(e => e.userId)).toEqual(['c'])
  })

  it("the gamemaster's clean-up does not put back a viewer who stopped meanwhile", async () => {
    const drone = token([viewer('a'), {
      userId: 'b', source: 'snoop', markOwnerId: 'gone'
    }])
    drone.actor = {
      type: 'actorDevice', system: {
      }, statuses: new Set(), items: [{
        type: 'itemDevice', system: {
          isActive: true, marks: []
        }
      }]
    }
    globalThis.canvas = {
      scene: {
        tokens: [drone]
      }
    }
    game.scenes = {
      active: null
    }
    await Promise.all([
      SR5SharedVision.checkViewers(),
      SR5SharedVision.setViewer(drone, {
        userId: 'a'
      }, true),
    ])
    expect(drone.flags.sr5.sharedVision).toEqual([])
  })
})
