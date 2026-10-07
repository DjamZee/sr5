// Rigging rules that do not need Foundry: they read plain numbers and stay testable outside a world.

//Every drone has a rigger interface built in (SR5 p. 267, Rigger 5.0 p. 173); the checkbox only means something for vehicles
export function hasRiggerInterface(vehicleData) {
  return vehicleData?.type === "drone" || !!vehicleData?.riggerInterface
}
