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

  // SR5 p. 229: a bricked device stops working, so a bricked vehicle loses its wireless, as weapons and armors do
  it('turns a bricked vehicle wireless off', () => {
    const ITEM = fs.readFileSync('modules/entities/items/entityItem.js', 'utf8')
    const vehicleCase = ITEM.match(/case "itemVehicle":\r?\n([\s\S]*?)break/)[1]
    expect(vehicleCase).toContain('if (itemData.conditionMonitors.matrix.actual.value >= itemData.conditionMonitors.matrix.value) itemData.wirelessTurnedOn = false')
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
          creatorId: 'owner', creatorItemId: 'v1', wirelessTurnedOn: false
        }
      },
    ]
    SR5_ActorHelper.markDeployedVehicles(vehicles, actors, 'owner')
    expect(vehicles[0].deployedWireless).toEqual({
      on: false
    })
    expect(vehicles[1].deployedWireless).toBeUndefined()
  })

  // Cora's review, point 1: between the click and the drone actor's creation, the row must
  // already be read-only, or a click there is lost without a sign
  it('makes the row read-only as soon as the item is deployed, before the drone exists', () => {
    const vehicles = [
      {
        _id: 'v1', system: {
          isCreated: true, wirelessTurnedOn: true
        }
      },
    ]
    SR5_ActorHelper.markDeployedVehicles(vehicles, [], 'owner')
    expect(vehicles[0].deployedWireless).toEqual({
      on: true
    })
  })

  // Cora's review, point 2: a duplicated actor carries the same item ids, so its drone
  // must not stand for the original's
  it('ignores a drone deployed by another actor with the same item id', () => {
    const vehicles = [
      {
        _id: 'v1', system: {
          isCreated: true, wirelessTurnedOn: true
        }
      },
    ]
    const actors = [
      {
        type: 'actorDrone', system: {
          creatorId: 'copy', creatorItemId: 'v1', wirelessTurnedOn: false
        }
      },
    ]
    SR5_ActorHelper.markDeployedVehicles(vehicles, actors, 'owner')
    expect(vehicles[0].deployedWireless).toEqual({
      on: true
    })
    expect(SR5_ActorHelper.findSidekick(actors, 'owner', 'v1')).toBeUndefined()
    expect(SR5_ActorHelper.findSidekick(actors, 'copy', 'v1')).toBe(actors[0])
  })

  it('dismisses only the sheet actor own sidekick', () => {
    const sheet = fs.readFileSync('modules/entities/actors/baseSheet.js', 'utf8')
    const destroy = sheet.match(/async _OnSidekickDestroy\(event\)\{([\s\S]*?)\n {2}\}/)[1]
    expect(destroy).toContain('SR5_ActorHelper.findSidekick(game.actors, SR5_ActorHelper.sidekickCreatorId(this.actor), id)')
    expect(destroy).not.toMatch(/a\.system\.creatorItemId === id/)
  })

  // Cora's review, point 3: a drone deployed before the field existed has none; its default
  // must not overwrite the item at dismissal
  it('leaves the item switch alone when the drone predates the field', () => {
    expect(DRONE_MODEL).toMatch(/wirelessTurnedOn: new fields\.BooleanField\(\{\s*nullable: true, initial: null/)
    expect(HELPERS).toContain('if (typeof actor.system.wirelessTurnedOn === "boolean") modifiedItem.system.wirelessTurnedOn = actor.system.wirelessTurnedOn')
  })

  it('shows that state without a toggle while deployed', () => {
    const branch = VEHICLES.match(/\{\{else if item\.deployedWireless\}\}([\s\S]*?)\{\{else\}\}/)
    expect(branch).not.toBeNull()
    expect(branch[1]).toContain('SR5.WirelessHeldByDeployedDrone')
    expect(branch[1]).not.toContain('toggle-value')
  })
})
