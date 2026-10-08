import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// SR5 p. 235-236: a device has a Device Rating and two matrix attributes, Data Processing and Firewall; no Attack,
// no Sleaze. SR5 p. 237: without Sleaze, it defends with the first element alone (« Logique seule si l'objet ne
// dispose pas d'un attribut Corruption »), and likewise without Attack. Hosts and IC keep their attributes.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5
} = await import('../modules/config.js')
const {
  isPlainDevice, lacksAttackAndSleaze
} = await import('../modules/entities/actors/device-attributes.js')

const value = (base = 0) => ({
  base, value: base, modifiers: []
})
const pool = () => ({
  base: 0, dicePool: 0, modifiers: []
})

function device(deviceType, rating = 4) {
  const attributes = {
  }, actions = {
  }
  for (const key of Object.keys(SR5.matrixAttributes)) attributes[key] = value(rating)
  for (const key of Object.keys(SR5.matrixActions)) actions[key] = {
    defense: pool()
  }
  return {
    name: "Caméra du hall", type: "actorDevice", items: [],
    system: {
      isDirectlyConnected: false,
      matrix: {
        deviceType, deviceRating: rating, attributes, actions, noise: value(), attributesCollection: {
        },
      },
    },
  }
}

const prepare = (actor) => {
  SR5_CharacterUtility.generateDeviceMatrix(actor, {
    marks: [], markedItems: []
  })
  SR5_CharacterUtility.generateMatrixActionsDefenses(actor)
  return actor.system.matrix
}
const total = (defense) => defense.modifiers.reduce((sum, m) => sum + m.value, 0)
const kinds = (defense) => defense.modifiers.map(m => m.type)

beforeEach(() => {
  // Kill Code actions on (Isoler, Taguer), Rigger 5.0 off
  game.settings.get = vi.fn((scope, key) => key === "sr5KillCodeRules")
})

describe('Matrix attributes of a device (SR5 p. 235-236)', () => {
  it('a device: Data Processing and Firewall at its rating, the four others at 0', () => {
    const m = prepare(device("device"))
    expect(m.attributes.dataProcessing.value).toBe(4)
    expect(m.attributes.firewall.value).toBe(4)
    for (const key of ["attack", "sleaze", "noiseReduction", "sharing"]) expect(m.attributes[key].value).toBe(0)
  })

  it('a slaved device reached by direct connection uses its own ratings the same way', () => {
    const actor = device("slavedDevice")
    actor.system.isDirectlyConnected = true
    const m = prepare(actor)
    expect(m.attributes.firewall.value).toBe(4)
    expect(m.attributes.sleaze.value).toBe(0)
  })

  it('a host keeps its attributes', () => {
    expect(isPlainDevice("host", false)).toBe(false)
    expect(isPlainDevice("ice", false)).toBe(false)
    expect(lacksAttackAndSleaze({
      type: "actorDevice", system: {
        matrix: {
          deviceType: "host"
        }
      }
    })).toBe(false)
    expect(lacksAttackAndSleaze({
      type: "actorDrone", system: {
        matrix: {
          deviceType: ""
        }
      }
    })).toBe(false)
  })
})

describe('Defenses of a device without Attack nor Sleaze (SR5 p. 237)', () => {
  // Each touched defense: the first element alone, with no Sleaze or Attack line
  const touched = {
    matrixPerception: "Logique + Corruption",
    traceIcon: "Volonté + Corruption",
    jackOut: "Logique + Attaque",
    squelch: "Intuition + Corruption",
    tag: "Intuition + Corruption",
  }
  for (const [key, book] of Object.entries(touched)) {
    it(`${key} (${book}) : the Device Rating alone`, () => {
      const m = prepare(device("device"))
      expect(total(m.actions[key].defense)).toBe(4)
      expect(m.actions[key].defense.modifiers).toHaveLength(1)
    })
  }

  it('the same on an unconnected slaved device, which used its rating for Sleaze and Attack', () => {
    const m = prepare(device("slavedDevice"))
    expect(total(m.actions.matrixPerception.defense)).toBe(4)
    expect(total(m.actions.jackOut.defense)).toBe(4)
  })

  it('the defenses with Firewall or Data Processing keep both elements', () => {
    const m = prepare(device("device"))
    expect(total(m.actions.hackOnTheFly.defense)).toBe(8)
    expect(total(m.actions.hide.defense)).toBe(8)
    expect(kinds(m.actions.dataSpike.defense)).toContain("matrixAttribute")
  })

  it('a host still defends with its Sleaze', () => {
    const actor = device("host")
    actor.system.matrix.attributes.sleaze = value(6)
    SR5_CharacterUtility.generateMatrixActionsDefenses(actor)
    expect(total(actor.system.matrix.actions.matrixPerception.defense)).toBe(10)
  })
})
