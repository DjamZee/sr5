import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// N52: the createDeadEffect socket laid "Dead" on any actor a player named. The GM now checks
// that the actor is an AI and that its device has a full matrix monitor (Data Trails p. 161).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

function setup({
  depth = true, boxes = 10, owner = 'a'
} = {
}) {
  const actor = {
    id: 'a', system: {
      activeSpecialAttribute: depth ? 'depth' : 'magic'
    }
  }
  const device = {
    actor: {
      id: owner
    }, system: {
      conditionMonitors: {
        matrix: {
          value: 10, actual: {
            base: boxes
          }
        }
      }
    }
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
  globalThis.fromUuid = vi.fn(async () => device)
}

const ask = () => SR5_ActorHelper._socketCreateDeadEffect({
  data: {
    actorId: 'a', itemUuid: 'Actor.a.Item.d'
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers()
  vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
})

describe('createDeadEffect socket (Data Trails p. 161)', () => {
  it('lays the status on an AI whose device is full', async () => {
    setup()
    await ask()
    expect(SR5_ActorHelper.createDeadEffect).toHaveBeenCalledWith('a')
  })

  it('refuses an actor that is not an AI', async () => {
    setup({
      depth: false
    })
    await ask()
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
  })

  it('refuses a device that is not full', async () => {
    setup({
      boxes: 4
    })
    const done = ask()
    await vi.runAllTimersAsync()
    await done
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
  })

  it('refuses a device carried by someone else', async () => {
    setup({
      owner: 'x'
    })
    await ask()
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
  })
})
