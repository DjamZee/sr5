import {
  describe, it, expect
} from 'vitest'
import {
  spiritTypeSources
} from '../modules/rolls/roll-helpers/situational.js'

// Review P4 (Aldric): the +2 of the Oak mentor to summon spirits of plants was right, but the summoning dialog
// filed it under "Spirit type" instead of the mentor's name, alone of the five mentors measured
describe('the names of what a spirit type adds to its skill', () => {
  const skill = [
    {
      type: 'linkedAttribute', source: 'Magie', value: 5
    }, {
      type: 'skillRating', source: 'Invocation', value: 4
    }, {
      type: 'globalPenalty', source: 'Blessures', value: -1
    },
  ]

  it('names the mentor, not the modifiers every type shares', () => {
    const plants = [{
      type: 'itemMentorSpirit', source: 'Esprit mentor (Chêne) [Magicien]', value: 2
    }, ...skill]
    expect(spiritTypeSources(plants, skill)).toEqual(['Esprit mentor (Chêne) [Magicien]'])
  })

  it('names nothing for a type with no bonus of its own, nor for the markers of the boxes', () => {
    expect(spiritTypeSources(skill, skill)).toEqual([])
    expect(spiritTypeSources([{
      type: 'situational:0', source: 'Esprit mentor (Chêne) [Magicien]', value: 0
    }, ...skill], skill)).toEqual([])
  })
})
