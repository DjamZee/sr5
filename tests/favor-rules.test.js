import {
  describe, it, expect
} from 'vitest'
import {
  favorsOf, balanceOf, chipsForFavor, favorNeedsTest, spendableChips, afterFavorObtained, chipsClearedByFavors,
  loyaltyImprovement, pushLog, LOG_LENGTH, CHIPS_FOR_SERVICE
} from '../modules/system/favor-rules.js'

// Run Faster p. 170-172 (VF), SR5 p. 391
describe('the balance of chips', () => {
  it('reads who owes whom from one signed number', () => {
    expect(balanceOf(3)).toEqual({
      side: 'contactOwes', count: 3
    })
    expect(balanceOf(-2)).toEqual({
      side: 'characterOwes', count: 2
    })
    expect(balanceOf(0).side).toBe('even')
  })

  it('gives a contact without favors an even balance', () => {
    expect(favorsOf({
    })).toEqual({
      chips: 0, relation: '', intimidated: false, log: []
    })
    expect(favorsOf({
      favors: {
        relation: 'friend'
      }
    }).relation).toBe('')
  })
})

describe('asking a favor, SR5 p. 391 and RF p. 170', () => {
  it('needs a test only above the Loyalty', () => {
    expect(favorNeedsTest(3, 3)).toBe(false)
    expect(favorNeedsTest(4, 3)).toBe(true)
  })

  it('spends held chips for dice, four at most', () => {
    expect(spendableChips(6)).toBe(4)
    expect(spendableChips(2)).toBe(2)
    expect(spendableChips(-3)).toBe(0)
  })

  it('gives the contact the rating in chips, minus what the character holds', () => {
    // Even: a rating 2 favor, the character owes 2
    expect(afterFavorObtained(0, 2)).toBe(-2)
    // The character held 3: a rating 2 favor leaves him 1
    expect(afterFavorObtained(3, 2)).toBe(1)
    // Held 1, rating 4: owes 3 (« ne réduit que partiellement »)
    expect(afterFavorObtained(1, 4)).toBe(-3)
    // Two chips spent on the test leave first
    expect(afterFavorObtained(3, 2, {
      spent: 2
    })).toBe(-1)
  })

  it('lightens a family favor by one chip and makes a blackmail favor free (RF p. 172)', () => {
    expect(chipsForFavor(3, 'family')).toBe(2)
    expect(chipsForFavor(1, 'family')).toBe(0)
    expect(chipsForFavor(5, 'blackmail')).toBe(0)
    expect(afterFavorObtained(0, 3, {
      relation: 'blackmail'
    })).toBe(0)
  })
})

describe('paying back and improving', () => {
  it('clears half the rating of the favors given back (twice the value asked, RF p. 170)', () => {
    // A rating 2 favor owed: two rating 2 favors, or one rating 4, clear it
    expect(chipsClearedByFavors(4, -2)).toBe(2)
    expect(chipsClearedByFavors(2, -2)).toBe(1)
    expect(chipsClearedByFavors(10, -2)).toBe(2)
    expect(chipsClearedByFavors(4, 1)).toBe(0)
  })

  it('counts a service done as one chip', () => {
    expect(CHIPS_FOR_SERVICE).toBe(1)
  })

  it('costs the Loyalty aimed at, in chips and weeks', () => {
    expect(loyaltyImprovement(1, 2)).toEqual({
      target: 2, cost: 2, weeks: 2, refused: null
    })
    expect(loyaltyImprovement(1, 1).refused).toBe('chips')
    expect(loyaltyImprovement(6, 20).refused).toBe('max')
    expect(loyaltyImprovement(2, 2, {
      relation: 'family'
    })).toMatchObject({
      cost: 2, refused: null
    })
    expect(loyaltyImprovement(2, 9, {
      intimidated: true
    }).refused).toBe('intimidated')
    expect(loyaltyImprovement(2, 9, {
      relation: 'blackmail'
    }).refused).toBe('blackmail')
  })

  it('keeps a short history, newest first', () => {
    let log = []
    for (let i = 0; i < LOG_LENGTH + 3; i++) log = pushLog(log, {
      i
    })
    expect(log).toHaveLength(LOG_LENGTH)
    expect(log[0].i).toBe(LOG_LENGTH + 2)
  })
})
