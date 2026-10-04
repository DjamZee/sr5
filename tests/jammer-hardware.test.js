import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  jammerNoiseAt, jammerReachInMeters, jammerRating, isWithinConeAngle, jammerSpares
} from "../modules/system/jammerRules.js"
import {
  SR5_Jammer
} from "../modules/system/jammer.js"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_SystemHelpers
} from "../modules/system/utilitySystem.js"

// The physical jammer of SR5 p. 443: Noise equal to its Device Rating, minus 1 every 5 m (area) or every 20 m
// (30-degree cone). Settled by DjamZ where the page is silent: the rating drops at each full step (5 m exactly
// already gives 1 less), the wearer suffers its own jammer, several jammers add up, the cone stays where it was put.
describe("physical jammer rules (SR5 p. 443)", () => {
  it("loses 1 every 5 m for an area jammer, 5 m exactly included", () => {
    expect([0, 4.9, 5, 9.9, 10, 19.9, 20, 35].map(d => jammerNoiseAt("area", 4, d))).toEqual([4, 4, 3, 3, 2, 1, 0, 0])
  })

  it("loses 1 every 20 m for a directional jammer", () => {
    expect([0, 19.9, 20, 60, 119.9, 120].map(d => jammerNoiseAt("directional", 6, d))).toEqual([6, 6, 5, 3, 1, 0])
  })

  it("reaches as far as its noise lasts", () => {
    expect(jammerReachInMeters("area", 6)).toBe(30)
    expect(jammerReachInMeters("directional", 4)).toBe(80)
    expect(jammerReachInMeters("cranial", 4)).toBe(0)
  })

  it("works with the Device Rating, else the item's rating", () => {
    expect(jammerRating({
      deviceRating: 5, itemRating: 3
    })).toBe(5)
    expect(jammerRating({
      deviceRating: 0, itemRating: 3
    })).toBe(3)
  })

  it("covers 15 degrees on each side of the aim, clockwise on screen", () => {
    const o = {
      x: 0, y: 0
    }
    expect(isWithinConeAngle(o, 0, 30, {
      x: 100, y: 26
    })).toBe(true) // 14.6 degrees
    expect(isWithinConeAngle(o, 0, 30, {
      x: 100, y: 28
    })).toBe(false) // 15.6 degrees
    expect(isWithinConeAngle(o, 90, 30, {
      x: 0, y: 100
    })).toBe(true) // straight down
    expect(isWithinConeAngle(o, 350, 30, {
      x: 100, y: 5
    })).toBe(true) // aimed 10 degrees up, the target 3 degrees down: 13 degrees off, across 0
    expect(isWithinConeAngle(o, 350, 30, {
      x: 100, y: 10
    })).toBe(false) // 6 degrees down: 16 degrees off
  })

  it("spares only in wireless mode, and a cranial jammer touches its wearer alone", () => {
    const sys = (type, wirelessTurnedOn) => ({
      wirelessTurnedOn, jammer: {
        type, spared: ["ally"]
      }
    })
    expect(jammerSpares(sys("area", false), "me", "ally")).toBe(false)
    expect(jammerSpares(sys("area", true), "me", "ally")).toBe(true)
    expect(jammerSpares(sys("area", true), "me", "me")).toBe(false)
    expect(jammerSpares(sys("cranial", false), "me", "other")).toBe(true)
    expect(jammerSpares(sys("cranial", false), "me", "me")).toBe(false)
  })
})

describe("SR5_Jammer on a scene", () => {
  afterEach(() => vi.restoreAllMocks())

  const jammerItem = (uuid, type, rating, extra = {
  }) => ({
    uuid, name: uuid, type: "itemGear", system: {
      deviceRating: rating, wirelessTurnedOn: false, jammer: {
        type, isActive: true, spared: []
      }, ...extra
    }
  })

  // Distances are measured by Foundry's grid: here one scene unit is one meter, along x
  const flatMeters = () => {
    vi.spyOn(SR5_SystemHelpers, "getDistanceBetweenTwoPoint").mockImplementation((a, b) => Math.hypot(b.x - a.x, b.y - a.y))
    vi.spyOn(SR5_SystemHelpers, "getDistanceInMetersBetweenTwoPoint").mockImplementation((a, b) => Math.hypot(b.x - a.x, b.y - a.y))
  }

  it("gives the wearer the full rating and adds two jammers on one target", () => {
    flatMeters()
    const carrier = {
      id: "me", items: []
    }
    const sources = [
      {
        item: jammerItem("Actor.me.Item.a", "area", 4), carrier, origin: {
          x: 0, y: 0
        }
      },
      {
        item: jammerItem("Actor.you.Item.b", "area", 6), carrier: {
          id: "you"
        }, origin: {
          x: 30, y: 0
        }
      },
    ]
    const self = SR5_Jammer.desiredNoise(carrier, {
      x: 0, y: 0
    }, sources, {
    })
    expect(self.get("Actor.me.Item.a").noise).toBe(4)
    expect(self.get("Actor.you.Item.b")).toBeUndefined() // 30 m from a rating 6: nothing left
    const target = SR5_Jammer.desiredNoise({
      id: "t", items: []
    }, {
      x: 12, y: 0
    }, sources, {
    })
    // 12 m from the first (4 - 2), 18 m from the second (6 - 3): both count
    expect([...target.values()].map(w => w.noise)).toEqual([2, 3])
  })

  it("keeps a directional jammer inside its cone", () => {
    flatMeters()
    const source = {
      item: jammerItem("Actor.me.Item.d", "directional", 4), carrier: {
        id: "me"
      }, origin: {
        x: 0, y: 0
      }, template: {
        direction: 0, angle: 30, distance: 80
      }
    }
    const at = (x, y) => SR5_Jammer.desiredNoise({
      id: "t", items: []
    }, {
      x, y
    }, [source], {
    }).get("Actor.me.Item.d")?.noise
    expect(at(45, 0)).toBe(2)
    expect(at(45, 30)).toBeUndefined()
    expect(at(-10, 0)).toBeUndefined()
  })

  it("gives a cranial jammer to its wearer only, with no token needed", () => {
    const wearer = {
      id: "w", items: [jammerItem("Actor.w.Item.c", "cranial", 3)]
    }
    expect(SR5_Jammer.desiredNoise(wearer, null, [], null).get("Actor.w.Item.c").noise).toBe(3)
  })

  it("gives the noise again when it changed, and leaves the Jam Signals action alone", async () => {
    const removed = vi.spyOn(SR5_EffectArea, "removeJammedEffect").mockImplementation(async () => {})
    const created = vi.spyOn(SR5_EffectArea, "createJammedEffect").mockImplementation(async () => {})
    const fx = (ownerID, value) => ({
      system: {
        type: "signalJammed", ownerID, value
      }
    })
    const action = fx("actorId", 5), same = fx("Actor.a.Item.x", 3), stale = fx("Actor.a.Item.y", 4), gone = fx("Actor.a.Item.z", 2)
    const actor = {
      items: [action, same, stale, gone]
    }
    await SR5_Jammer.syncActor(actor, new Map([["Actor.a.Item.x", {
      name: "x", noise: 3
    }], ["Actor.a.Item.y", {
      name: "y", noise: 2
    }]]))
    expect(removed.mock.calls.map(c => c[1])).toEqual([stale, gone])
    expect(created.mock.calls.map(c => [c[0].id, c[2]])).toEqual([["Actor.a.Item.y", 2]])
  })
})
