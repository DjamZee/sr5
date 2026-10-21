import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'
import {
  BOOK_CONVERGENCE, thresholdOf, isWantedByGod, convergenceThreshold, crossesConvergence, convergenceStillDue, noticeLines
} from '../modules/system/convergence-threshold.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const quality = (name, isActive = true) => ({
  type: 'itemQuality', name, system: {
    isActive
  }
})

// Pack 5 of DjamZ, § 3: the threshold of the convergence, a world setting whose default is the book's (SR5 p. 233)
describe('the convergence threshold', () => {
  it('is 40 by the book; a bad setting falls back to it', () => {
    expect(BOOK_CONVERGENCE).toBe(40)
    expect(thresholdOf(30)).toBe(30)
    expect(thresholdOf('55')).toBe(55)
    for (const bad of [0, -5, 'x', null, undefined, NaN]) expect(thresholdOf(bad)).toBe(40)
  })

  it('Wanted by GOD lowers it by 10, 30 by the book (Data Trails p. 53), never under 1', () => {
    const wanted = {
      items: [quality('Recherché par DIEU')]
    }
    expect(convergenceThreshold(wanted, 40)).toBe(30)
    expect(convergenceThreshold(wanted, 60)).toBe(50)
    expect(convergenceThreshold(wanted, 5)).toBe(1)
    expect(convergenceThreshold({
      items: []
    }, 40)).toBe(40)
    expect(isWantedByGod(quality('Wanted by GOD'))).toBe(true)
    expect(isWantedByGod(quality('Recherche par le Dieu'))).toBe(true)
    expect(isWantedByGod(quality('Recherché par DIEU', false))).toBe(false)
    expect(isWantedByGod({
      type: 'itemGear', name: 'Wanted by GOD'
    })).toBe(false)
  })

  it('is crossed once, by a rise from under it to it or over', () => {
    expect(crossesConvergence(38, 40, 40)).toBe(true)
    expect(crossesConvergence(12, 47, 40)).toBe(true)
    expect(crossesConvergence(40, 45, 40)).toBe(false)
    expect(crossesConvergence(20, 39, 40)).toBe(false)
    expect(crossesConvergence(25, 30, 30)).toBe(true)
    expect(crossesConvergence(45, 0, 40)).toBe(false)
  })
})

describe('the button « Appliquer la convergence »', () => {
  it('applies only while still due: connected, at the threshold, in the same place', () => {
    expect(convergenceStillDue({
      score: 41, threshold: 40
    }).ok).toBe(true)
    expect(convergenceStillDue({
      score: 0, threshold: 40
    }).reason).toBe('below')
    expect(convergenceStillDue({
      score: 41, threshold: 40, connected: false
    }).reason).toBe('offline')
    expect(convergenceStillDue({
      score: 41, threshold: 40, hostThen: 'Actor.h', hostNow: null
    }).reason).toBe('moved')
  })

  it('a critical glitch of Redefine Ownership converges whatever the score (DT p. 161)', () => {
    expect(convergenceStillDue({
      score: 3, threshold: 40, forced: true
    }).ok).toBe(true)
    expect(convergenceStillDue({
      score: 3, threshold: 40, forced: true, connected: false
    }).ok).toBe(false)
  })

  it('the card says what happens and reminds what stays the GM\'s', () => {
    const keys = o => noticeLines(o).map(([k]) => k)
    expect(keys({
      name: 'X', score: 41, threshold: 40
    })).toEqual(['SR5.ConvergenceNoticeReached', 'SR5.ConvergenceNoticeGrid', 'SR5.ConvergenceNoticeSecurity'])
    expect(keys({
      name: 'X', score: 41, threshold: 40, host: 'H'
    })).toEqual(['SR5.ConvergenceNoticeReached', 'SR5.ConvergenceNoticeHost'])
    expect(keys({
      name: 'X', forced: true, stealth: true, wanted: true, ai: true
    })).toEqual(['SR5.ConvergenceNoticeForced', 'SR5.ConvergenceNoticeGrid', 'SR5.MatrixConvergenceStealth', 'SR5.ConvergenceNoticeWanted', 'SR5.ConvergenceNoticeAI'])
    expect(keys({
      name: 'S', score: 40, threshold: 40, sprite: true
    })).toEqual(['SR5.ConvergenceNoticeReached', 'SR5.MatrixConvergenceSprite', 'SR5.ConvergenceNoticeSecurity'])
  })

  it('every key is in both languages, with its placeholders', () => {
    const keys = ['SR5.ConvergenceNoticeReached', 'SR5.ConvergenceNoticeForced', 'SR5.ConvergenceNoticeGrid', 'SR5.ConvergenceNoticeHost',
      'SR5.ConvergenceNoticeSecurity', 'SR5.ConvergenceNoticeWanted', 'SR5.ConvergenceNoticeAI', 'SR5.ConvergenceApply', 'SR5.ConvergenceApplied',
      'SR5.ConvergenceRefused_offline', 'SR5.ConvergenceRefused_below', 'SR5.ConvergenceRefused_moved',
      'SR5.SETTINGS_ConvergenceThreshold_T', 'SR5.SETTINGS_ConvergenceThreshold_D']
    for (const lang of ['fr', 'en']) {
      const dict = JSON.parse(read(`../lang/${lang}.json`))
      for (const key of keys) expect(dict[key], `${lang} ${key}`).toBeTruthy()
      expect(dict['SR5.ConvergenceNoticeReached']).toMatch(/\{name\}.*\{score\}.*\{threshold\}/)
    }
  })
})

describe('wiring', () => {
  it('the world setting defaults to the book\'s 40 and sits in the Matrix tab', () => {
    expect(read('../modules/system/utilitySystem.js')).toMatch(/register\("sr5", "sr5ConvergenceThreshold", \{[^}]*scope: "world"[^}]*default: 40/)
    expect(read('../modules/system/settings-catalog.js')).toContain('sr5ConvergenceThreshold: ["matrix"]')
  })

  it('the system stays silent while the module Matrice tells it, and leaving a host reads the threshold', () => {
    const source = read('../modules/system/convergence-threshold.js')
    expect(source).toContain('matriceActive()) return')
    expect(read('../modules/system/matrix-host-presence.js')).toContain('>= convergenceThreshold(actor)')
    expect(read('../modules/system/matrix-api.js')).toContain('convergenceThreshold: persona => convergenceThreshold(persona)')
    expect(read('../modules/sr5.js')).toContain('registerConvergenceWatch()')
  })
})
