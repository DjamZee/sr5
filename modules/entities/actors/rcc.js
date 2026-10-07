// Rigger command console (SR5 p. 269-272, Rigger 5.0 p. 131): who acts as one, what it shares with its drones,
// and what a drone runs on its own. Pure functions, read by utilityActor.js, utilityItem.js and the sheets.

// Whether an actor, or its system data (the controller's copy a drone carries), acts as a rigger command console.
// The single test of the system: the Machinist of Kill Code (p. 100-101) will make a living persona answer it too
export function actsAsRcc(actorOrSystem){
  const system = actorOrSystem?.system ?? actorOrSystem
  return system?.matrix?.deviceType === "riggerCommandConsole"
}

// Noise Reduction and Sharing are configured on the console, their total never above its Device Rating (SR5 p. 269).
// Off a console both are 0; a console whose rating went down keeps its Noise Reduction first
export function rccRatings(noiseReduction, sharing, deviceRating, isRcc){
  if (!isRcc) return {
    noiseReduction: 0, sharing: 0
  }
  const rating = Math.max(0, Number(deviceRating) || 0)
  const noise = Math.min(Math.max(0, Number(noiseReduction) || 0), rating)
  return {
    noiseReduction: noise, sharing: Math.min(Math.max(0, Number(sharing) || 0), rating - noise)
  }
}

const isAutosoft = item => item?.type === "itemProgram" && item.system?.type === "autosoft"

// The autosofts a console shares with its slaved drones: those running on it that the rigger chose to share,
// as many as its Sharing rating (SR5 p. 269), in the order of the sheet
export function sharedAutosofts(controllerItems, sharing){
  const count = Math.max(0, Number(sharing) || 0)
  return (controllerItems || []).filter(i => isAutosoft(i) && i.system.isActive && i.system.isShared).slice(0, count)
}

// How many more autosofts the rigger may mark as shared: every marked one holds its place, running or not
export function sharingSlotsLeft(controllerItems, sharing){
  const marked = (controllerItems || []).filter(i => isAutosoft(i) && i.system.isShared).length
  return Math.max(0, (Number(sharing) || 0) - marked)
}

// A drone running an autosoft of its own does not use the console's (SR5 p. 269)
export function hasLocalAutosoftRunning(droneItems){
  return (droneItems || []).some(i => isAutosoft(i) && i.system.isActive)
}

// The console's autosofts reach a drone on autopilot, slaved to a console, running none of its own (SR5 p. 269, 272)
export function droneUsesRccAutosofts(droneSystem, droneItems){
  if (droneSystem?.controlMode !== "autopilot") return false
  if (!droneSystem.vehicleOwner?.id || !droneSystem.slaved) return false
  if (!actsAsRcc(droneSystem.vehicleOwner.system)) return false
  return !hasLocalAutosoftRunning(droneItems)
}

// An autosoft [Model] works only for its model (SR5 p. 272)
export function autosoftFitsDrone(autosoftSystem, droneModel){
  return !autosoftSystem?.isModelBased || autosoftSystem.model === droneModel
}

// The console's autosofts a drone uses (SR5 p. 269): none if it runs its own
export function rccAutosoftsForDrone(droneSystem, droneItems){
  if (!droneUsesRccAutosofts(droneSystem, droneItems)) return []
  const console = droneSystem.vehicleOwner
  return sharedAutosofts(console.items, consoleSharing(console.system))
}

// The Sharing of the console a drone carries a copy of, read from its source values and kept within its rating
function consoleSharing(consoleSystem){
  const attributes = consoleSystem?.matrix?.attributes
  return rccRatings(attributes?.noiseReduction?.base, attributes?.sharing?.base, consoleSystem?.matrix?.deviceRating, actsAsRcc(consoleSystem)).sharing
}

// The drone's autopilot: its Device Rating (SR5 p. 271). Read from the source, since the item effects are applied
// before the attributes are worked out
export function droneAutopilot(droneSystem){
  return Number(droneSystem?.attributes?.pilot?.natural?.base) || 0
}

// An autopilot cannot run an autosoft rated above itself; the console can, and shares it at its full rating
// (Rigger 5.0 p. 131)
export function localAutosoftRating(rating, autopilot){
  return Math.min(Number(rating) || 0, Math.max(0, Number(autopilot) || 0))
}

// Switching a drone's autosofts or programs is a complex Matrix action (SR5 p. 272), and loading an autosoft on a
// console too. Unloading stays free, as for every program: the change is paid once, when the new one is loaded
export function programSwitchActionType(program, actorType, loading){
  if (!loading) return "free"
  return (program?.system?.type === "autosoft" || actorType === "actorDrone") ? "complex" : "free"
}

// The rows of the console's autosofts on the drone's sheet: shared, kept on the console, or set aside because
// the drone runs its own
export function rccAutosoftRows(droneSystem, droneItems){
  const console = droneSystem?.vehicleOwner
  if (!console?.id || !actsAsRcc(console.system)) return []
  const used = new Set(rccAutosoftsForDrone(droneSystem, droneItems).map(i => i._id))
  const shared = new Set(sharedAutosofts(console.items, consoleSharing(console.system)).map(i => i._id))
  return (console.items || []).filter(isAutosoft).map(i => ({
    _id: i._id, name: i.name, rating: i.system.itemRating,
    state: used.has(i._id) ? "used" : (shared.has(i._id) ? "idle" : "notShared")
  }))
}
