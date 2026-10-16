import {
  describe, it, expect, afterEach, vi
} from 'vitest'
import {
  ICE_HOST_ATTRIBUTES, iceHostAttributes, iceHostOf, icesOfHost, matrixActorsOf
} from '../modules/system/ice-host.js'

const host = (uuid, values, deviceType = "host") => ({
  uuid, type: "actorDevice", name: uuid, system: {
    matrix: {
      deviceType, attributes: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
        value
      }]))
    }
  }
})
const ice = (hostUuid, deviceType = "ice") => ({
  type: "actorDevice", system: {
    matrix: {
      deviceType, hostUuid
    }
  }
})

describe('An IC uses the matrix attributes of its host (SR5 p. 249)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads Attack, Sleaze, Data Processing and Firewall from the host', () => {
    expect(ICE_HOST_ATTRIBUTES).toEqual(["attack", "sleaze", "dataProcessing", "firewall"])
    //A host of rating 7, default order (SR5 p. 248): 7, 8, 9, 10
    expect(iceHostAttributes(host("Actor.h7", {
      attack: 7, sleaze: 8, dataProcessing: 9, firewall: 10, noiseReduction: 3
    }))).toEqual({
      attack: 7, sleaze: 8, dataProcessing: 9, firewall: 10
    })
  })

  it('reads nothing from what is no host', () => {
    expect(iceHostAttributes(null)).toBe(null)
    expect(iceHostAttributes(host("Actor.d", {
      attack: 4
    }, "device"))).toBe(null)
    expect(iceHostAttributes({
      type: "actorPc", system: {
        matrix: {
          deviceType: "host"
        }
      }
    })).toBe(null)
  })

  it('finds the host from hostUuid, a host only, nothing without hostUuid', () => {
    const h7 = host("Actor.h7", {
      attack: 7
    }), device = host("Actor.d", {
      attack: 3
    }, "device")
    vi.stubGlobal("fromUuidSync", uuid => ({
      "Actor.h7": h7, "Actor.d": device
    })[uuid] ?? null)
    expect(iceHostOf(ice("Actor.h7"))).toBe(h7)
    expect(iceHostOf(ice(""))).toBe(null)
    expect(iceHostOf(ice("Actor.d"))).toBe(null)
    expect(iceHostOf(ice("Actor.gone"))).toBe(null)
  })

  it('a hostUuid that cannot be resolved leaves the IC as it is', () => {
    vi.stubGlobal("fromUuidSync", () => {
      throw new Error("bad uuid")
    })
    expect(iceHostOf(ice("Compendium.x.y"))).toBe(null)
  })

  it('lists the ICs of a host', () => {
    const h7 = host("Actor.h7", {
    }), a = ice("Actor.h7"), b = ice("Actor.h3"), c = ice("Actor.h7", "device")
    expect(icesOfHost(h7, [a, b, c, null])).toEqual([a])
    expect(icesOfHost(null, [a])).toEqual([])
  })

  it('finds the copies of an IC on the unlinked tokens of the scenes too (review 36)', () => {
    const h7 = host("Actor.h7", {
    }), base = ice("Actor.h7"), copy = ice("Actor.h7"), linked = ice("Actor.h7")
    const actors = Object.assign([base], {
      get: id => id === "base" ? base : id === "pc" ? {
        type: "actorPc", system: {
        }
      } : null
    })
    const pcToken = {
      actorLink: false, actorId: "pc", get actor() {
        throw new Error("a token that is no IC is not built")
      }
    }
    const scenes = [{
      tokens: [{
        actorLink: false, actorId: "base", actor: copy
      }, {
        actorLink: true, actorId: "base", actor: linked
      }, pcToken]
    }, {
      tokens: []
    }]
    expect(icesOfHost(h7, matrixActorsOf(actors, scenes))).toEqual([base, copy])
    expect(matrixActorsOf(null, null)).toEqual([])
  })
})
