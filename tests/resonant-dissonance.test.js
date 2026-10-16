import {
  describe, it, expect
} from 'vitest'
import {
  hasResonantDissonance, livingPersonaModes, RESONANT_DISSONANCE_ACTIONS
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
    // its VO name (Better Than Bad p. 161)
    expect(hasResonantDissonance({
      items: [echo('Resonant Discordance')]
    })).toBe(true)
    expect(hasResonantDissonance({
      items: [echo('Écho maison', [{
        category: 'specialCase', value: 'echoResonantDissonance'
      }])]
    })).toBe(true)
  })
  it('in hot sim: compile, decompile, and thread a complex form (VO p. 161: « Threading complex forms »)', () => {
    expect(RESONANT_DISSONANCE_ACTIONS).toEqual(['compileSprite', 'decompileSprite', 'threadComplexForm'])
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

// Lucas#2058, R2: the menu of the sheet offered AR and hot sim only, the cold sim bonus was out of reach
describe('the modes of a living persona', () => {
  const lists = {
    personaModes: {
      ar: 'SR5.AugmentedReality', hotsim: 'SR5.VirtualRealityHotSim' 
    },
    deckModes: {
      ar: 'SR5.AugmentedReality', coldsim: 'SR5.VirtualRealityColdSim', hotsim: 'SR5.VirtualRealityHotSim' 
    }
  }
  it('with the echo, cold sim is offered (« Vous pouvez désormais entrer en RV cold-sim »)', () => {
    const modes = livingPersonaModes({
      items: [echo('Dissonance résonante')] 
    }, lists)
    expect(Object.keys(modes)).toEqual(['ar', 'coldsim', 'hotsim'])
    expect(modes.coldsim).toBe('SR5.VirtualRealityColdSim')
  })
  it('without it, AR and hot sim only, and the shared list is not changed', () => {
    expect(livingPersonaModes({
      items: [echo('Neurofiltre')] 
    }, lists)).toBe(lists.personaModes)
    livingPersonaModes({
      items: [echo('Dissonance résonante')] 
    }, lists)
    expect(Object.keys(lists.personaModes)).toEqual(['ar', 'hotsim'])
  })
})
