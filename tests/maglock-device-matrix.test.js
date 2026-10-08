import {
  describe, it, expect, vi
} from 'vitest'

// A maglock is a device: its Data Processing and Firewall equal its Device Rating, it has no Attack nor Sleaze
// (SR5 p. 235-236). generateDeviceMatrix computed the attributes of a "device" only, and left those of a maglock at
// whatever was stored (0 in the Mégapack).

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

const value = (base = 0) => ({
  base, value: base, modifiers: []
})

function device(deviceType, stored = 0) {
  const attributes = {
  }
  for (const key of Object.keys(SR5.matrixAttributes)) attributes[key] = value(stored)
  return {
    name: "Maglock", type: "actorDevice",
    system: {
      isDirectlyConnected: false,
      matrix: {
        deviceType, deviceRating: 3, attributes, noise: value(), attributesCollection: {
        },
      },
    },
  }
}

describe('Maglock matrix attributes (SR5 p. 235-236)', () => {
  it('gives Data Processing and Firewall the Device Rating, nothing to Attack and Sleaze', () => {
    const actor = device("maglock", 0)
    SR5_CharacterUtility.generateDeviceMatrix(actor, {
      marks: [], markedItems: []
    })
    const a = actor.system.matrix.attributes
    expect(a.dataProcessing.value).toBe(3)
    expect(a.firewall.value).toBe(3)
    expect(a.attack.value).toBe(0)
    expect(a.sleaze.value).toBe(0)
  })

  it('ignores a stored value: the rating decides', () => {
    const actor = device("maglock", 5)
    SR5_CharacterUtility.generateDeviceMatrix(actor, {
      marks: [], markedItems: []
    })
    expect(actor.system.matrix.attributes.firewall.value).toBe(3)
    expect(actor.system.matrix.attributes.attack.value).toBe(0)
  })

  it('treats an ordinary device the same way', () => {
    const actor = device("device", 0)
    SR5_CharacterUtility.generateDeviceMatrix(actor, {
      marks: [], markedItems: []
    })
    expect(actor.system.matrix.attributes.firewall.value).toBe(3)
    expect(actor.system.matrix.attributes.attack.value).toBe(0)
  })
})
