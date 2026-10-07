import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes CONFIG.statusEffects at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  noiseOfMeters, relayedNoise, riggerNoiseModifier, riggerNoiseApplies, isRelayUnit, tokenOfActor, riggerLinkNoise,
  applyRiggerNoise
} from '../modules/system/rigger-noise.js'

// SR5 p. 268: a wireless rigger suffers the noise of the distance (p. 232) on every action of her drones, none when
// wired; Rigger 5.0 p. 170: a relay unit measures from itself, a chain keeps its noisiest link.

describe('noiseOfMeters', () => {
  it('reads the p. 232 table as DjamZ settled it (N32): 0 up to 100 m, 1 beyond', () => {
    expect(noiseOfMeters(9)).toBe(0)
    expect(noiseOfMeters(100)).toBe(0)
    expect(noiseOfMeters(120)).toBe(1)
    expect(noiseOfMeters(1000)).toBe(1)
    expect(noiseOfMeters(1500)).toBe(3)
    expect(noiseOfMeters(15000)).toBe(5)
    expect(noiseOfMeters(200000)).toBe(8)
    expect(noiseOfMeters(null)).toBe(null)
  })
})

describe('riggerNoiseModifier', () => {
  it('takes the Noise Reduction off the noise, never giving a bonus', () => {
    expect(riggerNoiseModifier(3, 0)).toBe(-3)
    expect(riggerNoiseModifier(3, 2)).toBe(-1)
    expect(riggerNoiseModifier(1, 4)).toBe(0)
    expect(riggerNoiseModifier(0, 0)).toBe(0)
  })
})

describe('relayedNoise', () => {
  // Points on a line, in km; the link is the noise of the distance between two of them
  const link = (a, b) => noiseOfMeters(Math.abs(a.km - b.km) * 1000)
  const rigger = {
      km: 0
    }, drone = {
      km: 15
    }
  it('keeps the direct noise without a relay (15 km: 5)', () => {
    expect(relayedNoise(link, rigger, drone)).toBe(5)
  })
  it('measures from the relay, the worse of the two links: the example of R5 p. 170 (3)', () => {
    expect(relayedNoise(link, rigger, drone, [{
      km: 9
    }])).toBe(3)
  })
  it('never makes the noise worse than the direct link', () => {
    expect(relayedNoise(link, rigger, {
      km: 0.5
    }, [{
      km: 50
    }])).toBe(1)
  })
  it('follows a chain of relays, keeping its noisiest link', () => {
    expect(relayedNoise(link, rigger, {
      km: 3
    }, [{
      km: 1
    }, {
      km: 2
    }])).toBe(1)
  })
})

describe('riggerNoiseApplies', () => {
  const drone = (system = {
  }) => ({
    type: "actorDrone", system: {
      controlMode: "remote", vehicleOwner: {
        id: "rigger"
      }, ...system
    }
  })
  it('applies to the actions of a drone under remote control or jumped in', () => {
    expect(riggerNoiseApplies(drone(), "vehicleTest")).toBe(true)
    expect(riggerNoiseApplies(drone({
      controlMode: "rigging"
    }), "attack")).toBe(true)
  })
  it('spares the autopilot, a driver at the wheel, the defenses, a wired drone and one with its wireless off', () => {
    expect(riggerNoiseApplies(drone({
      controlMode: "autopilot"
    }), "vehicleTest")).toBe(false)
    expect(riggerNoiseApplies(drone({
      controlMode: "manual"
    }), "vehicleTest")).toBe(false)
    expect(riggerNoiseApplies(drone(), "defense")).toBe(false)
    expect(riggerNoiseApplies(drone({
      riggerCabled: true
    }), "vehicleTest")).toBe(false)
    expect(riggerNoiseApplies(drone({
      wirelessTurnedOn: false
    }), "vehicleTest")).toBe(false)
  })
  it('falls back on the rigger who deployed it, and needs a controller', () => {
    expect(riggerNoiseApplies(drone({
      vehicleOwner: {
        id: ""
      }, creatorId: "rigger"
    }), "vehicleTest")).toBe(true)
    expect(riggerNoiseApplies(drone({
      vehicleOwner: {
        id: ""
      }
    }), "vehicleTest")).toBe(false)
    expect(riggerNoiseApplies({
      type: "actorPc", system: {
      }
    }, "vehicleTest")).toBe(false)
  })
})

describe('isRelayUnit', () => {
  it('knows a relay unit by its effect or its name, when active', () => {
    expect(isRelayUnit({
      type: "itemVehicleMod", name: "Unité de Relais", system: {
      }
    })).toBe(true)
    expect(isRelayUnit({
      type: "itemVehicleMod", name: "Relay Unit", system: {
      }
    })).toBe(true)
    expect(isRelayUnit({
      type: "itemVehicleMod", name: "X", system: {
        systemEffects: {
          a: {
            value: "relayUnit"
          }
        }
      }
    })).toBe(true)
    expect(isRelayUnit({
      type: "itemVehicleMod", name: "Unité de Relais", system: {
        isActive: false
      }
    })).toBe(false)
    expect(isRelayUnit({
      type: "itemGear", name: "Relay Unit", system: {
      }
    })).toBe(false)
  })
})

describe('on the canvas', () => {
  // Squares of 1.5 m, 100 px each
  const scene = {
    grid: {
      units: "m"
    }
  }
  const other = {
    grid: {
      units: "m"
    }
  }
  const grid = {
    measurePath: ([a, b]) => ({
      distance: Math.hypot(b.x - a.x, b.y - a.y) / 100 * 1.5
    })
  }
  const meters = m => m / 1.5 * 100
  const rigger = {
    id: "rigger", type: "actorPc", system: {
      matrix: {
        attributes: {
          noiseReduction: {
            value: 0
          }
        }
      }
    }, items: []
  }
  const droneActor = (id, system = {
  }, items = []) => ({
    id, type: "actorDrone", items, system: {
      controlMode: "remote", vehicleOwner: {
        id: "rigger"
      }, ...system
    }
  })
  const token = (m, actor, onScene = scene, linked = true) => ({
    center: {
      x: meters(m), y: 0
    }, actor, controlled: false, document: {
      parent: onScene, actorId: actor.id, actorLink: linked
    }
  })
  const canvasWith = placeables => ({
    scene, grid, tokens: {
      placeables
    }
  })
  const resolve = id => id === "rigger" ? rigger : null
  const rollData = type => ({
    test: {
      type
    }, dicePool: {
      modifiers: []
    }
  })

  it('a drone 120 m away: noise 1, -1 die', () => {
    const drone = droneActor("d")
    const canvas = canvasWith([token(0, rigger), token(120, drone)])
    expect(riggerLinkNoise(drone, rigger, canvas)).toBe(1)
    const data = rollData("vehicleTest")
    expect(applyRiggerNoise(data, drone, {
      resolve, canvasLike: canvas, label: "Bruit"
    })).toBe(-1)
    expect(data.dicePool.modifiers).toEqual([{
      type: "riggerNoise", label: "Bruit", value: -1
    }])
  })

  it('a wired drone: nothing', () => {
    const drone = droneActor("d", {
      riggerCabled: true
    })
    const data = rollData("vehicleTest")
    expect(applyRiggerNoise(data, drone, {
      resolve, canvasLike: canvasWith([token(0, rigger), token(120, drone)])
    })).toBe(0)
    expect(data.dicePool.modifiers).toEqual([])
  })

  it('the Noise Reduction of the rigger (her RCC) takes the noise off', () => {
    const rcc = {
      ...rigger, system: {
        matrix: {
          attributes: {
            noiseReduction: {
              value: 2
            }
          }
        }
      }
    }
    const drone = droneActor("d")
    const data = rollData("attack")
    expect(applyRiggerNoise(data, drone, {
      resolve: () => rcc, canvasLike: canvasWith([token(0, rcc), token(1500, drone)])
    })).toBe(-1)
  })

  it('a drone off the scene shown: nothing counted, the gamemaster sets the noise by hand', () => {
    const drone = droneActor("d")
    const canvas = canvasWith([token(0, rigger), token(120, drone, other)])
    expect(riggerLinkNoise(drone, rigger, canvas)).toBe(null)
    const data = rollData("vehicleTest")
    expect(applyRiggerNoise(data, drone, {
      resolve, canvasLike: canvas
    })).toBe(0)
  })

  it('a relay drone of the same rigger brings a far drone back to its own noise', () => {
    const drone = droneActor("d")
    const relay = droneActor("r", {
    }, [{
      type: "itemVehicleMod", name: "Unité de Relais", system: {
      }
    }])
    const stranger = droneActor("s", {
      vehicleOwner: {
        id: "someone"
      }
    }, [{
      type: "itemVehicleMod", name: "Unité de Relais", system: {
      }
    }])
    expect(riggerLinkNoise(drone, rigger, canvasWith([token(0, rigger), token(1500, drone)]))).toBe(3)
    expect(riggerLinkNoise(drone, rigger, canvasWith([token(0, rigger), token(1500, drone), token(800, relay)]))).toBe(1)
    expect(riggerLinkNoise(drone, rigger, canvasWith([token(0, rigger), token(1500, drone), token(800, stranger)]))).toBe(3)
  })

  it('an unlinked drone is found by its own token, never another of the same model', () => {
    const tokenDoc = {
    }
    const synthetic = {
      ...droneActor("model"), isToken: true, token: tokenDoc
    }
    const sibling = token(5, droneActor("model"), scene, false)
    const own = {
      ...token(150, synthetic, scene, false), document: tokenDoc
    }
    tokenDoc.parent = scene
    expect(tokenOfActor(synthetic, scene, [sibling, own])).toBe(own)
    expect(riggerLinkNoise(synthetic, rigger, canvasWith([token(0, rigger), sibling, own]))).toBe(1)
  })
})
