//Run & Gun p. 135 (Évasion): free yourself with as many hits as the net hits of the grapple or subdue test.
//Run & Gun p. 148-149 (Contre-prise): a successful escape may be treated as a successful reversal.
export function grappleEscapeOutcome(hits, threshold, hasCounterGrapple){
  if (hits < Math.max(threshold, 1)) return "failed"
  return hasCounterGrapple ? "counterGrapple" : "success"
}

export const GRAPPLE_ESCAPE_LABELS = {
  failed: "SR5.GrappleEscapeFailed",
  success: "SR5.GrappleEscapeSuccess",
  counterGrapple: "SR5.GrappleEscapeCounterGrapple",
}
