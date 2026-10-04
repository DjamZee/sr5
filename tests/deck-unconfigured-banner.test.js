import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

// SR5 p. 229: each of the four values of the attribute array is assigned to a matrix attribute
const deck = (values, set) => ({
  matrix: {
    deviceType: "cyberdeck",
    attributesCollection: {
      value1: values[0], value2: values[1], value3: values[2], value4: values[3],
      value1isSet: set[0], value2isSet: set[1], value3isSet: set[2], value4isSet: set[3],
    },
  },
})

describe('isDeckUnconfigured (SR5 p. 229)', () => {
  it('warns when no value of the array is assigned', () => {
    expect(SR5_CharacterUtility.isDeckUnconfigured(deck([6, 5, 5, 3], [false, false, false, false]))).toBe(true)
  })

  it('warns when the array is only partly assigned', () => {
    expect(SR5_CharacterUtility.isDeckUnconfigured(deck([6, 5, 5, 3], [true, true, true, false]))).toBe(true)
  })

  it('stays silent once the four values are assigned', () => {
    expect(SR5_CharacterUtility.isDeckUnconfigured(deck([6, 5, 5, 3], [true, true, true, true]))).toBe(false)
  })

  it('stays silent for an empty array: nothing to assign', () => {
    expect(SR5_CharacterUtility.isDeckUnconfigured(deck([0, 0, 0, 0], [false, false, false, false]))).toBe(false)
  })

  it('stays silent when the active device is not a cyberdeck', () => {
    const data = deck([6, 5, 5, 3], [false, false, false, false])
    data.matrix.deviceType = "commlink"
    expect(SR5_CharacterUtility.isDeckUnconfigured(data)).toBe(false)
  })
})
