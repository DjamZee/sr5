import {
  describe, it, expect
} from 'vitest'
import {
  socialTraitsOf, traitAttribute, ignoredNegative
} from '../modules/system/social-traits.js'
import {
  prepareSkillAttribute
} from '../modules/rolls/roll-helpers/skillAttribute.js'

// Cutting Aces p. 150 (VF)
const trait = value => ({
  system: {
    isActive: true, systemEffects: [{
      category: 'specialCase', value
    }]
  }
})

describe('the social traits carried as system effects', () => {
  it('reads the keys of the active items only', () => {
    const off = trait('influenceLogic')
    off.system.isActive = false
    const keys = socialTraitsOf([trait('etiquetteIntuition'), off, {
      system: {
      }
    }])
    expect([...keys]).toEqual(['etiquetteIntuition'])
  })

  it('offers Intuition for Etiquette and Logic for Negotiation, only when higher than Charisma', () => {
    const values = {
      charisma: 3, intuition: 5, logic: 4
    }
    const valueOf = k => values[k]
    expect(traitAttribute('etiquette', new Set(['etiquetteIntuition']), valueOf)).toBe('intuition')
    expect(traitAttribute('negotiation', new Set(['influenceLogic']), valueOf)).toBe('logic')
    expect(traitAttribute('con', new Set(['influenceLogic']), valueOf)).toBe(null)
    expect(traitAttribute('negotiation', new Set(['influenceLogic']), k => ({
      charisma: 6, logic: 4
    })[k])).toBe(null)
  })

  it('gives back the negative social modifiers, 2 points at most, never a maneuver', () => {
    expect(ignoredNegative([{
      type: 'socialAttitude', value: -3
    }, {
      type: 'socialEvidence', value: 2
    }])).toBe(2)
    expect(ignoredNegative([{
      type: 'socialBadLook', value: -1
    }, {
      type: 'socialManeuver', value: -4
    }, {
      type: 'penaltyPhysical', value: -2
    }])).toBe(1)
    expect(ignoredNegative([])).toBe(0)
  })

  it('counts the others\' effects on the test too: a target\'s Cynical, a subliminal area (lot 42)', () => {
    expect(ignoredNegative([{
      type: 'indirect_dicePool_0', value: -1
    }])).toBe(1)
    expect(ignoredNegative([{
      type: 'indirect_dicePool_0', value: -1
    }, {
      type: 'indirect_dicePool_1', value: -2
    }])).toBe(2)
    // A bonus from another actor is not a penalty
    expect(ignoredNegative([{
      type: 'indirect_dicePool_0', value: 1
    }])).toBe(0)
  })
})

describe('the attribute a trait preselects, SR5 p. 130', () => {
  const actorData = {
    attributes: {
      charisma: {
        augmented: {
          value: 3
        }
      }, intuition: {
        augmented: {
          value: 5
        }
      }
    }
  }
  const labels = {
    charisma: 'Charisme', intuition: 'Intuition'
  }
  const base = () => ({
    dicePool: {
      composition: [{
        type: 'linkedAttribute', source: 'Charisme', value: 3
      }, {
        type: 'skillRating', source: 'Étiquette', value: 4
      }]
    }, test: {
      title: ''
    }
  })

  it('takes the preferred attribute when none is kept, without ticking « keep »', () => {
    const r = prepareSkillAttribute(base(), actorData, undefined, {
      flagKey: 'etiquette', linked: 'charisma', titleBase: 'Étiquette', labels, localize: k => k, preferred: 'intuition'
    })
    expect(r.skillAttribute.selected).toBe('intuition')
    expect(r.skillAttribute.keep).toBe(false)
    expect(r.dicePool.base).toBe(9)
  })

  it('lets the attribute kept by the player win', () => {
    const r = prepareSkillAttribute(base(), actorData, 'charisma', {
      flagKey: 'etiquette', linked: 'charisma', titleBase: 'Étiquette', labels, localize: k => k, preferred: 'intuition'
    })
    expect(r.skillAttribute.selected).toBe('charisma')
  })
})
