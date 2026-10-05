import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

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
  applyDrugQuality, scaleDuration, warnDrugWithoutStat, drugAddictionThreshold, drugInteractionModifier, drugHasCrash
} from '../modules/entities/items/drug-stat.js'
import {
  startDrugCrash
} from '../modules/entities/items/drug-crash.js'
import {
  SR5
} from '../modules/config.js'

beforeEach(() => {
  globalThis.Roll = class {
    async evaluate(){
      return {
        total: 30
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
const shots = (key, quality, body = 4) => SR5_CharacterUtility.handleDrugShots({
  system: {
    speed: '', quality
  }
}, {
  value: key
}, actorData(body))

// Chrome Flesh p. 194: street x2, pharmaceutical 1/2, custom 1/4, standard unchanged
describe('the quality of a drug changes its crash duration', () => {
  it('jazz crash: 30 minutes standard, 60 street, 15 pharmaceutical', async () => {
    expect((await shots('jazz', 'standard')).durationContrecoup).toBe(30)
    expect((await shots('jazz', 'street')).durationContrecoup).toBe(60)
    expect((await shots('jazz', 'pharmaceutical')).durationContrecoup).toBe(15)
  })

  it('the effect itself is left alone', async () => {
    expect((await shots('jazz', 'custom')).duration).toBe(30)
  })

  it('a fraction goes down to the smaller unit', async () => {
    // novacoke, Body 4: 6 hours of crash; custom 1.5 hours = 90 minutes
    const stat = await shots('novacoke', 'custom')
    expect(stat.durationContrecoup).toBe(90)
    expect(stat.durationContrecoupType).toBe('minute')
  })

  it('a drug without quality (old data) keeps the book crash', async () => {
    expect((await shots('jazz', undefined)).durationContrecoup).toBe(30)
  })

  it('a drug without crash is left without crash', () => {
    const shot = {
      duration: 2, durationType: 'hour'
    }
    applyDrugQuality(shot, 'street')
    expect(shot).not.toHaveProperty('durationContrecoup')
  })

  it('under a Combat Turn, rounded, one at least', () => {
    expect(scaleDuration(1, 'combatTurn', 0.25)).toEqual({
      value: 1, unit: 'combatTurn'
    })
    expect(scaleDuration(1, 'day', 0.25)).toEqual({
      value: 6, unit: 'hour'
    })
  })

  it('the qualities are listed in the book order', () => {
    expect(Object.keys(SR5.drugQualities)).toEqual(['street', 'standard', 'pharmaceutical', 'custom'])
  })
})

describe('the keys read in the book', () => {
  it('psychochip: 48 hours, no crash (Chrome Flesh p. 194)', async () => {
    const stat = await shots('psychochip', 'standard')
    expect(stat).toMatchObject({
      duration: 48, durationType: 'hour'
    })
    expect(stat).not.toHaveProperty('durationContrecoup')
  })
  it('cryo: (30 - Body) minutes (Bullets & Bandages p. 19)', async () => {
    expect(await shots('cryo', 'standard', 5)).toMatchObject({
      duration: 25, durationType: 'minute'
    })
  })
  it('hemoSynth: (Body) Combat Turns (Bullets & Bandages p. 19)', async () => {
    expect(await shots('hemoSynth', 'standard', 5)).toMatchObject({
      duration: 5, durationType: 'combatTurn'
    })
  })
  it('nanoScan: 24 hours (Bullets & Bandages p. 19)', async () => {
    expect(await shots('nanoScan')).toMatchObject({
      duration: 24, durationType: 'hour'
    })
  })
  for (const key of ['neostigmine', 'ondansetron']) {
    it(`${key}: 1D6 x 10 minutes (Bullets & Bandages p. 20)`, async () => {
      expect(await shots(key)).toMatchObject({
        duration: 30, durationType: 'minute'
      })
    })
  }
  it('every new key has its label', () => {
    for (const key of ['psychochip', 'cryo', 'hemoSynth', 'nanoScan', 'neostigmine', 'ondansetron']) expect(SR5.drugs[key]).toBeTruthy()
  })
  it('an unknown key gives no stat', async () => {
    expect(await shots('kamiPlus')).toBeUndefined()
  })
})

describe('the other rules of the quality (Chrome Flesh p. 194; interaction table p. 197)', () => {
  it('pharmaceutical: addiction threshold -1, never below 0', () => {
    expect(drugAddictionThreshold({
      quality: 'pharmaceutical', addiction: {
        threshold: 3
      }
    })).toBe(2)
    expect(drugAddictionThreshold({
      quality: 'pharmaceutical', addiction: {
        threshold: 0
      }
    })).toBe(0)
    expect(drugAddictionThreshold({
      quality: 'street', addiction: {
        threshold: 3
      }
    })).toBe(3)
  })
  it('interaction: +1 for each street drug, -1 when all are custom', () => {
    expect(drugInteractionModifier(['street', 'street', 'standard'])).toBe(2)
    expect(drugInteractionModifier(['custom', 'custom'])).toBe(-1)
    expect(drugInteractionModifier(['custom', 'standard'])).toBe(0)
    expect(drugInteractionModifier(['custom', 'street'])).toBe(1)
  })
  it('galak street: the -2 social Limit lasts twice its (Body) hours', async () => {
    const stat = await shots('galak', 'street', 3)
    expect(stat.socialLimitContrecoup).toBe(6)
    expect(stat.socialLimitContrecoupType).toBe('hour')
  })
  it('eX custom: (Body) 2 hours / 4 = 30 minutes', async () => {
    const stat = await shots('eX', 'custom', 2)
    expect(stat.socialLimitContrecoup).toBe(30)
    expect(stat.socialLimitContrecoupType).toBe('minute')
  })
})

describe('a drug without crash is over when its effect ends', () => {
  beforeEach(() => {
    globalThis.game.i18n = {
      localize: k => k, format: k => k
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
  })
  const data = (handleShot, customEffects = {
  }) => ({
    isActive: true, phase: 'rise', wirelessTurnedOn: false, interact: true, handleShot, customEffects, onUse: {
      duration: '48 h', contrecoup: ''
    }
  })
  it('psychochip: back to not taken', async () => {
    const d = data({
      name: 'psychochip', duration: 48, durationType: 'hour'
    })
    await startDrugCrash(d, {
      name: 'Yara'
    })
    expect(d).toMatchObject({
      phase: '', isActive: false, wirelessTurnedOn: false, interact: false
    })
  })
  it('a crash effect without duration still goes to the crash', async () => {
    const d = data({
      name: 'bliss', duration: 2, durationType: 'hour'
    }, {
      0: {
        phase: 'crash'
      }
    })
    await startDrugCrash(d, {
      name: 'Yara'
    })
    expect(d.phase).toBe('crash')
  })
  it('a crash duration goes to the crash', () => {
    expect(drugHasCrash({
      handleShot: {
        durationContrecoup: 30
      }
    })).toBe(true)
    expect(drugHasCrash({
      handleShot: {
      }
    })).toBe(false)
  })
})

describe('a drug taken without stat warns the GM', () => {
  it('a whisper to the GM and a notification', async () => {
    const create = vi.fn()
    const warn = vi.fn()
    globalThis.game.i18n = {
      format: (k, d) => `${k} ${d.actor} ${d.drug}`
    }
    globalThis.ui = {
      notifications: {
        warn
      }
    }
    globalThis.ChatMessage = {
      create, getWhisperRecipients: () => [{
        id: 'gm1'
      }]
    }
    await warnDrugWithoutStat({
      name: 'Yara'
    }, {
      name: 'Jazz'
    })
    expect(warn).toHaveBeenCalledWith('SR5.WARN_DrugWithoutStat Yara Jazz')
    expect(create.mock.calls[0][0].whisper).toEqual(['gm1'])
  })
})
