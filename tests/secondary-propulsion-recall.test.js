import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ActorHelper
} = await import("../modules/entities/actors/entityActor-helpers.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")

// Ambroise: the drone sheet's "secondary propulsion activated" box was lost once the drone was recalled and deployed
// again. The vehicle item did not keep it, and the deployment did not write it back.

const base = value => ({
  natural: {
    base: value
  }
})
const ATTRIBUTES = ["handling", "handlingOffRoad", "secondaryPropulsionHandling", "secondaryPropulsionHandlingOffRoad",
  "speed", "speedOffRoad", "secondaryPropulsionSpeed", "acceleration", "accelerationOffRoad",
  "secondaryPropulsionAcceleration", "body", "armor", "pilot", "sensor", "seating"]
const SLOTS = ["powerTrain", "protection", "weapons", "body", "electromagnetic", "cosmetic"]

/** The drone as the sheet hands it to dimissSidekick (toObject(false): prepared values) */
const drone = activated => ({
  _id: "drone", type: "actorDrone", img: "systems/sr5/assets/img/actors/actorDrone.svg", items: [],
  system: {
    creatorId: "pc", creatorItemId: "veh", model: "", slaved: false, wirelessTurnedOn: true, controlMode: "autopilot",
    riggerInterface: false, offRoadMode: false, isSecondaryPropulsion: true, secondaryPropulsionType: "rotor",
    isSecondaryPropulsionActivate: activated,
    attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, base(1)])),
    modificationSlots: {
      ...Object.fromEntries(SLOTS.map(s => [s, {
        base: 1
      }])), extraWeapons: 0, extraBody: 0
    },
    conditionMonitors: {
      condition: {
        actual: 0
      }, matrix: {
        actual: 0
      }
    }
  }
})

/** The vehicle item on the character */
const vehicleItem = () => ({
  _id: "veh", type: "itemVehicle", name: "Drone", img: "x.webp",
  system: {
    type: "drone", model: "", autosoft: [], ammunitions: [], weapons: [], armors: [], vehiclesMod: [], decks: [],
    gameEffect: "", price: {
      base: 0
    },
    attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, 1])),
    secondaryPropulsion: {
      isSecondaryPropulsion: true, isActivated: false, type: "rotor", handling: 1, handlingOffRoad: 1, speed: 1,
      acceleration: 1
    },
    modificationSlots: {
      ...Object.fromEntries(SLOTS.map(s => [s, 1])), extraWeapons: 0, extraBody: 0
    },
    conditionMonitors: {
      condition: {
        actual: 0
      }, matrix: {
        actual: 0
      }
    }
  }
})

let item, owner, savedCanvas
beforeEach(() => {
  item = vehicleItem()
  item.update = vi.fn(async data => Object.assign(item, data))
  owner = {
    id: "pc", items: [], getEmbeddedDocument: () => item,
    toObject: () => ({
      _id: "pc"
    })
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => owner)
  globalThis.Actor.deleteDocuments = vi.fn(async () => {})
  globalThis.Actor.createDocuments = vi.fn(async data => data)
  savedCanvas = globalThis.canvas
  globalThis.canvas = {
    scene: null
  }
})

afterEach(() => {
  globalThis.canvas = savedCanvas
  vi.restoreAllMocks()
})

describe("a drone recalled, then deployed again", () => {
  for (const activated of [true, false]) {
    it(`keeps the secondary propulsion box ${activated ? "checked" : "unchecked"}`, async () => {
      await SR5_ActorHelper.dimissSidekick(drone(activated))
      expect(item.system.secondaryPropulsion.isActivated).toBe(activated)
      await SR5_ActorHelper.createSidekick(foundry.utils.duplicate(item), null, "pc")
      const [created] = Actor.createDocuments.mock.calls[0][0]
      expect(created["system.isSecondaryPropulsionActivate"]).toBe(activated)
    })
  }

  it("deploys a vehicle item saved before the box was kept with the box unchecked", async () => {
    delete item.system.secondaryPropulsion.isActivated
    await SR5_ActorHelper.createSidekick(foundry.utils.duplicate(item), null, "pc")
    expect(Actor.createDocuments.mock.calls[0][0][0]["system.isSecondaryPropulsionActivate"]).toBe(false)
  })
})
