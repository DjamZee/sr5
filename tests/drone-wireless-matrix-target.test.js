import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  isWirelessOffDrone
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')

// N91: a device with its wireless off can no longer be hacked wirelessly (SR5 p. 424); only a direct
// connection reaches it (p. 234). The roll is refused, and the GM who plays a cable switches it on.
const SOURCE = fs.readFileSync('modules/rolls/roll-prepare-case/rollData-MatrixAction.js', 'utf8')
const FR = JSON.parse(fs.readFileSync('lang/fr.json', 'utf8'))
const EN = JSON.parse(fs.readFileSync('lang/en.json', 'utf8'))

const drone = on => ({
  type: 'actorDrone', system: {
    wirelessTurnedOn: on
  }
})

describe('no wireless matrix action on a switched-off drone (N91)', () => {
  it('spots a drone with its wireless off', () => {
    expect(isWirelessOffDrone(drone(false), {
    })).toBe(true)
  })

  it('lets through a drone with its wireless on, or none recorded', () => {
    expect(isWirelessOffDrone(drone(true), {
    })).toBe(false)
    expect(isWirelessOffDrone(drone(null), {
    })).toBe(false)
  })

  it('lets through other icons and the drone acting on itself', () => {
    expect(isWirelessOffDrone({
      type: 'actorPc', system: {
        wirelessTurnedOn: false
      }
    }, {
    })).toBe(false)
    const self = drone(false)
    expect(isWirelessOffDrone(self, self)).toBe(false)
  })

  it('refuses the roll before checking marks, with the rule in the message', () => {
    const refusal = SOURCE.indexOf('checksTargetMarks(rollKey) && targetsWirelessOffDrone(actor)')
    expect(refusal).toBeGreaterThan(-1)
    expect(SOURCE.slice(refusal, refusal + 200)).toMatch(/WARN_TargetWirelessOff"\)\)\s*return\b/)
    expect(refusal).toBeLessThan(SOURCE.indexOf('await checkTargetMarks('))
    expect(FR['SR5.WARN_TargetWirelessOff']).toMatch(/p\. 424[\s\S]*p\. 234/)
    expect(EN['SR5.WARN_TargetWirelessOff']).toMatch(/p\. 424[\s\S]*p\. 234/)
  })
})
