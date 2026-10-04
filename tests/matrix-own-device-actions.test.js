import {
  describe, it, expect
} from 'vitest'

// N50: Jack Out or Jam Signals with a foreign icon targeted (an IC locking the hacker) warned
// "owner only", then refused. Both ask for ownership of the hacker's own device (SR5 p. 239 and 244).

globalThis.CONFIG ??= {
}
const {
  checksTargetMarks
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')

describe('Matrix actions on the hacker\'s own device (SR5 p. 239 and 244)', () => {
  it('checks no mark on the target for Jack Out and Jam Signals', () => {
    expect(checksTargetMarks('jackOut')).toBe(false)
    expect(checksTargetMarks('jamSignals')).toBe(false)
  })

  it('still checks the target for an action on a foreign icon', () => {
    expect(checksTargetMarks('formatDevice')).toBe(true)
    expect(checksTargetMarks('dataSpike')).toBe(true)
  })

  it('keeps the support actions out of the check', () => {
    expect(checksTargetMarks('iAmTheFirewall')).toBe(false)
    expect(checksTargetMarks('intervene')).toBe(false)
  })
})
