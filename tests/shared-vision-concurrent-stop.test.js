import {
  describe, it, expect, vi
} from 'vitest'

// Two players who click "Stop" on the same token at the same second: the gamemaster read the
// list twice before either write had landed, and the second write put the first player back
// (MESURES-F, F4). The writes of one token now wait for each other and read the list just before.

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
