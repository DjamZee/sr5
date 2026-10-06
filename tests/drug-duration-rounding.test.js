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
  distinctDrugs, isSameDrug
} from '../modules/entities/items/drug-stat.js'

let die = 4
beforeEach(() => {
  globalThis.Roll = class {
    constructor(formula){
      this.formula = formula
    }
    async evaluate(){
      return {
        total: die, formula: this.formula
      }
    }
  }
})

const take = (key, essence) => SR5_CharacterUtility.handleDrugShots({
  name: key, system: {
    speed: ''
  }
}, {
  value: key
}, {
  attributes: {
    body: {
      augmented: {
        value: 4
      }
    }
  },
  essence: {
    value: essence
  },
  addictions: [],
}, null, [])

// Chrome Flesh p. 191-193, "ESS + 1D6 heures, maximum 12 heures"; SR5 p. 49, round up unless a rule says otherwise
describe('ESS + 1D6 hours: whole hours, rounded up', () => {
  for (const key of ["animalTongue", "immortalFlower", "littleSmoke", "rockLizardBlood", "shade", "wuduAku", "zombieDust"]) {
    it(`${key}: Essence 5.9 (a datajack) and a 4 give 10 hours, not 9.9`, async () => {
      die = 4
      expect((await take(key, 5.9)).duration).toBe(10)
    })
  }
  it('an Essence stored as 5.000000001 is still 5: 9 hours', async () => {
    die = 4
    expect((await take("shade", 6 - 0.2 - 0.8 + 1e-9)).duration).toBe(9)
  })
  it('the cap of 12 hours holds', async () => {
    die = 6
    expect((await take("shade", 6)).duration).toBe(12)
  })
})

const drug = (name, key, quality = "standard") => ({
  name, system: {
    quality, systemEffects: {
      0: {
        category: "drug", value: key
      }
    }
  }
})

// Chrome Flesh p. 183: an interaction comes from a drug taken under the effect of ANOTHER one
describe('isSameDrug: two copies of a drug are not a mix', () => {
  it('two Jazz, whatever their quality', () => {
    expect(isSameDrug(drug("Jazz", "jazz"), drug("Jazz", "jazz", "street"))).toBe(true)
  })
  it('Jazz and Cram are two drugs', () => {
    expect(isSameDrug(drug("Jazz", "jazz"), drug("Cram", "cram"))).toBe(false)
  })
  it('two custom drugs on the same base but named apart are two drugs (Chrome Flesh p. 194)', () => {
    expect(isSameDrug(drug("Jazz de Zoé", "jazz", "custom"), drug("Jazz de Max", "jazz", "custom"))).toBe(false)
    expect(isSameDrug(drug("Jazz de Zoé", "jazz", "custom"), drug("Jazz de Zoé", "jazz", "custom"))).toBe(true)
  })
  // Chrome Flesh p. 196, "1D6 pour chaque drogue en plus de la première"
  it('distinctDrugs counts two Jazz under effect once, a third drug apart', () => {
    const mix = [drug("Jazz", "jazz"), drug("Jazz", "jazz", "street"), drug("Langue animale", "animalTongue")]
    expect(distinctDrugs(mix).map(d => d.name)).toEqual(["Jazz", "Langue animale"])
  })
  it('a drug without key is never the same as another', () => {
    expect(isSameDrug({
      name: "X", system: {
      }
    }, {
      name: "X", system: {
      }
    })).toBe(false)
  })
})
