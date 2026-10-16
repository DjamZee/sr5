import {
  describe, it, expect
} from 'vitest'
import {
  echoedProgramName, echoableProgramTypes, echoCopiesProgram
} from '../modules/entities/actors/technomancer-streams.js'
import {
  consoleAutosoftItems, autosoftShareRefused, rccAutosoftsForDrone, rccAutosoftRows
} from '../modules/entities/actors/rcc.js'

// Echo [Programme] de résonance (SR5 p. 261), and the Machinist's copies of autosofts (Kill Code p. 101): end of lot R4b

const quality = value => ({
  type: 'itemQuality', name: value, system: {
    systemEffects: [{
      category: 'specialCase', value
    }]
  }
})
const echo = name => ({
  type: 'itemEcho', name, system: {
    rank: 0, systemEffects: []
  }
})
const program = (name, type = 'autosoft') => ({
  _id: name, name, type: 'itemProgram', system: {
    type, isActive: true, isShared: true, itemRating: 4
  }
})
const technomancer = (items, deviceType = 'livingPersona') => ({
  type: 'actorPc', items, system: {
    matrix: {
      deviceType, deviceRating: 4, attributes: {
        sharing: {
          base: 2
        }, noiseReduction: {
          base: 2
        }
      }
    },
    attributes: {
      willpower: {
        augmented: {
          value: 5
        }
      }, charisma: {
        augmented: {
          value: 4
        }
      }
    },
  }
})

describe('the program an echo [Programme] copies (SR5 p. 261)', () => {
  it('read in its brackets, or in parentheses when they still say Programme', () => {
    expect(echoedProgramName(echo('[Lecture] de résonance'))).toBe('Lecture')
    expect(echoedProgramName(echo('[Programme] de résonance (Clearsight)'))).toBe('Clearsight')
    expect(echoedProgramName(echo('Resonance [Exploit]'))).toBe('Exploit')
    expect(echoedProgramName(echo('Resonance [Program] (Exploit)'))).toBe('Exploit')
  })
  it('an echo that names no program yet copies nothing; any other echo is not one', () => {
    expect(echoedProgramName(echo('[Programme] de résonance'))).toBe('')
    expect(echoedProgramName(echo('Overclocking'))).toBeNull()
    expect(echoedProgramName(program('[Lecture] de résonance'))).toBeNull()
  })
})

describe('what an echo may copy', () => {
  it('common and hacking programs; the Machinist autosofts too (KC p. 101)', () => {
    expect(echoableProgramTypes(null)).toEqual(['common', 'hacking'])
    expect(echoableProgramTypes('machinist')).toEqual(['common', 'hacking', 'autosoft'])
  })
  it('by name, accents and case aside, a name that goes on after the echo\'s included', () => {
    const tm = technomancer([echo('[Exploit] de résonance'), echo('[Acquisition] de résonance')])
    expect(echoCopiesProgram(tm, program('exploit', 'hacking'))).toBe(true)
    expect(echoCopiesProgram(tm, program('Lecture', 'common'))).toBe(false)
    // Not a Machinist: no autosoft
    expect(echoCopiesProgram(tm, program('Acquisition (Ares Alpha)'))).toBe(false)
    const machinist = technomancer([quality('streamMachinist'), echo('[Acquisition] de résonance'), echo('[Clearsight] de résonance')])
    expect(echoCopiesProgram(machinist, program('Acquisition (Ares Alpha)'))).toBe(true)
    expect(echoCopiesProgram(machinist, program('Clearsightful'))).toBe(false)
  })
})

describe('the Machinist\'s persona runs the autosofts its echoes copy, and no other', () => {
  const machinist = technomancer([quality('streamMachinist'), echo('[Clearsight] de résonance'), program('Clearsight'), program('Maneuvering')])
  const drone = owner => ({
    controlMode: 'autopilot', slaved: true, vehicleOwner: {
      id: 'tm', system: owner.system, items: owner.items
    }
  })

  it('only the copied autosofts reach the drone and its sheet', () => {
    expect(consoleAutosoftItems(machinist).map(i => i._id)).toEqual(['Clearsight'])
    expect(rccAutosoftsForDrone(drone(machinist), []).map(i => i._id)).toEqual(['Clearsight'])
    expect(rccAutosoftRows(drone(machinist), []).map(r => r._id)).toEqual(['Clearsight'])
  })
  it('sharing an autosoft no echo copies is refused, only on a Machinist\'s persona', () => {
    expect(autosoftShareRefused(machinist, program('Maneuvering'))).toBe(true)
    expect(autosoftShareRefused(machinist, program('Clearsight'))).toBe(false)
    expect(autosoftShareRefused(machinist, program('Exploit', 'hacking'))).toBe(false)
    const rigger = technomancer([program('Maneuvering')], 'riggerCommandConsole')
    expect(autosoftShareRefused(rigger, program('Maneuvering'))).toBe(false)
    expect(consoleAutosoftItems(rigger).map(i => i._id)).toEqual(['Maneuvering'])
  })
})
