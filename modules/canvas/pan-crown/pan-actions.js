// The Matrix actions the radial menu of a crown offers on one device, and whether each one can be taken (couronne du
// PAN, lot 4). Plain rules with no Foundry in them, so that tests can read them.
//
// The actions aimed at a device, as the book gives them (SR5 p. 238-245, Kill Code p. 43): Matrix Perception, Hack on
// the Fly, Brute Force, Data Spike, Snoop, Spoof Command, Control Device, Format Device, Reboot Device, Garbage In
// Garbage Out ("un unique appareil"), Erase Mark, Denial of Service ("un appareil actif sans fil ou un PAN"). Jump
// into Rigged Device aims at a vehicle or a drone. The master device stands for the persona (SR5 p. 236): Trace Icon,
// Crash Program and Haywire ("la cible doit être un persona", KC p. 43) are offered on it alone.

export const PAN_DEVICE_ACTIONS = [
  "matrixPerception", "hackOnTheFly", "bruteForce", "dataSpike", "snoop", "spoofCommand", "controlDevice",
  "formatDevice", "rebootDevice", "garbageInGarbageOut", "eraseMark", "denialOfService",
]
export const PAN_RIGGED_ACTIONS = ["jumpIntoRiggedDevice"]
export const PAN_PERSONA_ACTIONS = ["traceIcon", "crashProgram", "haywire"]

// SR5 p. 238: the owner counts as four marks, more than anyone else can place
export const OWNER_MARKS = 4

/**
 * The actions offered on a node of the crown.
 * @param {Object} node    a node of getGraph
 * @param {Object} graph   its graph (graph.master is the uuid of the master node)
 * @return {Array<String>} the keys of matrix.actions
 */
export function actionsForNode(node, graph = {
}){
  if (!node) return []
  const keys = [...PAN_DEVICE_ACTIONS]
  if (node.kind === "drone" || node.itemType === "itemVehicle") keys.push(...PAN_RIGGED_ACTIONS)
  if (node.uuid && node.uuid === graph.master) keys.push(...PAN_PERSONA_ACTIONS)
  return keys
}

/**
 * The marks an action asks for, as a number; null when the book says "variable" or "special" (Control Device:
 * the marks of the action taken through the device, SR5 p. 239).
 * @param {Number|String} neededMarks   matrix.actions.<key>.neededMarks
 */
export function marksNeeded(neededMarks){
  if (neededMarks === null || neededMarks === undefined || neededMarks === "") return 0
  const value = Number(neededMarks)
  return Number.isFinite(value) ? value : null
}

/**
 * The viewer's marks that count for an action on a node: her marks on the device, and for Spoof Command her marks
 * on the icon she imitates, the owner's persona, that is the master of the PAN (SR5 p. 241: "Il faut avoir une mark
 * sur l'icône imitée, mais aucune n'est nécessaire sur la cible").
 * @param {String} key     the action
 * @param {Object} node    a node of getGraph, with viewerMarks
 * @param {Object} graph   its graph
 */
export function marksFor(key, node, graph = {
}){
  if (key === "spoofCommand" && graph.master && node.uuid !== graph.master) {
    const master = (graph.nodes ?? []).find(n => n.uuid === graph.master)
    return Number(master?.viewerMarks) || 0
  }
  return Number(node?.viewerMarks) || 0
}

/**
 * Can the viewer take this action on this device? Greyed out with its reason when she cannot.
 * @param {Object} data
 * @param {Number|String} data.neededMarks  matrix.actions.<key>.neededMarks of the viewer
 * @param {Number} data.marks               her marks that count (marksFor)
 * @param {Boolean} data.known              the viewer's sheet has the action
 * @param {Boolean} data.hasAntenna         she has a device in the Matrix (Q2)
 * @param {Boolean} [data.canTry]           false when she lacks what the action asks (Resonance)
 * @return {{enabled: Boolean, reason: String|null, needed: Number|null, marks: Number}}
 *   reason: "unknown", "noAntenna", "cannotTry", "owner" (an owner's action) or "marks"; "varies" on an action
 *   left enabled whose marks the book does not fix
 */
export function actionState({
  neededMarks, marks = 0, known = true, hasAntenna = true, canTry = true
} = {
}){
  const needed = marksNeeded(neededMarks)
  const state = (enabled, reason) => ({
    enabled, reason, needed, marks
  })
  if (!known) return state(false, "unknown")
  if (!hasAntenna) return state(false, "noAntenna")
  if (!canTry) return state(false, "cannotTry")
  if (needed === null) return state(true, "varies")
  if (needed >= OWNER_MARKS && marks < OWNER_MARKS) return state(false, "owner")
  if (marks < needed) return state(false, "marks")
  return state(true, null)
}

/**
 * The modes the owner can switch a device to, and what each switch costs (SR5 p. 236: silent is a simple action,
 * Q7; the wireless switch keeps the rule of the sheet, SR5 p. 165, 167 and 424, given by wirelessActionType).
 * @param {String} from              the current own mode: "active", "silent" or "offline"
 * @param {String} to                the mode asked
 * @param {Function} wirelessActionType  turningOn -> "free" or "simple"
 * @return {Array<{type: String, value: Number, source: String}>}  the actions to spend
 */
export function modeSwitchCost(from, to, wirelessActionType = () => "free"){
  if (from === to) return []
  const actions = []
  const wasOn = from !== "offline", isOn = to !== "offline"
  if (wasOn !== isOn) actions.push({
    type: wirelessActionType(isOn), value: 1, source: isOn ? "turnOnWifi" : "turnOffWifi"
  })
  // Running silent, or leaving it, while the device stays in the Matrix
  if (isOn && (from === "silent") !== (to === "silent")) actions.push({
    type: "simple", value: 1, source: "changeSilentMode"
  })
  return actions
}

/**
 * The fields an item takes for a mode (lot 4; lot 6 draws the rest of the device's own silent mode).
 * @param {String} mode   "active", "silent" or "offline"
 */
export function modeUpdate(mode){
  if (mode === "offline") return {
    "system.wirelessTurnedOn": false
  }
  return {
    "system.wirelessTurnedOn": true, "system.isSilent": mode === "silent"
  }
}

/**
 * The device's own mode, as the owner switches it (its master's silent mode is not hers to switch here).
 * @param {Object} node   a node of getGraph
 */
export function ownModeOf(node){
  if (node?.mode === "offline") return "offline"
  if (node?.kind === "master") return node.mode
  return node?.silentFrom === "self" ? "silent" : "active"
}

// The device the attacker aims at, written in the card's target.itemUuid: none for the persona itself (the master
// device, which defends with the persona's pool, rollData-MatrixDefense.js) nor for a deployed drone, which defends
// on its own
export function aimedItemUuid(node, graph){
  if (!node || node.uuid === graph?.master || node.kind === "drone") return null
  return node.uuid
}

/**
 * The entries of the menu for a viewer: the actions with their state, or the owner's switches.
 * @param {Object} node     a node of getGraph
 * @param {Object} graph    its graph, with viewer
 * @param {Object} viewer   {actor} who looks (pan-crown.js, currentViewer)
 * @param {Object} [options]
 * @param {Function} [options.canTry]  (key, actor) -> false when the actor lacks what the action asks (Resonance)
 * @return {{owner: Boolean, actions: Array, modes: Array, slave: Object|null}}
 */
export function menuEntries(node, graph, viewer, {
  canTry = () => true
} = {
}){
  const ids = graph?.viewer?.ids ?? []
  const owner = (node.ownerIds ?? []).some(id => ids.includes(id))
  const entries = {
    owner, actions: [], modes: [], slave: null
  }
  if (owner) {
    // A deployed drone holds its own switches, on its sheet; the master's wireless goes through the sheet too, which
    // throws a hacker in VR out of the Matrix (SR5 p. 231)
    if (node.kind !== "drone") {
      const current = ownModeOf(node)
      const modes = node.kind === "master" ? ["active", "silent"] : ["active", "silent", "offline"]
      entries.modes = modes.map(mode => ({
        mode, current: mode === current
      }))
    }
    if (node.kind === "slave") entries.slave = {
      action: "free"
    }
    else if (node.kind === "device" && graph.master && node.itemType !== "itemDevice") entries.slave = {
      action: "slave"
    }
    return entries
  }
  const actor = viewer?.actor
  if (!actor) return entries
  const actions = actor.system?.matrix?.actions ?? {
  }
  entries.actions = actionsForNode(node, graph).map(key => ({
    key,
    ...actionState({
      neededMarks: actions[key]?.neededMarks,
      marks: marksFor(key, node, graph),
      known: !!actions[key],
      hasAntenna: !!graph.viewer?.hasAntenna,
      canTry: canTry(key, actor),
    }),
  }))
  return entries
}
