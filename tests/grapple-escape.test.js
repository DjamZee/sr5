import {
  describe, it, expect
} from 'vitest'

import {
  grappleEscapeOutcome
} from '../modules/rolls/roll-helpers/grappleEscape.js'

// Run & Gun p. 135: threshold = the net hits of the grapple or subdue test.
// Run & Gun p. 148-149, Contre-prise: "ayant réussi une action d'évasion peut la traiter comme un renversement de situation réussi".
describe('grappleEscapeOutcome', () => {
  it('fails below the threshold', () => {
    expect(grappleEscapeOutcome(2, 3, true)).toBe("failed")
  })

  it('frees the character who meets the threshold', () => {
    expect(grappleEscapeOutcome(3, 3, false)).toBe("success")
  })

  it('turns a successful escape into a reversal with Contre-prise', () => {
    expect(grappleEscapeOutcome(3, 3, true)).toBe("counterGrapple")
  })

  it('needs at least one hit even with no threshold typed', () => {
    expect(grappleEscapeOutcome(0, 0, false)).toBe("failed")
  })
})
