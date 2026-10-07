import {
  describe, it, expect
} from 'vitest'

const {
  SR5_PrepareRollHelper, capNoteOnly
} = await import('../modules/rolls/roll-prepare-helpers.js')

// The augmentation cap's help line on a limit (or an attribute of unknown metatype) is worth 0: the sheet keeps it,
// a roll and its card show only a cap that cuts something (Fleur's review)
const note = {
  source: 'Plafond : 9 sans plafond', type: 'augmentationCap', value: 0
}
const cut = {
  source: 'Plafond', type: 'augmentationCap', value: -2
}
const quality = {
  source: 'Qualité', type: 'quality', value: 1
}

describe('the augmentation cap in a roll', () => {
  it('a line worth 0 is left out of the limit and of the dice pool', () => {
    const rollData = {
      limit: {
        modifiers: {
        }
      }, dicePool: {
        modifiers: []
      }
    }
    expect(Object.values(SR5_PrepareRollHelper.getLimitModifiers(rollData, [note, quality])).map(m => m.label)).toEqual(['Qualité'])
    expect(SR5_PrepareRollHelper.getDicepoolModifiers(rollData, [note, quality]).map(m => m.label)).toEqual(['Qualité'])
  })

  it('a cap that cuts something stays', () => {
    expect(capNoteOnly(cut)).toBe(false)
    expect(capNoteOnly(note)).toBe(true)
    const rollData = {
      limit: {
        modifiers: {
        }
      }
    }
    expect(SR5_PrepareRollHelper.getLimitModifiers(rollData, [cut]).augmentationCap.value).toBe(-2)
  })
})
