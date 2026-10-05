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
  startDrugCrash
} from '../modules/entities/items/drug-crash.js'

// A Roll that keeps its formula and always totals 30: "1d6 * 10" and "10d6" can both give 30, so the formula is
// what tells one die times ten from the sum of ten dice
let formulas
beforeEach(() => {
  formulas = []
  globalThis.Roll = class {
    constructor(formula){
      this.formula = formula
      formulas.push(formula)
    }
    async evaluate(){
      return {
        total: 30, formula: this.formula
      }
    }
  }
})

const actorData = (body) => ({
  attributes: {
    body: {
      augmented: {
        value: body
      }
    }
  }
})
const shots = (key, body = 4) => SR5_CharacterUtility.handleDrugShots({
  system: {
    speed: ''
  }
}, {
  value: key
}, actorData(body))

describe('drug durations rolled as the book says', () => {
  // SR5 p. 413-414: "(10 × 1D6) minutes", one die times ten (10 to 60 by tens), not the sum of ten dice
  for (const key of ['jazz', 'kamikaze', 'zen', 'nitro']) {
    it(`${key}: one die times ten minutes`, async () => {
      const stat = await shots(key)
      expect(formulas).toContain('1d6 * 10')
      expect(formulas).not.toContain('10d6')
      expect(stat.duration).toBe(30)
      expect(stat.durationType).toBe('minute')
    })
  }

  // Chrome Flesh p. 186: disorientation as long as the effect, -2 social Limit for (Body) hours
  // The sheet reads the unit of the speed from speedType: under another key, the speed showed without its unit
  for (const key of ['betameth', 'crimsonOrchid', 'forgetMeNot', 'g3', 'snuff', 'soberTime', 'woad']) {
    it(`${key}: the unit of the speed is where the sheet reads it`, async () => {
      const stat = await shots(key)
      expect(stat.speedType).toMatch(/^SR5\./)
      expect(stat).not.toHaveProperty('speedUnit')
    })
  }

  for (const [key, duration] of [['eX', 4], ['galak', 5]]) {
    it(`${key}: the disorientation lasts as the effect, the social Limit (Body) hours`, async () => {
      const stat = await shots(key, 4)
      expect(stat.duration).toBe(duration)
      expect(stat.durationContrecoup).toBe(duration)
      expect(stat.socialLimitContrecoup).toBe(4)
    })
  }
})

describe('the crash shows the social Limit duration of eX and galak', () => {
  beforeEach(() => {
    globalThis.game.i18n = {
      localize: k => k, format: (k, data) => data ? `${k} ${Object.values(data).join(' ')}` : k
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
  })

  it('adds the (Body) hours of the social Limit to the crash duration', async () => {
    const data = {
      onUse: {
        duration: '', contrecoup: ''
      }, handleShot: {
        name: 'galak', durationContrecoup: 5, durationContrecoupType: 'hour', socialLimitContrecoup: 4
      }
    }
    await startDrugCrash(data, {
      name: 'Kara'
    })
    expect(data.onUse.contrecoup).toBe('5 SR5.Hours ; SR5.DrugSocialLimitCrash 4 SR5.Hours')
  })
})
