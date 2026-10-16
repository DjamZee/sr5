import {
  describe, it, expect
} from 'vitest'
import {
  registerSpriteType, spriteInitiativeBonus
} from '../modules/entities/actors/sprite-types.js'

// What a sprite type adds to the matrix initiative score: a constant, and optionally the Level once more
// (a type whose score is (Level x 3) + x, where the book's (Level x 2) + x comes from Level + Data Processing).

describe('spriteInitiativeBonus', () => {
  it('the book types: nothing, the Generalist +1 (Kill Code p. 110)', () => {
    expect(spriteInitiativeBonus('courier', 5)).toBe(0)
    expect(spriteInitiativeBonus('generalist', 5)).toBe(1)
  })
  it('a registered type with initiativePerLevel', () => {
    registerSpriteType('tpNovaTest', {
      label: 'Nova', matrix: {
        dataProcessing: 1, initiative: 0
      }, initiativePerLevel: 1
    })
    expect(spriteInitiativeBonus('tpNovaTest', 4)).toBe(4)
    registerSpriteType('tpBadPerLevel', {
      label: 'x', initiativePerLevel: 'oops'
    })
    expect(spriteInitiativeBonus('tpBadPerLevel', 4)).toBe(0)
  })
  it('an unknown type: nothing', () => {
    expect(spriteInitiativeBonus('nope', 6)).toBe(0)
  })
})
