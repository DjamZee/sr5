import {
  describe, it, expect
} from 'vitest'
import {
  wearsFullArmor, firstAidHealedBoxes
} from '../modules/rolls/roll-helpers/cardRoller.js'

const armor = (isActive, isFullArmor) => ({
  type: "itemArmor", system: {
    isActive, isFullArmor
  }
})

// SR5 p. 207: effects halved (rounded up) if the patient wears any kind of full armor
describe('wearsFullArmor', () => {
  it('sees an active full armor', () => {
    expect(wearsFullArmor({
      items: [armor(true, true)]
    })).toBe(true)
  })
  it('ignores a full armor that is not worn', () => {
    expect(wearsFullArmor({
      items: [armor(false, true)]
    })).toBe(false)
  })
  it('ignores a worn armor that is not full', () => {
    expect(wearsFullArmor({
      items: [armor(true, false)]
    })).toBe(false)
  })
  it('ignores a missing patient', () => {
    expect(wearsFullArmor(null)).toBe(false)
  })
})

describe('firstAidHealedBoxes', () => {
  it('heals the hits over the threshold', () => {
    expect(firstAidHealedBoxes(5, 2, 6, false)).toBe(3)
  })
  it('halves them, rounded up, through a full armor', () => {
    expect(firstAidHealedBoxes(5, 2, 6, true)).toBe(2)
    expect(firstAidHealedBoxes(6, 2, 6, true)).toBe(2)
  })
  it('halves before the skill rating cap', () => {
    expect(firstAidHealedBoxes(10, 2, 3, true)).toBe(3)
    expect(firstAidHealedBoxes(10, 2, 3, false)).toBe(3)
    expect(firstAidHealedBoxes(8, 2, 6, true)).toBe(3)
  })
  it('heals nothing at or under the threshold', () => {
    expect(firstAidHealedBoxes(2, 2, 6, true)).toBe(0)
  })
})
