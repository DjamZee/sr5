// Matrix attributes of a device of the scenery (actorDevice). Pure rules, no Foundry.
// SR5 p. 235-236: a device icon has a Device Rating and two matrix attributes, Data Processing and Firewall, equal to
// it for most devices. It has no Attack and no Sleaze; Noise Reduction and Sharing belong to rigger consoles.
// SR5 p. 237: an object with no Sleaze defends with the first element alone (« Logique seule si l'objet ne dispose
// pas d'un attribut Corruption »); the same goes for Attack. Hosts, IC and drones keep their own attributes.

// A device whose own ratings are its matrix attributes: a device, a maglock, or a slaved device reached by direct
// connection (SR5 p. 234)
export function isPlainDevice(deviceType, isDirectlyConnected) {
  return deviceType === "device" || deviceType === "maglock" || (deviceType === "slavedDevice" && !!isDirectlyConnected)
}

// A device of the scenery that has no Attack nor Sleaze at all: a device, a maglock, a slaved device (connected or not)
export function lacksAttackAndSleaze(actor) {
  return actor?.type === "actorDevice" && ["device", "maglock", "slavedDevice"].includes(actor.system?.matrix?.deviceType)
}
