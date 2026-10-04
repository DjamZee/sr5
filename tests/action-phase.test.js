import {
  describe, it, expect
} from 'vitest'

import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'

// SR5 p. 162 and 164: simple and complex actions in the character's own phase, only a free action at 0 or less
const complex = [{
  type: "complex", value: 1, source: "attack"
}]

describe('actionPhaseProblem', () => {
  it('lets a complex action through in the phase, with initiative left', () => {
    expect(SR5_MiscellaneousHelpers.actionPhaseProblem(complex, {
      initiative: 8, isCurrent: true
    })).toBeNull()
  })

  it('flags a complex action outside the phase', () => {
    expect(SR5_MiscellaneousHelpers.actionPhaseProblem(complex, {
      initiative: 8, isCurrent: false
    })).toBe("outOfPhase")
  })

  it('flags a complex action at a score of 0', () => {
    expect(SR5_MiscellaneousHelpers.actionPhaseProblem(complex, {
      initiative: 0, isCurrent: true
    })).toBe("noInitiative")
  })

  it('leaves free actions, interruptions and manual adjustments alone', () => {
    expect(SR5_MiscellaneousHelpers.actionPhaseProblem([
      {
        type: "free", value: 1, source: "turnOnWifi"
      },
      {
        type: "interruption", value: 1, source: "matrixAction"
      },
      {
        type: "simple", value: 1, source: "manual"
      },
    ], {
      initiative: -3, isCurrent: false
    })).toBeNull()
  })
})
