import {
  describe, it, expect
} from 'vitest'
import {
  streamOf, streamFadingReduction, streamSpriteDice, streamSpriteFadingReduction, reducedFading, sourcererFreeSustain,
  noiseIgnoredByStream, firewallBonusOfStream, resonanceRestoredByStream, personaActsAsRcc, machinistRccRatings,
  machineMindRating, hasHumanMachineInterface, mayJumpIn
} from '../modules/entities/actors/technomancer-streams.js'
import {
  actsAsRcc, fixedRccRatings, rccAutosoftsForDrone, rccAutosoftRows
} from '../modules/entities/actors/rcc.js'
import {
  personaPanMax
} from '../modules/entities/actors/living-persona.js'

// The streams of the technomancers (Kill Code p. 99-103, 145-146): lot R4b of the rigging plan.

const quality = (value, name = value) => ({
  type: 'itemQuality', name, system: {
    systemEffects: [{
      category: 'specialCase', value
    }]
  }
})
const echo = (name, rank = 0) => ({
  type: 'itemEcho', name, system: {
    rank, systemEffects: []
  }
})
const technomancer = (items, {
  deviceType = 'livingPersona', willpower = 5, charisma = 4
} = {
}) => ({
  type: 'actorPc', items, system: {
    activeSpecialAttribute: 'resonance',
    matrix: {
      deviceType, attributes: {
        sharing: {
          base: 4
        }, noiseReduction: {
          base: 5
        }
      }
    },
    attributes: {
      willpower: {
        augmented: {
          value: willpower
        }
      }, charisma: {
        augmented: {
          value: charisma
        }
      }
    },
  }
})
const autosoft = (id, rating = 4) => ({
  _id: id, name: id, type: 'itemProgram', system: {
    type: 'autosoft', isActive: true, isShared: true, itemRating: rating
  }
})

describe('the stream, read on a quality (Kill Code p. 99)', () => {
  it('the special case names the stream', () => {
    expect(streamOf(technomancer([quality('streamMachinist')]))).toBe('machinist')
    expect(streamOf(technomancer([quality('streamErisian')]))).toBe('erisian')
  })
  it('no stream quality, no stream; another special case is not one', () => {
    expect(streamOf(technomancer([]))).toBeNull()
    expect(streamOf(technomancer([quality('matrixFusionMaster')]))).toBeNull()
  })
  it('one stream only: the first on the sheet counts', () => {
    expect(streamOf(technomancer([quality('streamSourcerer'), quality('streamMachinist')]))).toBe('sourcerer')
  })
})

describe('fading lowered by 2 for the forms the stream knows best', () => {
  it('Machinist and Apophenian: devices (KC p. 100, 146)', () => {
    expect(streamFadingReduction('machinist', 'device')).toBe(2)
    expect(streamFadingReduction('apophenian', 'device')).toBe(2)
    expect(streamFadingReduction('machinist', 'persona')).toBe(0)
  })
  it('Cyberadept: cyberware; Erisian: personas; Morphinae: hosts and IC', () => {
    expect(streamFadingReduction('cyberadept', 'cyberware')).toBe(2)
    expect(streamFadingReduction('erisian', 'persona')).toBe(2)
    expect(streamFadingReduction('morphinae', 'host')).toBe(2)
    expect(streamFadingReduction('morphinae', 'ice')).toBe(2)
    expect(streamFadingReduction('morphinae', 'file')).toBe(0)
  })
  it('Sourcerer: every form (KC p. 101); Technoshaman and no stream: none', () => {
    for (const target of ['device', 'file', 'self', 'sprite']) expect(streamFadingReduction('sourcerer', target)).toBe(2)
    expect(streamFadingReduction('technoshaman', 'device')).toBe(0)
    expect(streamFadingReduction(null, 'device')).toBe(0)
  })
  // Arbitrage de DjamZ (07/10), d'après l'exemple de KC p. 101: a stream lowers the floor to 1, none keeps it at 2
  it('Grandeur resists 5 instead of 7, Voxel the Machinist 1 instead of 3 (KC p. 101)', () => {
    expect(reducedFading(7, 2)).toBe(5)
    expect(reducedFading(3, 2)).toBe(1)
    expect(reducedFading(2, 2)).toBe(1)
  })
  it('without a stream, the floor of 2 stays (SR5 p. 254)', () => {
    expect(reducedFading(3, 0)).toBe(3)
    expect(reducedFading(1, 0)).toBe(2)
    expect(reducedFading(0)).toBe(2)
  })
})

describe('sprites: +2 dice to compile and decompile, or less fading for the Technoshaman', () => {
  it('each stream its two kinds', () => {
    expect(streamSpriteDice('machinist', 'machine')).toBe(2)
    expect(streamSpriteDice('machinist', 'generalist')).toBe(2)
    expect(streamSpriteDice('machinist', 'crack')).toBe(0)
    expect(streamSpriteDice('cyberadept', 'companion')).toBe(2)
    expect(streamSpriteDice('cyberadept', 'fault')).toBe(2)
    expect(streamSpriteDice('morphinae', 'fault')).toBe(2)
    expect(streamSpriteDice('apophenian', 'data')).toBe(2)
    expect(streamSpriteDice('erisian', 'crack')).toBe(2)
    expect(streamSpriteDice('sourcerer', 'machine')).toBe(0)
  })
  it('the Technoshaman compiles with 2 less fading, never under 1 (KC p. 102; floor: arbitrage de DjamZ, 07/10)', () => {
    expect(streamSpriteFadingReduction('technoshaman')).toBe(2)
    expect(streamSpriteFadingReduction('machinist')).toBe(0)
    expect(reducedFading(3 * 2, streamSpriteFadingReduction('technoshaman'))).toBe(4)
    expect(reducedFading(1 * 2, streamSpriteFadingReduction('technoshaman'))).toBe(1)
    // Another stream compiles with the floor of 2 (SR5 p. 254)
    expect(reducedFading(1 * 2, streamSpriteFadingReduction('machinist'))).toBe(2)
  })
})

describe('the daemons', () => {
  it('Sourcerer: half the submersion grade of forms sustained free, rounded down (KC p. 101)', () => {
    expect(sourcererFreeSustain('sourcerer', 5)).toBe(2)
    expect(sourcererFreeSustain('sourcerer', 1)).toBe(0)
    expect(sourcererFreeSustain('machinist', 6)).toBe(0)
  })
  it('Morphinae: one point of noise ignored per grade (KC p. 145)', () => {
    expect(noiseIgnoredByStream('morphinae', 3)).toBe(3)
    expect(noiseIgnoredByStream('erisian', 3)).toBe(0)
  })
  it('Erisian: half the grade on Firewall, rounded up (KC p. 146)', () => {
    expect(firewallBonusOfStream('erisian', 3)).toBe(2)
    expect(firewallBonusOfStream('erisian', 0)).toBe(0)
    expect(firewallBonusOfStream('morphinae', 3)).toBe(0)
  })
  it('Cyberadept: the Resonance lost to cyberware comes back, up to half the grade rounded up (KC p. 100)', () => {
    // 2.5 Essence lost, 2 of them to cyberware: 3 points of Resonance lost, 2 because of the cyberware
    expect(resonanceRestoredByStream('cyberadept', 3, 2.5, 2)).toBe(2)
    expect(resonanceRestoredByStream('cyberadept', 1, 2.5, 2)).toBe(1)
    // The bioware's share stays lost
    expect(resonanceRestoredByStream('cyberadept', 6, 3, 1)).toBe(1)
    expect(resonanceRestoredByStream('cyberadept', 6, 0.4, 0)).toBe(0)
    expect(resonanceRestoredByStream('cyberadept', 0, 2, 2)).toBe(0)
    expect(resonanceRestoredByStream('machinist', 4, 2, 2)).toBe(0)
  })
})

describe('Machinist: the living persona acts as a console (KC p. 100-101)', () => {
  const machinist = technomancer([quality('streamMachinist'), autosoft('clearsight'), autosoft('targeting')])

  it('acts as a console, with Willpower and Charisma, fixed', () => {
    expect(personaActsAsRcc(machinist)).toBe(true)
    expect(actsAsRcc(machinist)).toBe(true)
    expect(fixedRccRatings(machinist)).toEqual({
      noiseReduction: 5, sharing: 4
    })
    expect(machinistRccRatings(machinist.system.attributes)).toEqual({
      noiseReduction: 5, sharing: 4
    })
  })
  it('without the stream, or through a commlink, nothing changes', () => {
    expect(actsAsRcc(technomancer([]))).toBe(false)
    expect(fixedRccRatings(technomancer([]))).toBeNull()
    expect(actsAsRcc(technomancer([quality('streamMachinist')], {
      deviceType: 'commlink'
    }))).toBe(false)
  })
  it('a real console keeps the ratings the rigger configures', () => {
    expect(fixedRccRatings(technomancer([], {
      deviceType: 'riggerCommandConsole'
    }))).toBeNull()
  })
  it('the drone reads the copy of the Machinist and uses the shared autosofts', () => {
    const drone = {
      controlMode: 'autopilot', slaved: true, vehicleOwner: {
        id: 'tm', system: machinist.system, items: machinist.items
      }
    }
    expect(rccAutosoftsForDrone(drone, []).map(i => i._id)).toEqual(['clearsight', 'targeting'])
    expect(rccAutosoftRows(drone, []).map(r => r.state)).toEqual(['used', 'used'])
  })
  it('Sharing = Charisma caps the shared autosofts, whatever the Resonance', () => {
    const shy = technomancer([quality('streamMachinist'), autosoft('a'), autosoft('b'), autosoft('c')], {
      charisma: 2
    })
    const drone = {
      controlMode: 'autopilot', slaved: true, vehicleOwner: {
        id: 'tm', system: shy.system, items: shy.items
      }
    }
    expect(rccAutosoftsForDrone(drone, []).map(i => i._id)).toEqual(['a', 'b'])
  })
  it('the persona takes Resonance x 3 slaves, like a console (SR5 p. 234)', () => {
    expect(personaPanMax(machinist, 6)).toBe(18)
    expect(personaPanMax(technomancer([]), 6)).toBe(0)
  })
})

describe('jumping in: a control rig, or the echo that stands for one (Q14)', () => {
  const owner = (items, controlRig = 0) => ({
    id: 'tm', system: {
      specialProperties: {
        controlRig: {
          value: controlRig
        }
      }
    }, items
  })

  it('Possession de la machine: a control rig of rating 1, up to 3 (SR5 p. 261)', () => {
    expect(machineMindRating({
      items: [echo('Possession de la machine')]
    })).toBe(1)
    expect(machineMindRating({
      items: [echo('Possession de la machine'), echo('Possession de la machine')]
    })).toBe(2)
    expect(machineMindRating({
      items: [echo('Machine Mind', 5)]
    })).toBe(3)
    expect(machineMindRating({
      items: [echo('Neurofiltre')]
    })).toBe(0)
  })
  it('a technomancer with the echo jumps into a drone without an implant', () => {
    expect(mayJumpIn({
      vehicleOwner: owner([echo('Possession de la machine')])
    }, true)).toBe(true)
  })
  it('without a control rig or the echo, no jumping in (SR5 p. 243, 267)', () => {
    expect(mayJumpIn({
      vehicleOwner: owner([])
    }, true)).toBe(false)
    expect(mayJumpIn({
      vehicleOwner: owner([], 2)
    }, true)).toBe(true)
    expect(mayJumpIn({
      vehicleOwner: {
        id: ''
      }
    }, true)).toBe(false)
  })
  it('IRHM does without the rigger interface of a vehicle (Data Trails p. 63)', () => {
    expect(hasHumanMachineInterface({
      items: [echo('IRHM')]
    })).toBe(true)
    expect(mayJumpIn({
      vehicleOwner: owner([echo('Possession de la machine')])
    }, false)).toBe(false)
    expect(mayJumpIn({
      vehicleOwner: owner([echo('Possession de la machine'), echo('Interface de résonance homme-machine (IRHM)')])
    }, false)).toBe(true)
  })
})
