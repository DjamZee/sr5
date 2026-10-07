import {
  describe, it, expect
} from 'vitest'

const {
  canBeConcealed, concealedState, concealedItems, concealResult, searchConcealment, searchBasePool, searchModifiers,
  searchPool, isFound, searchPlan, updateTakesOut
} = await import('../modules/rolls/roll-helpers/conceal-rules.js')

const holdout = (flag, extra = {
}) => ({
  type: 'itemWeapon', name: 'Pistolet de poche', system: {
    concealment: {
      value: -4
    }, isActive: false
  }, flags: flag ? {
    sr5: {
      concealed: flag
    }
  } : {
  }, ...extra
})

describe('the concealability in the searcher\'s pool (SR5 p. 422)', () => {
  it('looking, as the table gives it', () => {
    expect(searchConcealment(-4, 'spot')).toBe(-4)
    expect(searchConcealment(6, 'spot')).toBe(6)
  })
  it('in a pat-down, a negative one is halved and a positive one doubled', () => {
    expect(searchConcealment(-4, 'patDown')).toBe(-2)
    expect(searchConcealment(-6, 'patDown')).toBe(-3)
    expect(searchConcealment(2, 'patDown')).toBe(4)
    expect(searchConcealment(6, 'patDown')).toBe(12)
    expect(searchConcealment(0, 'patDown')).toBe(0)
  })
  it('an odd negative one is rounded towards zero, the searcher\'s way', () => {
    expect(searchConcealment(-3, 'patDown')).toBe(-1)
    expect(searchConcealment(-1, 'patDown')).toBe(0)
  })
})

describe('the searcher\'s pool', () => {
  it('the linked attribute is swapped for the one chosen', () => {
    //Perception 4 + Intuition 3 = 7, Agility 5 in a pat-down: 9
    expect(searchBasePool(7, 3, 5)).toBe(9)
    expect(searchBasePool(7, 3, 3)).toBe(7)
  })
  it('the object, the situations ticked and the GM\'s own modifier are added; never below zero', () => {
    const mods = searchModifiers(-4, 'patDown', ['attentive', 'unknown'], -1)
    expect(mods).toEqual([{
      type: 'concealment', value: -2
    }, {
      type: 'attentive', value: 3
    }, {
      type: 'other', value: -1
    }])
    expect(searchPool(9, mods)).toBe(9)
    expect(searchPool(2, searchModifiers(-6, 'spot'))).toBe(0)
  })
})

describe('the comparison of hits', () => {
  it('the searcher wins a tie, and needs at least one hit', () => {
    expect(isFound(3, 2)).toBe(true)
    expect(isFound(2, 2)).toBe(true)
    expect(isFound(1, 2)).toBe(false)
    expect(isFound(0, 0)).toBe(false)
    expect(isFound(1, 0)).toBe(true)
  })
})

describe('the hidden state', () => {
  it('reads the hits kept on the object, and nothing else', () => {
    expect(concealedState(holdout({
      hits: 3
    }))).toMatchObject({
      hits: 3
    })
    expect(concealedState(holdout(null))).toBe(null)
    expect(concealedState(holdout({
      hits: 'x'
    }))).toBe(null)
    expect(concealedState(holdout({
      hits: -1
    }))).toBe(null)
  })
  it('a critical glitch hides nothing; otherwise the hits are kept', () => {
    expect(concealResult({
      hits: 2, criticalGlitch: true
    })).toBe(null)
    expect(concealResult({
      hits: 2
    })).toEqual({
      hits: 2
    })
    expect(concealResult({
      hits: 0
    })).toEqual({
      hits: 0
    })
  })
  it('only objects with a concealability can be hidden', () => {
    expect(canBeConcealed(holdout(null))).toBe(true)
    expect(canBeConcealed({
      type: 'itemSpell', system: {
      }
    })).toBe(false)
  })
  it('a hidden weapon made ready is taken out; anything else is not', () => {
    const hidden = holdout({
      hits: 2
    })
    expect(updateTakesOut(hidden, {
      system: {
        isActive: true
      }
    })).toBe(true)
    expect(updateTakesOut(hidden, {
      'system.isActive': true
    })).toBe(true)
    expect(updateTakesOut(hidden, {
      system: {
        quantity: 2
      }
    })).toBe(false)
    expect(updateTakesOut(holdout(null), {
      system: {
        isActive: true
      }
    })).toBe(false)
    expect(updateTakesOut({
      ...hidden, type: 'itemArmor'
    }, {
      system: {
        isActive: true
      }
    })).toBe(false)
  })
})

describe('the search plan', () => {
  it('one line per hidden object, its pool worked out', () => {
    const hidden = holdout({
      hits: 2
    })
    const actor = {
      items: [hidden, holdout(null, {
        name: 'Couteau'
      })]
    }
    const items = concealedItems(actor)
    expect(items).toEqual([hidden])
    const plan = searchPlan(items, {
      base: 9, mode: 'patDown'
    })
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({
      hiddenHits: 2, pool: 7
    })
    expect(searchPlan(items, {
      base: 9, mode: 'spot'
    })[0].pool).toBe(5)
  })
})
