// Fixed colors for the condition bars drawn on tokens. They used to be read from the borders of
// #players and #sidebar, which are the same beige in V13: an empty box and a wounded box then
// differed only by their transparency (rapport de Jack, 2026-10-05). The empty box is a medium
// grey, so the bar's length stays readable on light and dark maps alike.
export const TOKEN_BAR_EMPTY = {
  color: 0x808080, alpha: 0.7
}

// Wound colors for the condition monitors; any other attribute put on a bar (Edge, ...) is not
// a wound and gets a neutral pale gold (choix d'Élise, 2026-10-05)
const FILLED = {
  physical: 0xd0201a,  // red
  condition: 0xd0201a, // red
  overflow: 0xd0201a,  // red: physical damage past the monitor
  stun: 0xe0a020,      // amber, tells the stun bar from the physical one at a glance
  matrix: 0x2a9df4,    // blue
}
const FILLED_OTHER = 0xe8d9a0

/** Color of a filled box for the bar tracking `attribute` ("statusBars.stun", ...). */
export function tokenBarFilledColor(attribute) {
  const path = String(attribute ?? "")
  if (!path.startsWith("statusBars.")) return FILLED_OTHER
  return FILLED[path.split(".").pop()] ?? FILLED_OTHER
}
