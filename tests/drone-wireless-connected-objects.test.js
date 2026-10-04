import {
  describe, it, expect, vi
} from 'vitest'
import fs from 'node:fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

// N91: a device with its wireless off can no longer be hacked wirelessly (SR5 p. 424), and has no icon
// in the Matrix (p. 270). While deployed, the drone actor holds the switch (N83): its owner's connected
// objects, which fill the matrix defense box, read it from there.
const ACTOR = fs.readFileSync('modules/entities/actors/entityActor.js', 'utf8')
const HOOK = fs.readFileSync('modules/hooks/actor.js', 'utf8')

const vehicle = (deployed, on) => ({
  _id: 'v1', system: {
    isCreated: deployed, wirelessTurnedOn: on
  }
})
const drone = on => ({
  type: 'actorDrone', system: {
    creatorItemId: 'v1', wirelessTurnedOn: on
  }
})

describe('deployed drone wireless in the connected objects (N91)', () => {
  it('reads the deployed drone, not the item it left behind', () => {
    expect(SR5_ActorHelper.vehicleWirelessOn(vehicle(true, true), [drone(false)])).toBe(false)
    expect(SR5_ActorHelper.vehicleWirelessOn(vehicle(true, false), [drone(true)])).toBe(true)
  })

  it('takes an older drone with no switch recorded as wireless on', () => {
    expect(SR5_ActorHelper.vehicleWirelessOn(vehicle(true, false), [drone(null)])).toBe(true)
  })

  it('reads the item when the vehicle is not deployed', () => {
    expect(SR5_ActorHelper.vehicleWirelessOn(vehicle(false, true), [drone(false)])).toBe(true)
    expect(SR5_ActorHelper.vehicleWirelessOn(vehicle(false, false), [])).toBe(false)
  })

  it('fills the connected vehicles from that switch', () => {
    expect(ACTOR).toContain('if (SR5_ActorHelper.vehicleWirelessOn(i, game.actors)) actor.system.matrix.connectedObject.vehicles[i.uuid]')
  })

  it('prepares the owner again when the drone switches', () => {
    expect(HOOK).toMatch(/document\.type === "actorDrone" && data\.system\?\.wirelessTurnedOn !== undefined[\s\S]*?owner\.reset\(\)/)
  })
})
