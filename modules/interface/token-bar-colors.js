// Fixed colors for the condition bars drawn on tokens. They used to be read from the borders of
// #players and #sidebar, which are the same beige in V13: an empty box and a wounded box then
// differed only by their transparency (rapport de Jack, 2026-10-05).
export const TOKEN_BAR_EMPTY = {
  color: 0x202020, alpha: 0.6 
}

const FILLED = {
  stun: 0xe0a020,   // amber, tells the stun bar from the physical one at a glance
  matrix: 0x2a9df4, // blue
}
const FILLED_DEFAULT = 0xd0201a // red: physical, condition

/** Color of a wounded box for the bar tracking `attribute` ("statusBars.stun", ...). */
export function tokenBarFilledColor(attribute) {
  const key = String(attribute ?? "").split(".").pop()
  return FILLED[key] ?? FILLED_DEFAULT
}
