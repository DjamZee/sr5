import {
  describe, it, expect
} from 'vitest'
import {
  computeCustomDrug, recipeErrors, drugCustomEffects, customDrugShot, DRUG_BLOCKS
} from '../modules/entities/items/drug-designer.js'

// KAMI+, the custom drug of the Megapack validated by DjamZ: base 1, block 2 level 1, block 6 level 3, block 9 level 3,
// two Speed enhancers. 1 Combat Turn, 375 ¥, 16R, addiction 12, threshold 6, crash 10S
const KAMI = {
  base: 'tank', blocks: {
    enduring: 1, momentOfTruth: 3, shockAndAwe: 3
  }, enhancers: {
    speed: 2
  }
}

// Wrecker's example, Chrome Flesh p. 195: base 2, block 2 level 3, block 9 level 2, block 4 level 2, two Speed
// enhancers. 15R, 355 ¥, addiction 12, threshold 5, 6S
const WRECKER = {
  base: 'defender', blocks: {
    enduring: 3, shockAndAwe: 2, flash: 2
  }, enhancers: {
    speed: 2
  }
}

const codes = (recipe) => recipeErrors(recipe).map(e => e.code)

describe('KAMI+ worked out from its recipe (Megapack, Chrome Flesh p. 194-196)', () => {
  const kami = computeCustomDrug(KAMI)
  it('can be made', () => expect(kami.errors).toEqual([]))
  it('1 Combat Turn, Injection, 10 × 1D6 minutes', () => {
    expect(kami.speed).toBe(1)
    expect(kami.vectors).toEqual(['injection'])
    expect(kami.durationDice).toBe(1)
  })
  it('16R, 375 ¥', () => {
    expect(kami.availability).toBe(16)
    expect(kami.legality).toBe('R')
    expect(kami.cost).toBe(375)
  })
  it('addiction 12, threshold 6', () => {
    expect(kami.addictionRating).toBe(12)
    expect(kami.addictionThreshold).toBe(6)
  })
  it('crash 10S, effects as on the Megapack item', () => {
    expect(kami.effects.crash).toBe(10)
    expect(kami.effects.attributes).toEqual({
      body: 3, willpower: 1, charisma: -2, logic: -1, intuition: 3, reaction: -1, strength: -1
    })
    expect(kami.effects.limits).toBe(-2)
    expect(kami.effects.initiativeDice).toBe(3)
    expect(kami.effects.painResistance).toBe(3)
  })
  it('the custom effects are those of the Megapack item (15 effects)', () => {
    const list = Object.values(drugCustomEffects(kami.effects))
    expect(list).toHaveLength(15)
    expect(list.find(e => e.target === 'system.attributes.body.augmented').value).toBe(3)
    expect(list.filter(e => e.category === 'characterLimits').every(e => e.value === -2)).toBe(true)
    expect(list.find(e => e.target === 'system.initiatives.physicalInit.dice').value).toBe(3)
    expect(list.filter(e => e.target.endsWith('boxReduction')).map(e => e.value)).toEqual([3, 3, 3])
    expect(list.every(e => e.phase === 'rise')).toBe(true)
  })
})

describe("Wrecker's example (Chrome Flesh p. 195)", () => {
  const w = computeCustomDrug(WRECKER)
  it('can be made', () => expect(w.errors).toEqual([]))
  it('15R, 355 ¥, addiction 12, threshold 5', () => {
    expect([w.availability, w.cost, w.addictionRating, w.addictionThreshold]).toEqual([15, 355, 12, 5])
  })
  it('the effects of the book: AGI +1, BOD +3, REA +3, STR -1, LOG -3, WIL -1, +2D6, -1 limits, 6S', () => {
    expect(w.effects.attributes).toEqual({
      agility: 1, body: 3, reaction: 3, strength: -1, logic: -3, willpower: -1
    })
    expect(w.effects.initiativeDice).toBe(2)
    expect(w.effects.limits).toBe(-1)
    expect(w.effects.crash).toBe(6)
  })
  it('without enhancers: 3 Combat Turns', () => {
    expect(computeCustomDrug({
      ...WRECKER, enhancers: {
      }
    }).speed).toBe(3)
  })
})

describe('the cost table, line by line (Chrome Flesh p. 195)', () => {
  const only = (blocks, enhancers = {
  }) => computeCustomDrug({
    base: 'warrior', blocks, enhancers
  })
  it('a base alone: 4R, 75 ¥, addiction 6, threshold 2', () => {
    const d = only({
    })
    expect([d.availability, d.cost, d.addictionRating, d.addictionThreshold]).toEqual([4, 75, 6, 2])
  })
  it('blocks 1 to 8: +1 Availability and +20 ¥ per level', () => {
    const d = only({
      brute: 3
    })
    expect([d.availability, d.cost]).toEqual([7, 135])
  })
  it('block 9: +2 and +40 ¥ per level', () => {
    const d = only({
      shockAndAwe: 2
    })
    expect([d.availability, d.cost]).toEqual([8, 155])
  })
  it('blocks 10 to 13: +2 and +30 ¥ per level', () => {
    const d = only({
      sharpMind: 2
    })
    expect([d.availability, d.cost]).toEqual([8, 135])
  })
  it('a block: addiction + (level - 1), threshold + (level - 2), minimum 0', () => {
    expect([1, 2, 3].map(l => only({
      brute: l
    })).map(d => [d.addictionRating, d.addictionThreshold])).toEqual([[6, 2], [7, 2], [8, 3]])
  })
  it('an enhancer: +1, +50 ¥, addiction +1, threshold +1', () => {
    const d = only({
    }, {
      ingestion: true
    })
    expect([d.availability, d.cost, d.addictionRating, d.addictionThreshold]).toEqual([5, 125, 7, 3])
  })
})

describe('the enhancers (Chrome Flesh p. 196)', () => {
  it('Ingestion and Inhalation add a Vector to the Injection', () => {
    expect(computeCustomDrug({
      base: 'tank', enhancers: {
        ingestion: true, inhalation: true
      }
    }).vectors).toEqual(['injection', 'ingestion', 'inhalation'])
  })
  it('three Speed enhancers: immediate', () => {
    expect(computeCustomDrug({
      base: 'tank', enhancers: {
        speed: 3
      }
    }).speed).toBe(0)
  })
  it('three Duration enhancers: 10 × 4D6 at most', () => {
    expect(computeCustomDrug({
      base: 'tank', enhancers: {
        duration: 3
      }
    }).durationDice).toBe(4)
  })
  it('no more than three of each', () => {
    expect(codes({
      base: 'tank', enhancers: {
        speed: 4
      }
    })).toContain('enhancer')
  })
})

describe('the rules of the blocks (Chrome Flesh p. 195-196)', () => {
  it('a base is needed', () => expect(codes({
    blocks: {
      brute: 1
    }
  })).toContain('noBase'))
  it('a block with a negative change is incompatible with a block that raises the same attribute', () => {
    // block 1 lowers Intuition, block 6 raises it
    const errors = recipeErrors({
      base: 'warrior', blocks: {
        brute: 1, momentOfTruth: 1
      }
    })
    expect(errors.some(e => e.code === 'incompatible' && e.block === 'brute' && e.other === 'momentOfTruth' && e.attribute === 'intuition')).toBe(true)
  })
  it('two blocks lowering the same attribute are compatible', () => {
    expect(codes({
      base: 'warrior', blocks: {
        enduring: 1, flash: 1
      }
    })).toEqual([])
  })
  it('an attribute lowered by the base: blocks raising it stop at level 2', () => {
    // base 1 lowers Charisma; block 8 raises it
    expect(codes({
      base: 'tank', blocks: {
        silverTongue: 2
      }
    })).toEqual([])
    expect(codes({
      base: 'tank', blocks: {
        silverTongue: 3
      }
    })).toContain('loweredByBase')
  })
  it('no attribute above +4, all sources together', () => {
    // base 1 (Body +2) and block 2 level 3 (Body +3): +5
    expect(codes({
      base: 'tank', blocks: {
        enduring: 3
      }
    })).toContain('attributeBonus')
    expect(codes({
      base: 'tank', blocks: {
        enduring: 2
      }
    })).toEqual([])
  })
  it('blocks 10 to 13 have two levels only', () => {
    expect(codes({
      base: 'tank', blocks: {
        speedDemon: 3
      }
    })).toContain('level')
  })
  it('the crashes of the blocks add up', () => {
    expect(computeCustomDrug({
      base: 'genius', blocks: {
        brute: 2, shockAndAwe: 1
      }
    }).effects.crash).toBe(6)
  })
  it('the qualities of level 3 are carried (Pain Sensitivity, Shaky Hands, Uncouth)', () => {
    expect(computeCustomDrug({
      base: 'genius', blocks: {
        brute: 3
      }
    }).effects.qualities).toEqual(['painSensitivity'])
    expect(DRUG_BLOCKS.strike.levels[2].quality).toBe('shakyHands')
    expect(DRUG_BLOCKS.silverTongue.levels[2].quality).toBe('uncouth')
  })
  it('the charmer base gives +1 social limit', () => {
    const effects = computeCustomDrug({
      base: 'charmer'
    }).effects
    const social = Object.values(drugCustomEffects(effects)).find(e => e.target === 'system.limits.socialLimit')
    expect(social.value).toBe(1)
  })
})

describe('the quality changes the cost (Chrome Flesh p. 194)', () => {
  it('street half, pharmaceutical double, custom six times', () => {
    expect(['street', 'standard', 'pharmaceutical', 'custom'].map(q => computeCustomDrug(KAMI, q).cost))
      .toEqual([188, 375, 750, 2250])
  })
})

describe('the stat of a dose', () => {
  it('KAMI+: 1 Combat Turn, the Duration rolled in minutes, 10S at the crash', () => {
    expect(customDrugShot(KAMI, 30)).toMatchObject({
      name: 'customDrug', speed: 1, duration: 30, durationType: 'minute', customCrash: 10
    })
  })
})
