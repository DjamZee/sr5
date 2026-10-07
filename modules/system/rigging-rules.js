// Rigging rules that do not need Foundry: they read plain numbers and stay testable outside a world.

//Every drone has a rigger interface built in (SR5 p. 267, Rigger 5.0 p. 173); the checkbox only means something for vehicles
export function hasRiggerInterface(vehicleData) {
  return vehicleData?.type === "drone" || !!vehicleData?.riggerInterface
}

//Piloting in VR raises the limit of every piloting test by 2 (SR5 p. 201); a jumped in rigger is always in VR (SR5 p. 268)
export const VR_PILOTING_LIMIT_BONUS = 2

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
