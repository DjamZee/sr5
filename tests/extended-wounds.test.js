import {
  describe, it, expect
} from 'vitest'
import {
  refreshWoundModifiers
} from '../modules/rolls/roll-helpers/extended-wounds.js'

const pen = (condition = 0, special = 0, magic = 0, matrix = 0) => ({
  condition: {
    actual: {
      value: condition
    }
  }, special: {
    actual: {
      value: special
    }
  }, magic: {
    actual: {
      value: magic
    }
  }, matrix: {
    actual: {
      value: matrix
    }
  },
})

// Lot 37b: each roll of an extended test is made with the wounds of its time (SR5 p. 50 and 171)
describe('the wound modifiers of the next roll of an extended test', () => {
  it('take the wounds of the sheet now, from the skill', () => {
    const before = [{
      type: 'tools', label: 'Outils', value: 1
    }, {
      type: 'penaltycondition', label: 'Blessures', value: -1
    }]
    const sheet = [{
      type: 'skillRating', source: 'Compétence', value: 4
    }, {
      type: 'penaltycondition', source: 'Blessures', value: -3
    }]
    const after = refreshWoundModifiers(before, pen(-3), {
      sheetModifiers: sheet
    })
    expect(after).toEqual([{
      type: 'tools', label: 'Outils', value: 1
    }, {
      type: 'penaltycondition', label: 'Blessures', value: -3
    }])
  })

  it('appear when the character was unhurt at the first roll', () => {
    const after = refreshWoundModifiers([], pen(-2), {
      sheetModifiers: [{
        type: 'penaltycondition', source: 'Blessures', value: -2
      }]
    })
    expect(after.reduce((t, m) => t + m.value, 0)).toBe(-2)
  })

  it('go when the character was healed in between', () => {
    const after = refreshWoundModifiers([{
      type: 'penaltycondition', label: 'Blessures', value: -2
    }], pen(0), {
      sheetModifiers: []
    })
    expect(after).toEqual([])
  })

  it('without a skill, read again the wound types the first roll had, and only them', () => {
    const after = refreshWoundModifiers([{
      type: 'penaltycondition', label: 'Blessures', value: -1
    }, {
      type: 'parts', label: 'Pièces', value: -2
    }], pen(-2, 0, -4))
    expect(after).toEqual([{
      type: 'parts', label: 'Pièces', value: -2
    }, {
      type: 'penaltycondition', label: 'Blessures', value: -2
    }])
  })

  it('a test that had no wound modifier (natural healing) stays without', () => {
    expect(refreshWoundModifiers([{
      type: 'healing', label: 'Soins', value: 2
    }], pen(-3))).toEqual([{
      type: 'healing', label: 'Soins', value: 2
    }])
  })

  it('the box of the dialog is worked out again', () => {
    expect(refreshWoundModifiers([{
      type: 'penalty', label: 'Malus', value: -1
    }], pen(-2, -1))).toEqual([{
      type: 'penalty', label: 'Malus', value: -3
    }])
  })
})
