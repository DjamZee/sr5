import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

// A player who owns the character but not its drone or its agent: the copies they carry are written only where the
// client may write them, never with a "lacks permission to update Actor" (Wanda, 07/10)
const rigger = {
  id: "rigger", toObject: () => ({
    system: {
      x: 1
    }, items: [{
      name: "Agent"
    }]
  })
}

function world(isOwner) {
  const drone = {
    type: "actorDrone", isOwner, system: {
      vehicleOwner: {
        id: "rigger"
      }
    }, update: vi.fn()
  }
  const agent = {
    type: "actorAgent", isOwner, system: {
      creatorId: "rigger"
    }, update: vi.fn()
  }
  const unlinked = {
    actor: {
      type: "actorAgent", isOwner, system: {
        creatorId: "rigger"
      }, update: vi.fn()
    }, document: {
      actorLink: false
    }
  }
  const linked = {
    actor: agent, document: {
      actorLink: true
    }
  }
  globalThis.game = {
    ...globalThis.game, actors: [drone, agent]
  }
  globalThis.canvas = {
    scene: {
    }, tokens: {
      placeables: [unlinked, linked]
    }
  }
  return {
    drone, agent, unlinked
  }
}

beforeEach(() => {
  globalThis.game = {
    ...globalThis.game,
    i18n: {
      localize: key => key, format: key => key
    },
  }
})

describe("the copies of the character on its drones and agents", () => {
  it("a client without rights on them writes nothing", async () => {
    const {
      drone, agent, unlinked
    } = world(false)
    await SR5_CharacterUtility.updateControledVehicle(rigger)
    await SR5_CharacterUtility.updateProgramAgent(rigger)
    expect(drone.update).not.toHaveBeenCalled()
    expect(agent.update).not.toHaveBeenCalled()
    expect(unlinked.actor.update).not.toHaveBeenCalled()
  })

  it("the client that may writes each agent once (a linked token is the world actor)", async () => {
    const {
      agent, unlinked
    } = world(true)
    await SR5_CharacterUtility.updateProgramAgent(rigger)
    expect(agent.update).toHaveBeenCalledTimes(1)
    expect(unlinked.actor.update).toHaveBeenCalledTimes(1)
    expect(agent.update).toHaveBeenCalledWith({
      "system.creatorData.items": [{
        name: "Agent"
      }]
    })
  })

  it("updateActor copies to the agents through the single client of the drones", () => {
    const hook = readFileSync('modules/hooks/actor.js', 'utf8')
    const agents = hook.slice(hook.indexOf("Propagate owner data changes to linked agents"))
    expect(agents.split("\n").slice(0, 4).join("\n")).toMatch(/controllerOf\(document\) && syncsHere\(game\.users, game\.user, userId\)/)
  })
})
