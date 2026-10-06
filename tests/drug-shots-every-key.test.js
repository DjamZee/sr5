import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

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

// A Roll that behaves like Foundry's: a second evaluate() throws (Pixie Dust rolled the same die twice, M7 D2)
beforeEach(() => {
  globalThis.Roll = class {
    constructor(formula){
      this.formula = formula
    }
    async evaluate(){
      if (this._evaluated) throw new Error('The Roll has already been evaluated and is now immutable')
      this._evaluated = true
      return {
        total: 3, formula: this.formula
      }
    }
  }
})

// Every drug key the switch knows, read off the source: a key added later is tested without touching this file
const source = readFileSync(new URL('../modules/entities/actors/utilityActor.js', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('static async handleDrugShots('))
const keys = [...body.slice(0, body.indexOf('Unknown \'')).matchAll(/^\s*case "([^"]+)":/gm)].map(m => m[1])

const actorData = (addictions) => ({
  attributes: {
    body: {
      augmented: {
        value: 4
      }
    }
  },
  essence: {
    value: 6
  },
  addictions,
})
const drug = (name) => ({
  name, system: {
    speed: ''
  }
})
// The sheet's working list: the dose being taken is already counted there, not yet in the prepared system
const dose = (name, shots) => ({
  name, shot: {
    value: shots
  }
})

describe('every drug the system knows can be taken', () => {
  it('reads the keys off the switch', () => {
    expect(keys.length).toBeGreaterThan(50)
    expect(keys).toContain('pixieDust')
    expect(keys).toContain('soothsayer')
  })

  for (const key of keys) {
    it(`${key}: taken without error, with a stat`, async () => {
      const stat = await SR5_CharacterUtility.handleDrugShots(drug(key), {
        value: key
      }, actorData([]), null, [dose(key, 1)])
      expect(stat?.name).toBe(key)
    })
  }
})

describe('Soothsayer (Chrome Flesh p. 186): 8S, each further application lowers the DV by 1', () => {
  const take = (prepared, working) => SR5_CharacterUtility.handleDrugShots(drug('Devineresse'), {
    value: 'soothsayer'
  }, actorData(prepared), null, working)

  // M7 D1: the prepared system does not hold the first dose yet, the sheet's list does
  it('first dose: the prepared list is empty, DV 8', async () => {
    expect((await take([], [dose('Devineresse', 1)])).resistedStunDamage).toBe(8)
  })
  it('third dose: DV 6, from the working list and not the stale prepared one', async () => {
    expect((await take([dose('Devineresse', 2)], [dose('Devineresse', 3)])).resistedStunDamage).toBe(6)
  })
  it('never below 0', async () => {
    expect((await take([], [dose('Devineresse', 12)])).resistedStunDamage).toBe(0)
  })
})

describe('Pixie Dust (Chrome Flesh p. 191): two separate dice', () => {
  it('duration and memory loss each rolled once', async () => {
    const stat = await SR5_CharacterUtility.handleDrugShots(drug('Poussière de fée'), {
      value: 'pixieDust'
    }, actorData([]))
    expect(stat.duration).toBe(3)
    expect(stat.effectDuration).toBe(3)
  })
})
