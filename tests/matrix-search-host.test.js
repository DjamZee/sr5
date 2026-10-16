import {
  describe, it, expect
} from 'vitest'

// Lot 19: Matrix Search (SR5 p. 244), its table, and the search inside the host that holds a protected file

globalThis.CONFIG ??= {
}
const {
  SR5_ConverterHelpers
} = await import('../modules/rolls/roll-helpers/converter.js')
const {
  SR5
} = await import('../modules/config.js')

describe('Matrix Search (SR5 p. 244)', () => {
  it('keeps the table of the book', () => {
    expect(['general', 'limited', 'hidden'].map(t => SR5_ConverterHelpers.searchTypeToThreshold(t))).toEqual([1, 3, 6])
    expect(['general', 'limited', 'hidden'].map(t => SR5_ConverterHelpers.matrixSearchTypeToTime(t))).toEqual([1, 30, 12])
    expect(SR5_ConverterHelpers.matrixSearchTypeToUnitTime('hidden')).toBe('hour')
  })

  it('inside the host: a base time of 1 minute, whatever the information', () => {
    expect(SR5.matrixSearchInfoType.host).toBe('SR5.MatrixSearchInfoTypeHost')
    expect(SR5_ConverterHelpers.matrixSearchTypeToTime('host')).toBe(1)
    expect(SR5_ConverterHelpers.matrixSearchTypeToUnitTime('host')).toBe('minute')
    expect(SR5_ConverterHelpers.searchTypeToThreshold('host')).toBe(3)
  })
})
