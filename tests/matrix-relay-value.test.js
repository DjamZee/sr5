import {
  describe, it, expect
} from 'vitest'

// The matrix damage a player's browser relays to the GM (a matrix defense won, its damage dealt back): it sends the
// device's system as prepared, whose monitor value is worked out from the base and stored as 0. Measured in game
// (Hortense, 06/10): every relay was refused, and "Inflict N matrix damage" wrote nothing

const {
  matrixDamageAllowed
} = await import('../modules/rolls/roll-helpers/socket-guard.js')

const stored = {
  conditionMonitors: {
    matrix: {
      actual: {
        base: 7, value: 0
      }
    }
  }
}
const relay = actual => ({
  isActive: false, wirelessTurnedOn: false, conditionMonitors: {
    matrix: {
      actual
    }
  }
})

describe('matrixDamageAllowed and the prepared value a browser sends', () => {
  it('lets the value through as the new base', () => {
    expect(matrixDamageAllowed(relay({
      base: 9, value: 9
    }), stored, 9, 5)).toBe(true)
    expect(matrixDamageAllowed({
      conditionMonitors: {
        matrix: {
          actual: {
            base: 8, value: 8
          }
        }
      }
    }, stored, 9, 1)).toBe(true)
  })

  it('refuses a value that is not the new base, or beyond the monitor', () => {
    expect(matrixDamageAllowed(relay({
      base: 8, value: 9
    }), stored, 9, 5)).toBe(false)
    expect(matrixDamageAllowed(relay({
      base: 9, value: 12
    }), stored, 9, 5)).toBe(false)
    expect(matrixDamageAllowed(relay({
      base: 12, value: 12
    }), stored, 9, 5)).toBe(false)
  })

  it('still bounds the base by the damage of the card', () => {
    expect(matrixDamageAllowed(relay({
      base: 9, value: 9
    }), stored, 9, 1)).toBe(false)
  })
})
