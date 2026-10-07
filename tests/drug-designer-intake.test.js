import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheets build on Foundry's classes
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
  globalThis.foundry.abstract.TypeDataModel.migrateData ??= (source) => source
})

import {
  SR5_CharacterUtility
} from '../modules/entities/actors/utilityActor.js'
import {
  crashDamageOf, drugHasCrashDamage
} from '../modules/entities/items/drug-damage.js'
import {
  drugCrashIsInstant, drugHasCrash, isSameDrug
} from '../modules/entities/items/drug-stat.js'
import {
  customDrugItemData, drugDesignApproved
} from '../modules/entities/items/drug-designer.js'
import {
  SR5
} from '../modules/config.js'

const KAMI = {
  base: 'tank', blocks: {
    enduring: 1, momentOfTruth: 3, shockAndAwe: 3
  }, enhancers: {
    speed: 2
  }
}
const LABELS = {
  attributes: SR5.characterAttributes, bases: SR5.drugDesignerBases, blocks: SR5.drugDesignerBlocks,
  traits: SR5.drugDesignerQualities, vectors: SR5.propagationVectors,
}
const t = k => k

let rolled
beforeEach(() => {
  rolled = []
  globalThis.Roll = class {
    constructor(formula){
      this.formula = formula
      rolled.push(formula)
    }
    async evaluate(){
      return {
        total: 30
      }
    }
  }
})

const actorData = {
  attributes: {
    body: {
      augmented: {
        value: 4
      }
    }
  }, essence: {
    value: 6
  }, addictions: []
}

describe('a designed drug made as an itemDrug: KAMI+', () => {
  const data = customDrugItemData({
    name: 'KAMI+', recipe: KAMI, t, labels: LABELS
  })
  it('the stat of the Megapack item', () => {
    expect(data.type).toBe('itemDrug')
    expect(data.system.availability.value).toBe(16)
    expect(data.system.legality).toBe('R')
    expect(data.system.price.value).toBe(375)
    expect(data.system.addiction).toEqual({
      type: 'both', rating: 12, threshold: 6
    })
    expect(data.system.vector.injection).toBe(true)
    expect(Object.values(data.system.customEffects)).toHaveLength(15)
    expect(data.system.systemEffects[0]).toEqual({
      category: 'drug', value: 'customDrug'
    })
    expect(data.system.designer.recipe.blocks).toEqual(KAMI.blocks)
  })
  it('a pharmaceutical one costs double', () => {
    expect(customDrugItemData({
      name: 'x', recipe: KAMI, quality: 'pharmaceutical', t, labels: LABELS
    }).system.price.value).toBe(750)
  })
})

describe('taking a designed drug (utilityActor.handleDrugShots)', () => {
  const item = {
    name: 'KAMI+', system: {
      designer: {
        recipe: KAMI
      }
    }
  }
  it('10 × 1D6 minutes rolled, 1 Combat Turn, 10S carried for the crash', async () => {
    const shot = await SR5_CharacterUtility.handleDrugShots(item, {
      value: 'customDrug'
    }, actorData, null)
    expect(rolled).toEqual(['1d6 * 10'])
    expect(shot).toMatchObject({
      name: 'customDrug', speed: 1, duration: 30, durationType: 'minute', customCrash: 10
    })
  })
  it('three Duration enhancers: 4D6 rolled', async () => {
    await SR5_CharacterUtility.handleDrugShots({
      name: 'x', system: {
        designer: {
          recipe: {
            base: 'tank', enhancers: {
              duration: 3
            }
          }
        }
      }
    }, {
      value: 'customDrug'
    }, actorData, null)
    expect(rolled).toEqual(['4d6 * 10'])
  })
  it('the crash: 10S unresisted, and a crash that is only damage', async () => {
    const shot = await SR5_CharacterUtility.handleDrugShots(item, {
      value: 'customDrug'
    }, actorData, null)
    expect(crashDamageOf('customDrug', shot)).toEqual({
      key: 'customDrug', value: 10, dice: undefined, resist: 'none', type: 'stun'
    })
    expect(drugHasCrashDamage('customDrug', shot)).toBe(true)
    const system = {
      handleShot: shot, customEffects: {
      }, systemEffects: {
        0: {
          category: 'drug', value: 'customDrug'
        }
      }
    }
    expect(drugHasCrash(system)).toBe(true)
    expect(drugCrashIsInstant(system)).toBe(true)
  })
  it('no block with a crash: no crash damage', () => {
    expect(crashDamageOf('customDrug', {
      customCrash: 0
    })).toBeNull()
  })
})

describe('two designed drugs are two drugs (Chrome Flesh p. 183, 197)', () => {
  const drug = name => ({
    name, system: {
      systemEffects: {
        0: {
          category: 'drug', value: 'customDrug'
        }
      }
    }
  })
  it('told apart by their name', () => {
    expect(isSameDrug(drug('KAMI+'), drug('Wrecker'))).toBe(false)
    expect(isSameDrug(drug('KAMI+'), drug('KAMI+'))).toBe(true)
  })
})

describe("the gamemaster's approval (decision of DjamZ, 07/10)", () => {
  it('pending or refused: not taken; approved or the GM\'s own: taken', () => {
    expect(drugDesignApproved({
      designer: {
        status: 'pending'
      }
    })).toBe(false)
    expect(drugDesignApproved({
      designer: {
        status: 'refused'
      }
    })).toBe(false)
    expect(drugDesignApproved({
      designer: {
        status: 'approved'
      }
    })).toBe(true)
    expect(drugDesignApproved({
      designer: {
        status: ''
      }
    })).toBe(true)
    expect(drugDesignApproved({
    })).toBe(true)
  })
  it('a player\'s drug is made pending', () => {
    expect(customDrugItemData({
      name: 'x', recipe: KAMI, status: 'pending', t, labels: LABELS
    }).system.designer.status).toBe('pending')
  })
})
