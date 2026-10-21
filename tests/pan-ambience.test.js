import {
  describe, it, expect, beforeEach, afterEach
} from 'vitest'
import {
  ambienceRank, currentAmbience, deployScale, effectiveAmbience, PAN_AMBIENCE_LEVELS, pulsePhase, pulsePoint,
  crownHasDevice, rainCrownIds, registerPanAmbienceSettings
} from '../modules/canvas/pan-crown/pan-ambience.js'

// The ambiences of the PAN crowns (couronne du PAN, lot 9; decision 7 of DjamZ, 07/10)

describe('the effective level of ambience', () => {
  it('is the lower of the client and the ceiling of the gamemaster', () => {
    for (const client of PAN_AMBIENCE_LEVELS){
      for (const cap of PAN_AMBIENCE_LEVELS){
        const expected = PAN_AMBIENCE_LEVELS[Math.min(ambienceRank(client), ambienceRank(cap))]
        expect(effectiveAmbience({
          client, cap
        })).toBe(expected)
      }
    }
    expect(effectiveAmbience({
      client: 'spectacular', cap: 'sober'
    })).toBe('sober')
    expect(effectiveAmbience({
      client: 'sober', cap: 'spectacular'
    })).toBe('sober')
  })

  it('is forced to Static by reduced motion or by the low performance mode, whatever the ceiling', () => {
    expect(effectiveAmbience({
      client: 'spectacular', cap: 'spectacular', reducedMotion: true
    })).toBe('static')
    expect(effectiveAmbience({
      client: 'sober', cap: 'spectacular', lowPerformance: true
    })).toBe('static')
  })

  it('reads an unknown level as Static', () => {
    expect(ambienceRank('neon')).toBe(0)
    expect(effectiveAmbience({
      client: 'neon', cap: 'spectacular'
    })).toBe('static')
    expect(effectiveAmbience({
      client: 'spectacular', cap: undefined
    })).toBe('spectacular')
  })
})

describe('the settings of the ambiences', () => {
  let registered, values, media
  beforeEach(() => {
    registered = {
    }
    values = {
    }
    media = false
    globalThis.game = {
      settings: {
        register: (scope, key, data) => registered[key] = data,
        get: (scope, key) => {
          if (!(key in values)) throw new Error('not registered')
          return values[key]
        },
      }
    }
    globalThis.Hooks = {
      on: () => {
      }
    }
    globalThis.matchMedia = () => ({
      matches: media, addEventListener: () => {
      }
    })
  })
  afterEach(() => {
    delete globalThis.game
    delete globalThis.Hooks
    delete globalThis.matchMedia
    delete globalThis.canvas
  })

  it('Sober for each user, Spectacular as the ceiling of the world, by default', () => {
    registerPanAmbienceSettings()
    expect(registered.panCrownAmbience.scope).toBe('client')
    expect(registered.panCrownAmbience.default).toBe('sober')
    expect(registered.panCrownAmbienceCap.scope).toBe('world')
    expect(registered.panCrownAmbienceCap.default).toBe('spectacular')
    expect(Object.keys(registered.panCrownAmbience.choices)).toEqual(PAN_AMBIENCE_LEVELS)
    expect(Object.keys(registered.panCrownAmbienceCap.choices)).toEqual(PAN_AMBIENCE_LEVELS)
  })

  it('reads the settings, the reduced motion and the performance mode of Foundry', () => {
    values = {
      panCrownAmbience: 'spectacular', panCrownAmbienceCap: 'sober'
    }
    expect(currentAmbience()).toBe('sober')
    values.panCrownAmbienceCap = 'spectacular'
    expect(currentAmbience()).toBe('spectacular')
    media = true
    expect(currentAmbience()).toBe('static')
    media = false
    globalThis.canvas = {
      performance: {
        mode: 0
      }
    }
    expect(currentAmbience()).toBe('static')
    globalThis.canvas.performance.mode = 1
    expect(currentAmbience()).toBe('spectacular')
  })

  it('falls back on the defaults before the settings exist', () => {
    expect(currentAmbience()).toBe('sober')
  })
})

describe('the animations', () => {
  it('unfold the crown from its token in half a second, with a spring', () => {
    expect(deployScale(0)).toBeCloseTo(0)
    expect(Math.max(...[100, 200, 300, 400].map(t => deployScale(t)))).toBeGreaterThan(1)
    expect(deployScale(500)).toBe(1)
    expect(deployScale(5000)).toBe(1)
  })

  it('run a pulse along its line, at the same place when the crown is drawn again', () => {
    const from = {
        x: 0, y: 0
      }, to = {
        x: 100, y: 50
      }
    expect(pulsePoint(from, to, 0, 0)).toEqual({
      x: 0, y: 0
    })
    expect(pulsePoint(from, to, 700, 0)).toEqual({
      x: 50, y: 25
    })
    expect(pulsePoint(from, to, 1234, pulsePhase(3))).toEqual(pulsePoint(from, to, 1234, pulsePhase(3)))
    expect(pulsePhase(1)).not.toBe(pulsePhase(2))
  })
})

describe('the rain of code', () => {
  it('falls on the crowns opened one by one, never on the AR view nor "always visible"', () => {
    const shown = new Set(['a', 'b', 'c'])
    expect(rainCrownIds({
      shown, manual: new Set(['a', 'z']), hovered: 'b'
    })).toEqual(new Set(['a', 'b']))
    expect(rainCrownIds({
      shown, manual: new Set(), hovered: null
    })).toEqual(new Set())
  })

  it('never falls on an actor without a device (pack 5)', () => {
    expect(crownHasDevice({
      master: null, nodes: [] 
    })).toBe(false)
    expect(crownHasDevice({
      master: null, nodes: [{
        kind: 'file' 
      }] 
    })).toBe(false)
    expect(crownHasDevice(null)).toBe(false)
    expect(crownHasDevice({
      master: {
        uuid: 'x' 
      }, nodes: [] 
    })).toBe(true)
    expect(crownHasDevice({
      master: null, nodes: [{
        kind: 'device' 
      }] 
    })).toBe(true)
    expect(crownHasDevice({
      master: null, rigger: {
        actorId: 'r' 
      }, nodes: [] 
    })).toBe(true)
  })
})
