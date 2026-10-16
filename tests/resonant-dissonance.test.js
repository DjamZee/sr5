import {
  describe, it, expect
} from 'vitest'
import {
  hasResonantDissonance
} from '../modules/entities/actors/technomancer-streams.js'

// Écho Dissonance résonante (Better Than Bad p. 145)
const echo = (name, systemEffects = []) => ({
  type: 'itemEcho', name, system: {
    systemEffects
  }
})

describe('the echo Dissonance résonante', () => {
  it('found by its name, VF or VO, or by its system effect', () => {
    expect(hasResonantDissonance({
      items: [echo('Dissonance résonante')]
    })).toBe(true)
    expect(hasResonantDissonance({
      items: [echo('Resonant Dissonance')]
    })).toBe(true)
    expect(hasResonantDissonance({
      items: [echo('Écho maison', [{
        category: 'specialCase', value: 'echoResonantDissonance'
      }])]
    })).toBe(true)
  })
  it('another echo, or a quality of that name, is not it', () => {
    expect(hasResonantDissonance({
      items: [echo('Neurofiltre')]
    })).toBe(false)
    expect(hasResonantDissonance({
      items: [{
        type: 'itemQuality', name: 'Dissonance résonante', system: {
        }
      }]
    })).toBe(false)
  })
})
