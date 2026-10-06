import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

// Security 06/10: the GM side of the "overwatchIncrease" socket believed any sender, so one line typed in a player's
// console raised (or lowered) the Overwatch Score of any actor of the world
describe("the overwatchIncrease socket", () => {
  let actor
  beforeEach(() => {
    vi.restoreAllMocks()
    actor = {
      name: 'IA', system: {
        matrix: {
          overwatchScore: 2
        }
      },
      update: vi.fn(),
      testUserPermission: (user) => user?.id === 'owner',
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    game.user = {
      id: 'gm', isGM: true
    }
    game.users = {
      get: (id) => ({
        id
      })
    }
    game.i18n = {
      localize: (k) => k
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn(), warn: vi.fn()
      }
    }
  })

  it("is refused from a player who does not own the actor", async () => {
    await SR5_ActorHelper._socketOverwatchIncrease({
      data: {
        defenseHits: 40, actorId: 'a1'
      }
    }, 'stranger')
    expect(actor.update).not.toHaveBeenCalled()
  })

  it("is applied for the owner of the actor", async () => {
    await SR5_ActorHelper._socketOverwatchIncrease({
      data: {
        defenseHits: 3, actorId: 'a1'
      }
    }, 'owner')
    expect(actor.update).toHaveBeenCalled()
  })
})
