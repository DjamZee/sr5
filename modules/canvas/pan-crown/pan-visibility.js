// What an observer sees of a crown, as plain rules with no Foundry in them so that tests can read them (couronne du
// PAN, lot 1). The book, SR5 p. 236-238:
// - the devices that do not run silent within 100 meters are spotted at once, measured from the antenna (the
//   commlink or the deck); farther away, it takes a Matrix Perception (p. 236);
// - an icon one has marked is spotted without a test, at any distance (p. 236), and its owner always sees it (p. 238);
// - a spotted icon stays spotted even when it goes silent; a silent one is found by Matrix Perception (p. 236-237);
// - there is no physical distance for a host (p. 236);
// - a device whose wireless is off is not in the Matrix.
// The rulings of DjamZ (07/10, CAHIER-COURONNE-PAN.md):
// - Q2: without a commlink or a deck switched on, one only sees one's own crown (the gamemaster may reveal);
// - Q3: the observer is the token one controls, otherwise one's assigned character;
// - Q4: a device the gamemaster reveals is revealed to the whole table;
// - with the world setting "the gamemaster decides" (lot 3), a player only sees her own crown and what the gamemaster
//   revealed: no spotting, no mark, no range.
// Nothing here is hardened against the console (decision of 06/10): every client works out its own view, a comfort
// of play and no secret.

export const PAN_SPOT_RANGE_METERS = 100

/**
 * Who looks (Q3): the first token the user controls, otherwise the user's assigned character.
 * @param {Object} options
 * @param {Array} options.controlled   the tokens the user controls
 * @param {Object} options.character   the user's assigned character
 * @return {{actor: Object, token: Object|null}|null}
 */
export function pickViewer({
  controlled = [], character = null
} = {
}){
  const token = Array.from(controlled ?? []).find(t => t?.actor)
  if (token) return {
    actor: token.actor, token
  }
  if (character) return {
    actor: character, token: null
  }
  return null
}

/**
 * The verdict for one node of a crown.
 * @param {Object} node     a node of buildPanGraph: {mode, ownerIds, marks, revealed}
 * @param {Object} viewer   {isGM, ids, hasAntenna, spotted: Set|Array of uuids, gmDecides: the world setting is
 *                          "the gamemaster decides"}
 * @param {Object} where    {distance: meters from the viewer's antenna to the device, or null when not measurable
 *                          (another scene, no token); isHost: a host has no physical distance}
 * @return {{visible: Boolean, reason: String}}
 *   reason: gm, owner, revealed, gmDecides, offline, noAntenna, marked, spotted, silent, host, inRange, outOfRange
 */
export function nodeVisibility(node, viewer, where = {
}){
  const verdict = (visible, reason) => ({
    visible, reason
  })
  const ids = viewer?.ids ?? []
  if (viewer?.isGM) return verdict(true, "gm")
  if ((node.ownerIds ?? []).some(id => ids.includes(id))) return verdict(true, "owner")
  if (node.revealed) return verdict(true, "revealed")
  if (viewer?.gmDecides) return verdict(false, "gmDecides")
  if (node.mode === "offline") return verdict(false, "offline")
  if (!viewer?.hasAntenna) return verdict(false, "noAntenna")
  if ((node.marks ?? []).some(m => ids.includes(m.ownerId) && m.value > 0)) return verdict(true, "marked")
  if (isSpotted(viewer, node)) return verdict(true, "spotted")
  if (node.mode === "silent") return verdict(false, "silent")
  if (where.isHost) return verdict(true, "host")
  const distance = where.distance
  if (typeof distance === "number" && Number.isFinite(distance) && distance <= PAN_SPOT_RANGE_METERS) return verdict(true, "inRange")
  return verdict(false, "outOfRange")
}

/**
 * The marks the observer put on a node (SR5 p. 238: a mark is only seen by the one who put it).
 * @param {Object} node   a node of buildPanGraph, with marks: [{ownerId, value}]
 * @param {Array} ids     every id the observer answers to
 * @return {Number}       0 to 3
 */
export function viewerMarksOn(node, ids = []){
  return (node?.marks ?? []).filter(m => ids.includes(m.ownerId)).reduce((total, m) => total + (Number(m.value) || 0), 0)
}

/**
 * Is a node hidden from every player? Given the verdict of each player's characters; with nobody to look, it is.
 * @param {Array<{visible: Boolean}>} verdicts
 */
export function hiddenFromPlayers(verdicts = []){
  return !verdicts.some(v => v?.visible)
}

function isSpotted(viewer, node){
  const spotted = viewer?.spotted
  if (!spotted) return false
  return spotted instanceof Set ? spotted.has(node.uuid) : Array.from(spotted).includes(node.uuid)
}
