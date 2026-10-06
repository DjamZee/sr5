import {
  SR5
} from "../../config.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import SR5_RollDialog from "../roll-dialog.js"
import {
  SR5_CharacterUtility
} from "../../entities/actors/utilityActor.js"
import {
  SR5_MarkHelpers, WATCHDOG_INTERRUPTION_COST
} from "../roll-helpers/mark.js"

// Actions whose marks are not checked on the target: the support actions target allies, not Matrix icons,
// and Jack Out and Jam Signals ask for ownership of the hacker's own device (SR5 p. 239 and 244)
const NO_TARGET_MARK_CHECK = ["iAmTheFirewall", "intervene", "jackOut", "jamSignals"]
function checksTargetMarks(rollKey){
  return !NO_TARGET_MARK_CHECK.includes(rollKey)
}

// SR5 p. 240: Erase Matrix Signature is Computer + Resonance; without Resonance nobody can try it,
// not even an AI emulating it (DjamZ's ruling T8, 2026-10-06)
export function canTryMatrixAction(rollKey, actor){
  if (rollKey !== "eraseMatrixSignature") return true
  return (actor?.system?.specialAttributes?.resonance?.augmented?.value || 0) > 0
}

export default async function matrixAction(rollData, rollKey, actor){
  if (!canTryMatrixAction(rollKey, actor)) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_NeedResonance"))
  let matrixAction = actor.system.matrix.actions[rollKey]

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.MatrixActionTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.matrixRolledActions[rollKey])}`

  //Determine dicepool composition
  rollData.dicePool.composition = matrixAction.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, matrixAction.test.modifiers)

  //Determine base limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(matrixAction.limit.value, matrixAction.limit.modifiers)

  //Determine limit modififiers
  rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, matrixAction.limit.modifiers)

  //Add others informations
  rollData.test.type = "matrixAction"
  rollData.test.typeSub = rollKey
  // Rigger 5 p. 34: Detect Target Lock is a simple test with a threshold of 2
  if (rollKey === "detectTargetLock") rollData.threshold.value = 2
  rollData.limit.type = matrixAction.limit.linkedAttribute
  rollData.matrix.actionType = matrixAction.limit.linkedAttribute
  rollData.matrix.overwatchScore = matrixAction.increaseOverwatchScore
  rollData.dialogSwitch.specialization = true

  // AI Depth actions (Data Trails p. 159-161): Emulate an attribute rating up to Depth on a standard action,
  // Redefine Ownership is an extended test [Depth] with a one combat turn interval
  if ((actor.type === "actorPc" || actor.type === "actorGrunt") && actor.system.activeSpecialAttribute === "depth") {
    rollData.matrix.depth = actor.system.specialAttributes.depth.augmented.value
    if (rollKey === "redefineOwnership") {
      rollData.dialogSwitch.extended = true
      rollData.dialogSwitch.redefineOwnership = true
      rollData.test.isExtended = true
      rollData.test.extended.interval = "combatTurn"
      rollData.test.extended.multiplier = 1
    } else if (matrixAction.source !== "dataTrails") {
      rollData.dialogSwitch.emulate = true
      rollData.matrix.emulateMax = rollData.matrix.depth
      rollData.matrix.emulateAttributeValue = actor.system.matrix.attributes[matrixAction.limit.linkedAttribute]?.value || 0
      // Without a device the AI has no matrix attribute to fall back on: Emulate is the only way to act (Data Trails p. 157),
      // offered at Depth and never below 1
      if (SR5_CharacterUtility.isDevicelessAI(actor)) {
        rollData.matrix.emulateRequired = true
        rollData.matrix.emulateAttributeValue = 0
        rollData.matrix.emulateDefault = rollData.matrix.emulateMax
      }
    }
  }

  //Manage actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: matrixAction.actionType, value: 1, source: "matrixAction"
  })

  // Kill Code p. 43-44: an Interruption action costs 5 Initiative. I Am the Firewall can also be taken as a Complex action
  // (chosen in the dialog, Complex by default on the hacker's own turn); Intervene is always an Interruption.
  // Kill Code p. 45: a Watchdog mark also opens Haywire and Popup as Interruption actions (-10 Initiative),
  // and Squelch as an Interruption action (-5 Initiative), against the marked target.
  let isActorTurn = game.combat?.combatant?.actor?.uuid === actor.uuid

  if (matrixAction.actionType === "interruption") {
    rollData.combat.interruptionInitiativeCost = 5
    if (rollKey === "iAmTheFirewall") {
      rollData.dialogSwitch.matrixActionType = true
      rollData.combat.matrixActionTypeDefault = "complex"
      rollData.combat.matrixActionTypeLabel = game.i18n.localize(SR5.actionTypes.complex)
      rollData.combat.matrixActionType = (isActorTurn || !SR5_RollDialog.hasInitiativeForInterruption(actor, 5)) ? "complex" : "interruption"
    } else {
      if (!SR5_RollDialog.hasInitiativeForInterruption(actor, 5)) return
      rollData.combat.matrixActionType = "interruption"
    }
  } else if (WATCHDOG_INTERRUPTION_COST[rollKey] && !isActorTurn && hasWatchdogMarkOnTarget(rollData)) {
    rollData.dialogSwitch.matrixActionType = true
    rollData.combat.interruptionInitiativeCost = WATCHDOG_INTERRUPTION_COST[rollKey]
    rollData.combat.matrixActionTypeDefault = matrixAction.actionType
    rollData.combat.matrixActionTypeLabel = game.i18n.localize(SR5.actionTypes[matrixAction.actionType])
    rollData.combat.matrixActionType = matrixAction.actionType
  }

  if (rollData.combat.matrixActionType) {
    rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
      type: rollData.combat.matrixActionType,
      value: 1,
      source: "matrixAction",
      initiativeCost: rollData.combat.interruptionInitiativeCost,
    })
  }

  //Add public grid switch
  if (actor.system.matrix.userGrid === "public") rollData.dialogSwitch.publicGrid = true
    
  //A drone with its wireless off can no longer be hacked wirelessly (SR5 p. 424): no wireless matrix
  //action reaches it, hacking or not. Only a direct connection does (p. 234), which the GM plays by
  //switching its wireless on for the action (N91). IC, complex forms and resonance actions: roll-prepare.js
  if (checksTargetMarks(rollKey) && targetsWirelessOffDrone(actor)) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetWirelessOff"))
    return
  }

  //Check target's Marks before rolling if a target is selected
  if (game.user.targets.size && checksTargetMarks(rollKey)) {
    let canContinue = await checkTargetMarks(rollData, matrixAction, actor)
    if (!canContinue) return
  }

  //Add scene noise modifier, if any
  let noiseScene = SR5_PrepareRollHelper.getSceneNoise()
  if (noiseScene) rollData.matrix.noiseScene = noiseScene
  rollData.matrix.personalNoise = -actor.system.matrix.noise.value

  //Add special info for Data spike
  if (rollKey === "dataSpike" || rollKey === "popupCybercombat") rollData.damage.matrix.base = actor.system.matrix.attributes.attack.value

  return rollData
}

/** Kill Code p. 45: tell whether the hacker holds a Watchdog mark on the single targeted icon
 * @param {Object} rollData - the roll being prepared
 * @return {Boolean} true if the interruption actions are open against that target
 */
function hasWatchdogMarkOnTarget(rollData){
  if (game.user.targets.size !== 1) return false
  const target = Array.from(game.user.targets)[0]
  return SR5_MarkHelpers.hasWatchdogMark(target.actor, rollData.owner.speakerId)
}

/** N91: tell whether a targeted icon is a drone whose wireless is off; an older drone with no switch recorded is on
 * @param {Object} target - the targeted actor
 * @param {Object} actor - the acting actor, who may target itself
 * @return {Boolean} true if no wireless matrix action can reach it
 */
function isWirelessOffDrone(target, actor){
  return target?.type === "actorDrone" && target.system?.wirelessTurnedOn === false && target !== actor
}

/** N91: tell whether one of the user's targets is a drone no wireless matrix action can reach
 * @param {Object} actor - the acting actor
 * @return {Boolean} true if the roll must be refused
 */
function targetsWirelessOffDrone(actor){
  return Array.from(game.user.targets ?? []).some(t => isWirelessOffDrone(t.actor, actor))
}

/** A drone created from an unlinked token records the token id as its creator: the token and its
 * base actor are the same character, so both are recognised as owner (SR5 p. 238).
 * Deployed from the base sheet, it records the base actor id: an unlinked token carries that same id but is
 * a copy that deployed nothing, so only the base actor (its sheet or a linked token) owns it
 */
function isCreator(creatorId, actor, speakerId){
  if (!creatorId) return false
  if (creatorId === speakerId || (creatorId === actor.id && !actor.isToken)) return true
  const creator = SR5_EntityHelpers.getRealActorFromID(creatorId)
  // A synthetic actor carries the id of its base actor: only the base sheet takes this path, never another token copy
  return !!creator && creator.id === actor.id && !actor.isToken
}

async function checkTargetMarks(rollData, matrixAction, actor){
  if (game.user.targets.size > 1) {
    ui.notifications.warn(`${game.i18n.localize("SR5.WARN_TargetTooMany")}`)
    return false
  }

  const targeted = game.user.targets
  const cibles = Array.from(targeted)

  for (let t of cibles) {
    rollData.target.grid = t.actor.system.matrix.userGrid

    // "S" (special) is not a number and asks for no check here
    let neededMarks = Number(matrixAction.neededMarks)
    if (neededMarks > 0 && t.actor.id !== actor.id){
      // SR5 p. 238: owning an icon counts as four marks, more than anyone else can place.
      // The creator of a drone, agent, sprite or spirit owns it and needs no mark
      if (neededMarks > 3) {
        const creatorId = t.actor.system.creatorId
        if (isCreator(creatorId, actor, rollData.owner.speakerId)) return true
        // Ownership is recorded nowhere else: the GM rules, and the roll goes on with a single mark
        ui.notifications.warn(game.i18n.localize("SR5.WARN_OwnerOnlyAction"))
        neededMarks = 1
      }
      let marks = 0
      for (let item of t.actor.items){
        const mark = item.system.marks?.find(m => m.ownerId === rollData.owner.speakerId)
        if (mark?.value > marks) marks = mark.value
      }
      //An AI outside any device carries the marks on its persona (Data Trails p. 157)
      const personaMark = t.actor.system.matrix?.marks?.find(m => m.ownerId === rollData.owner.speakerId)
      if (personaMark?.value > marks) marks = personaMark.value
      if (marks < neededMarks) {
        ui.notifications.info(game.i18n.localize("SR5.NotEnoughMarksOnTarget"))
        return false
      }
      return true
    } else return true
  }
}

// Exported for the tests
export {
  checkTargetMarks, checksTargetMarks, isWirelessOffDrone, targetsWirelessOffDrone
}
