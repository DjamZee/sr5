// Rigging rules that do not need Foundry: they read plain numbers and stay testable outside a world.

//Every drone has a rigger interface built in (SR5 p. 267, Rigger 5.0 p. 173); the checkbox only means something for vehicles
export function hasRiggerInterface(vehicleData) {
  return vehicleData?.type === "drone" || !!vehicleData?.riggerInterface
}

//Piloting in VR raises the limit of every piloting test by 2 (SR5 p. 201); a jumped in rigger is always in VR (SR5 p. 268)
export const VR_PILOTING_LIMIT_BONUS = 2

//An action taken through a controlled device is limited by the lower of its normal limit and the Data Processing of the
//controller (SR5 p. 239-240). Returns the modifier that brings the limit down to that cap, or 0 when it is already under.
export function dataProcessingCapModifier(limit, dataProcessing) {
  const cap = Number(dataProcessing)
  if (!Number.isFinite(cap)) return 0
  return Math.min(0, cap - (Number(limit) || 0))
}

//Jumped in, the control rig lowers the threshold of the piloting skill tests by its rating, never under 1 (SR5 p. 268).
//Returned in the shape of the character threshold modifier (roll-helpers/threshold.js), which keeps a test without
//threshold untouched and floors a lowered one at 1.
export function controlRigThresholdModifier(controlRig, source) {
  const rating = Number(controlRig) || 0
  if (rating <= 0) return {
    value: 0, sources: []
  }
  return {
    value: -rating, sources: [{
      source, value: -rating
    }]
  }
}

//A rigger is ejected from the vehicle he is jumped into when it is destroyed or bricked, or when the commlink or RCC
//he uses is (SR5 p. 268, 271). A monitor is full once its boxes reach its size; a monitor without size never is.
export function monitorFull(monitor) {
  const size = Number(monitor?.value)
  return size > 0 && Number(monitor?.actual?.value) >= size
}

//The ejected vehicle is out of control (SR5 p. 203) until the start of the next Combat Turn, when its autopilot takes
//over again; one without a Pilot rating stays out of control until someone else takes it (SR5 p. 271).
//mark: {combatId, round} written at the ejection; combat: the encounter whose round has just changed
export function ejectionOver(mark, combat, pilot) {
  if (!mark || !(Number(pilot) > 0)) return false
  return !!combat && combat.id === mark.combatId && Number(combat.round) > Number(mark.round)
}
