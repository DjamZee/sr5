import {
  describe, it, expect, vi, beforeEach
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
const {
  SR5, VEHICLE_TOKEN_SIZES
} = await import("../modules/config.js")

// Ernest (18/10): a vehicle deployed from its item came out on one square, a car looked like a toy. Its token takes
// the item's own size (a token drawn to scale, or the size it had when recalled), else a size by category
// (VEHICLE_TOKEN_SIZES, arbitrage de DjamZ), the length upright; drones stay on one square.

describe("vehicleTokenSize", () => {
  it.each([
    ["bike", 1, 2], ["car", 2, 3], ["truck", 2, 4], ["vectorThrustCraft", 3, 3], ["rotorCraft", 3, 3],
    ["boat", 2, 4], ["submarine", 2, 3], ["mediumDrone", 1, 1], ["microdrone", 1, 1], ["hugeDrone", 1, 1],
  ])("gives a %s %i × %i squares", (category, width, height) => {
    expect(SR5_ActorHelper.vehicleTokenSize({
      category
    })).toEqual({
      width, height
    })
  })

  it("has a size for every vehicle and drone category the system knows", () => {
    for (const category of Object.keys(SR5.vehiclesCategories)) {
      expect(VEHICLE_TOKEN_SIZES[category], category).toBeDefined()
    }
  })

  it("leaves an item without category, or with an unknown one, to the system's square", () => {
    expect(SR5_ActorHelper.vehicleTokenSize({
      category: ""
    })).toBeNull()
    expect(SR5_ActorHelper.vehicleTokenSize({
      category: "hovercraft"
    })).toBeNull()
    expect(SR5_ActorHelper.vehicleTokenSize(undefined)).toBeNull()
  })

  it("takes the item's own size first: a token drawn to scale, or the one kept at recall", () => {
    expect(SR5_ActorHelper.vehicleTokenSize({
      category: "truck", sideKickPrototypeToken: {
        width: 7, height: 10.5
      }
    })).toEqual({
      width: 7, height: 10.5
    })
    expect(SR5_ActorHelper.vehicleTokenSize({
      category: "", sideKickPrototypeToken: {
        width: 1, height: 1
      }
    })).toEqual({
      width: 1, height: 1
    })
  })

  it("falls back on the category when the item's own token has no size (never recalled)", () => {
    expect(SR5_ActorHelper.vehicleTokenSize({
      category: "car", sideKickPrototypeToken: {
      }
    })).toEqual({
      width: 2, height: 3
    })
    expect(SR5_ActorHelper.vehicleTokenSize({
      category: "car", sideKickPrototypeToken: null
    })).toEqual({
      width: 2, height: 3
    })
  })
})

const ATTRIBUTES = ["handling", "handlingOffRoad", "speed", "speedOffRoad", "acceleration", "accelerationOffRoad",
  "body", "armor", "pilot", "sensor"]
const SLOTS = ["powerTrain", "protection", "weapons", "body", "electromagnetic", "cosmetic"]

const vehicleItem = (category, sideKickPrototypeToken = {
}) => ({
  _id: "veh", type: "itemVehicle", name: "Vehicle", img: "x.webp",
  system: {
    type: "vehicle", category, model: "", autosoft: [], ammunitions: [], weapons: [], armors: [], vehiclesMod: [],
    decks: [], sideKickPrototypeToken, price: {
      base: 0
    },
    attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, 1])),
    secondaryPropulsion: {
      isSecondaryPropulsion: false
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

describe("createSidekick on a vehicle item", () => {
  let item
  beforeEach(() => {
    item = vehicleItem("car")
    const owner = {
      id: "pc", items: [], getEmbeddedDocument: () => ({
        update: vi.fn(async () => {})
      }),
      toObject: () => ({
        _id: "pc"
      })
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => owner)
    globalThis.Actor.createDocuments = vi.fn(async data => data)
  })

  const created = () => globalThis.Actor.createDocuments.mock.calls[0][0][0]
  const width = data => data.prototypeToken?.width ?? data["prototypeToken.width"]
  const height = data => data.prototypeToken?.height ?? data["prototypeToken.height"]

  it("gives the actor's token the size of its category", async () => {
    await SR5_ActorHelper.createSidekick(item, null, "pc")
    expect([width(created()), height(created())]).toEqual([2, 3])
  })

  it("deploys a recalled vehicle at the size its token had, not back on one square", async () => {
    item = vehicleItem("car", {
      width: 3, height: 4
    })
    await SR5_ActorHelper.createSidekick(item, null, "pc")
    expect([width(created()), height(created())]).toEqual([3, 4])
  })

  it("writes no size for an item without category nor size of its own", async () => {
    item = vehicleItem("")
    await SR5_ActorHelper.createSidekick(item, null, "pc")
    expect(width(created())).toBeUndefined()
    expect(height(created())).toBeUndefined()
  })
})
