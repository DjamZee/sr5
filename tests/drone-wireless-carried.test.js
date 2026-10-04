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

// SR5 p. 265-270: a drone is a device, with one icon and one matrix monitor. The deployed drone
// and its vehicle item are the same device, so they share one wireless switch: the item hands it
// to the actor at deployment, the actor holds it while deployed, and hands it back at dismissal.
const HELPERS = fs.readFileSync('modules/entities/actors/entityActor-helpers.js', 'utf8')
const DRONE_MODEL = fs.readFileSync('modules/datamodels/actors/actorDrone.js', 'utf8')
const VEHICLES = fs.readFileSync('templates/actors/_partials/right-tabs/gear/vehicles.hbs', 'utf8')

describe('drone wireless carried between item and actor (N83)', () => {
  it('gives the drone actor a wireless switch', () => {
    expect(DRONE_MODEL).toMatch(/wirelessTurnedOn: new fields\.BooleanField/)
  })

  it('copies the switch at deployment and gives it back at dismissal', () => {
    expect(HELPERS).toContain('"system.wirelessTurnedOn": itemData.wirelessTurnedOn')
    expect(HELPERS).toContain('modifiedItem.system.wirelessTurnedOn = actor.system.wirelessTurnedOn')
  })

  it('reads the deployed drone state for the gear row', () => {
    const vehicles = [
      {
        _id: 'v1', system: {
          isCreated: true
        }
      },
      {
        _id: 'v2', system: {
          isCreated: false
        }
      },
    ]
    const actors = [
      {
        type: 'actorDrone', system: {
          creatorItemId: 'v1', wirelessTurnedOn: false
        }
      },
    ]
    SR5_ActorHelper.markDeployedVehicles(vehicles, actors)
    expect(vehicles[0].deployedWireless).toEqual({
      on: false
    })
    expect(vehicles[1].deployedWireless).toBeUndefined()
  })

  it('shows that state without a toggle while deployed', () => {
    const branch = VEHICLES.match(/\{\{else if item\.deployedWireless\}\}([\s\S]*?)\{\{else\}\}/)
    expect(branch).not.toBeNull()
    expect(branch[1]).toContain('SR5.WirelessHeldByDeployedDrone')
    expect(branch[1]).not.toContain('toggle-value')
  })
})
