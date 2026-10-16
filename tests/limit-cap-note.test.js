import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  uncappedRating, limitBase, limitCapNote
} from '../modules/entities/actors/augmentationCap.js'

const KEYS = ['body', 'agility', 'reaction', 'strength', 'willpower', 'logic', 'intuition', 'charisma']
const LIMITS = ['astralLimit', 'mentalLimit', 'physicalLimit', 'socialLimit']
const mod = (value, type = 'cyberware', extra = {
}) => ({
  source: type, type, value, ...extra
})

let settings, formatted
beforeEach(() => {
  settings = {
    sr5AugmentationCap: 'bonus'
  }
  formatted = []
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  vi.spyOn(globalThis.game.i18n, 'format').mockImplementation((key, data) => {
    formatted.push({
      key, data
    })
    return key
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** A troll whose attributes are natural 5, Strength carrying the given augmented modifiers */
function actor({
  strength = [], charisma = []
} = {
}) {
  const attributes = {
  }
  for (const key of KEYS) attributes[key] = {
    natural: {
      base: 5, value: 0, modifiers: []
    },
    augmented: {
      base: 0, value: 0, modifiers: key === 'strength' ? strength : key === 'charisma' ? charisma : []
    },
  }
  const limits = {
  }
  for (const key of LIMITS) limits[key] = {
    base: 0, value: 0, modifiers: []
  }
  return {
    type: 'actorPc', items: [], system: {
      biography: {
        metatype: 'troll'
      }, attributes, initiatives: {
      }, limits, essence: {
        value: 6
      }
    }
  }
}
const prepare = a => {
  SR5_CharacterUtility.updateAttributes(a)
  SR5_CharacterUtility.updateLimits(a)
  return a.system.limits
}
const capLines = limit => limit.modifiers.filter(m => m.type === 'augmentationCap')

describe('help of the limits under the augmentation cap (SR5 p. 96, arbitrage de DjamZ)', () => {
  it('Strength 5 + 7 cut to 9: Physical limit kept 10, 12 without the cap', () => {
    const limits = prepare(actor({
      strength: [mod(7)]
    }))
    //kept (9 * 2 + 5 + 5) / 3 -> 10, real (12 * 2 + 5 + 5) / 3 -> 12
    expect(limits.physicalLimit.value).toBe(10)
    const lines = capLines(limits.physicalLimit)
    expect(lines).toHaveLength(1)
    expect(lines[0].value).toBe(0)
    expect(formatted.find(f => f.key === 'SR5.AugmentationCapLimitModifier').data).toEqual({
      kept: 10, uncapped: 12
    })
  })

  it('no line when the cap cut nothing', () => {
    const limits = prepare(actor({
      strength: [mod(3)]
    }))
    for (const key of LIMITS) expect(capLines(limits[key])).toHaveLength(0)
  })

  it('no line when the cut does not move the rounded limit', () => {
    //Strength 5 + 5 cut to 9: (18 + 10) / 3 -> 10 kept, (20 + 10) / 3 = 10 real
    const limits = prepare(actor({
      strength: [mod(5)]
    }))
    expect(capLines(limits.physicalLimit)).toHaveLength(0)
  })

  it('no line without a cap, and the limit reads the full rating', () => {
    settings.sr5AugmentationCap = 'none'
    const limits = prepare(actor({
      strength: [mod(7)]
    }))
    expect(limits.physicalLimit.value).toBe(12)
    expect(capLines(limits.physicalLimit)).toHaveLength(0)
  })

  it('at the augmented maximum only: Strength 5 + 10 cut to 14 (troll 10 + 4)', () => {
    settings.sr5AugmentationCap = 'augmentedMax'
    const limits = prepare(actor({
      strength: [mod(10)]
    }))
    //kept (28 + 10) / 3 -> 13, real (30 + 10) / 3 -> 14
    expect(limits.physicalLimit.value).toBe(13)
    expect(formatted.find(f => f.key === 'SR5.AugmentationCapLimitModifier').data).toEqual({
      kept: 13, uncapped: 14
    })
  })

  it('Social limit from a cut Charisma; the Astral limit gets no line', () => {
    const limits = prepare(actor({
      charisma: [mod(7, 'magic')]
    }))
    expect(capLines(limits.socialLimit)).toHaveLength(1)
    expect(capLines(limits.astralLimit)).toHaveLength(0)
    expect(capLines(limits.physicalLimit)).toHaveLength(0)
  })

  it('does not stack the line when the limits are prepared twice (after the encumbrance)', () => {
    const a = actor({
      strength: [mod(7)]
    })
    prepare(a)
    const limits = prepare(a)
    expect(capLines(limits.physicalLimit)).toHaveLength(1)
  })

  it('kept value includes the limit own modifiers', () => {
    const a = actor({
      strength: [mod(7)]
    })
    a.system.limits.physicalLimit.modifiers.push(mod(1, 'quality'))
    prepare(a)
    expect(formatted.find(f => f.key === 'SR5.AugmentationCapLimitModifier').data).toEqual({
      kept: 11, uncapped: 13
    })
  })
})

describe('calculation helpers', () => {
  it('uncappedRating adds back what the cap removed', () => {
    expect(uncappedRating({
      augmented: {
        base: 5, value: 9, modifiers: [mod(7), mod(-3, 'augmentationCap')]
      }
    })).toBe(12)
  })

  it('uncappedRating for the Physical limit leaves the pool-only boost out (SR5 p. 312)', () => {
    const strength = {
      augmented: {
        base: 5, value: 9, modifiers: [mod(4), mod(3, 'itemAdeptPower', {
          poolOnly: true
        }), mod(-3, 'augmentationCap')]
      }
    }
    expect(uncappedRating(strength, true)).toBe(9)
    expect(uncappedRating(strength)).toBe(12)
  })

  it('limitBase keeps the formulas of SR5 p. 52 and the AI of Data Trails p. 160', () => {
    const r = v => ({
      augmented: {
        value: v
      }
    })
    const attributes = {
      body: r(4), reaction: r(3), strength: r(5), logic: r(6), intuition: r(4), willpower: r(3), charisma: r(2)
    }
    const ctx = {
      attributes, essence: 6, rating: a => a.augmented.value, physical: a => a.augmented.value
    }
    expect(limitBase('physicalLimit', ctx)).toBe(6)
    expect(limitBase('mentalLimit', ctx)).toBe(7)
    expect(limitBase('socialLimit', ctx)).toBe(5)
    expect(limitBase('astralLimit', ctx)).toBe(7)
    expect(limitBase('mentalLimit', {
      ...ctx, aiDataProcessing: 9
    })).toBe(9)
    expect(limitBase('socialLimit', {
      ...ctx, aiDataProcessing: 9
    })).toBe(7)
    expect(limitBase('unknown', ctx)).toBeUndefined()
  })

  it('limitCapNote only when the uncapped base is higher', () => {
    expect(limitCapNote(10, 10, 10)).toBeNull()
    expect(limitCapNote(11, 10, 12)).toEqual({
      kept: 11, uncapped: 13
    })
  })
})
