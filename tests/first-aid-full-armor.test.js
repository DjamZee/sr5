import {
  describe, it, expect
} from 'vitest'
import {
  wearsFullArmor, firstAidHealedBoxes, firstAidBoxesOnClick
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

// Without a target the patient is selected on click: the halving happens there
describe('firstAidBoxesOnClick', () => {
  const inArmor = {
    items: [armor(true, true)]
  }
  const card = (hasTarget, hits, netHits, firstAidCap) => ({
    target: {
      hasTarget
    }, roll: {
      hits, netHits, firstAidCap
    }
  })
  it('halves for a selected patient in full armor (4 hits: 2 over the threshold, 1 healed)', () => {
    expect(firstAidBoxesOnClick(card(false, 4, 2, 6), inArmor)).toEqual({
      boxes: 1, halvedOnClick: true
    })
  })
  it('halves before the cap on click', () => {
    expect(firstAidBoxesOnClick(card(false, 10, 3, 3), inArmor).boxes).toBe(3)
    expect(firstAidBoxesOnClick(card(false, 8, 6, 6), inArmor).boxes).toBe(3)
  })
  it('keeps the card value without full armor', () => {
    expect(firstAidBoxesOnClick(card(false, 4, 2, 6), {
      items: []
    })).toEqual({
      boxes: 2, halvedOnClick: false
    })
  })
  it('never halves twice a targeted card', () => {
    expect(firstAidBoxesOnClick(card(true, 4, 1, 6), inArmor).boxes).toBe(1)
  })
  it('keeps the value of a card rolled before the cap was stored', () => {
    expect(firstAidBoxesOnClick(card(false, 4, 2, undefined), inArmor).boxes).toBe(2)
  })
})
