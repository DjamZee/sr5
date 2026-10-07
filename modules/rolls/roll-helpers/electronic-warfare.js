// The effects of the electronic warfare actions of Rigger 5.0 (p. 34-35): lot R5 of the rigging plan.
// Pure functions, read by the matrix cards, the weapon roll and the actor preparation.

//The itemEffect types these actions leave on an actor
export const TARGET_DEVICE_EFFECT = "targetDevice"
export const NOISE_SUPPRESSION_EFFECT = "noiseSuppression"
export const SENSOR_LOCK_EFFECT = "sensorLock"

//Net hits of an opposed test, never below 0
export function netHitsOf(attackerHits, defenderHits){
  return Math.max(0, (Number(attackerHits) || 0) - (Number(defenderHits) || 0))
}

//Confuse Pilot: the autopilot rolls its rating × 2 against half the net hits (Rigger 5.0 p. 34), rounded up (SR5 p. 50)
export function confusePilotThreshold(netHits){
  return Math.ceil(Math.max(0, Number(netHits) || 0) / 2)
}

//Break Target Lock: each net hit lowers the lock by one (Rigger 5.0 p. 35). The lock is kept as the defense penalty it
//gives (a negative value, SR5 p. 186): what is left of it, or null once it is gone
export function brokenLockValue(lockValue, netHits){
  const left = Math.max(0, Math.abs(Number(lockValue) || 0) - Math.max(0, Number(netHits) || 0))
  return left > 0 ? -left : null
}

//What Suppress Noise adds to a noise reduction (its modifiers of that type)
export function noiseSuppressionShare(modifiers){
  return (Array.isArray(modifiers) ? modifiers : []).filter(m => m?.type === NOISE_SUPPRESSION_EFFECT).reduce((sum, m) => sum + (Number(m.value) || 0), 0)
}

//The electronic warfare actions add the noise reduction of the console to their pool (Rigger 5.0 p. 34-35): the
//console's, without what a Suppress Noise of the turn adds, which would otherwise feed itself from one action to the next
export function consoleNoiseReductionDice(noiseReduction){
  return Math.max(0, (Number(noiseReduction?.value) || 0) - noiseSuppressionShare(noiseReduction?.modifiers))
}

//Is the attacker slaved to this rigger (Rigger 5.0 p. 34)? A drone slaved to the rigger, or a shooter whose smartlinked
//weapon is in the rigger's PAN (masterContent: the uuids the rigger's master device holds)
export function isSlavedAttacker(attacker, riggerId, {
  weaponUuid = "", masterContent = []
} = {
}){
  if (!attacker || !riggerId) return false
  if (attacker.type === "actorDrone") return !!attacker.system?.slaved && attacker.system?.vehicleOwner?.id === riggerId
  if (!weaponUuid || !(Number(attacker.system?.specialProperties?.smartlink?.value) > 0)) return false
  return (Array.isArray(masterContent) ? masterContent : []).includes(weaponUuid)
}

//Target Device: the bonus of a slaved attacker against the device a rigger tracks for him, until the end of the turn
//(Rigger 5.0 p. 34). The best one if several riggers track the same target for him
export function targetDeviceBonus(targetItems, attacker, options = {
}){
  let best = null
  for (const item of (targetItems ?? [])) {
    if (item?.type !== "itemEffect" || item.system?.type !== TARGET_DEVICE_EFFECT) continue
    const value = Number(item.system.value) || 0
    if (value <= 0) continue
    const masterContent = options.masterContentOf ? options.masterContentOf(item.system.ownerID) : []
    if (!isSlavedAttacker(attacker, item.system.ownerID, {
      weaponUuid: options.weaponUuid, masterContent
    })) continue
    if (!best || value > best.value) best = {
      value, ownerName: item.system.ownerName ?? ""
    }
  }
  return best
}

//The box of the attack dialog, ticked and counted like the other indirect effects (indirect-effects.js)
export function targetDeviceOffer(bonus, label){
  if (!bonus) return null
  return {
    key: "indirect_targetDevice", kind: "dicePool", label, when: "", value: bonus.value, isMalus: false,
    checked: true, hidden: false, indirect: true
  }
}

//An effect lasting until the end of the combat turn: decreased at the next turn by srcombat.js, as Denial of Service
export function turnEffect({
  name, type, owner, value, target, gameEffect = "", customEffects = {
  }
}){
  return {
    name,
    type: "itemEffect",
    "system.type": type,
    "system.ownerID": owner.id,
    "system.ownerName": owner.name,
    "system.duration": 1,
    "system.durationType": "round",
    "system.target": target,
    "system.value": value,
    "system.gameEffect": gameEffect,
    "system.customEffects": customEffects,
  }
}

//Suppress Noise: the hits raise the noise reduction of the rigger until the end of the turn (Rigger 5.0 p. 35)
export function noiseSuppressionCustomEffects(hits){
  return {
    "0": {
      category: "matrixAttributes",
      target: "system.matrix.attributes.noiseReduction",
      type: "value",
      value: hits,
      forceAdd: true,
    }
  }
}
