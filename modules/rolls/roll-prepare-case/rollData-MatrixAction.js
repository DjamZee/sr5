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
import {
  isFile
} from "../../system/matrix-files.js"
import {
  refuseByRule, noticeGM
} from "../../system/rule-locks.js"
import {
  matrixOwnership, OWNER, UNKNOWN_OWNER
} from "../../system/matrix-ownership.js"
import {
  SLEUTHER_ACTIONS, sleutherDice
} from "../../system/ice-sleuther.js"
import {
  iceHostOf
} from "../../system/ice-host.js"

// Actions whose marks are not checked on the target: the support actions target allies, not Matrix icons,
// and Jack Out and Jam Signals ask for ownership of the hacker's own device (SR5 p. 239 and 244), as Suppress Noise
// and Detect Target Lock do with the rigger's console (Rigger 5.0 p. 34-35)
const NO_TARGET_MARK_CHECK = ["iAmTheFirewall", "intervene", "jackOut", "jamSignals", "suppressNoise", "detectTargetLock"]
function checksTargetMarks(rollKey){
  return !NO_TARGET_MARK_CHECK.includes(rollKey)
}

/** Is the action limited by Attack or Sleaze, which the persona lacks (SR5 p. 227)? An AI with its Depth active emulates it.
 * @param {Object} matrixAction - the action as the actor carries it
 * @param {Object} actor - the acting actor
 * @return {Boolean}
 */
export function lacksLimitAttribute(matrixAction, actor){
  const attribute = matrixAction?.limit?.linkedAttribute
  if (attribute !== "attack" && attribute !== "sleaze") return false
  if (actor?.system?.activeSpecialAttribute === "depth") return false
  const value = actor?.system?.matrix?.attributes?.[attribute]?.value
  return typeof value === "number" && value <= 0
}

// SR5 p. 240: Erase Matrix Signature is Computer + Resonance; without Resonance nobody can try it,
// not even an AI emulating it (DjamZ's ruling T8, 2026-10-06)
export function canTryMatrixAction(rollKey, actor){
  if (rollKey !== "eraseMatrixSignature") return true
  return (actor?.system?.specialAttributes?.resonance?.augmented?.value || 0) > 0
}

/** The icons a Matrix action is aimed at, each {actor}: the user's targets, or the actor a uuid named on its own
 * (A1, API pour Matrice v1: rollMatrixActionOn with no token)
 * @param {Object} [rollData] - the roll being prepared
 * @return {Array<{actor: Object}>}
 */
function matrixTargets(rollData){
  if (rollData?.target?.panActorOnly) {
    const actor = SR5_EntityHelpers.getRealActorFromID(rollData.target.actorId)
    return actor ? [{
      actor
    }] : []
  }
  return Array.from(game.user.targets ?? [])
}

export default async function matrixAction(rollData, rollKey, actor){
  //The "matrix" rule lock lifted (B13), the action goes without Resonance (rolled at 0), and the gamemaster hears of it
  if (!canTryMatrixAction(rollKey, actor) && refuseByRule("matrix", "SR5.WARN_NeedResonance", null, {
    actor
  })) return
  let matrixAction = actor.system.matrix.actions[rollKey]
  //SR5 p. 227: only decks and hosts have Attack and Sleaze. A persona without them (a commlink, an RCC) has a limit of 0
  //on these actions, which the roll read as no limit at all: a rigger hacked with every hit (séance de DjamZ du 09/10).
  //An AI acting with its Depth emulates the attribute (Data Trails p. 157). The "matrix" rule lock lifted, the action goes
  if (lacksLimitAttribute(matrixAction, actor) && refuseByRule("matrix", "SR5.WARN_NoAttackSleaze", {
    attribute: game.i18n.localize(SR5.matrixAttributes?.[matrixAction.limit.linkedAttribute] ?? matrixAction.limit.linkedAttribute)
  }, {
    actor, liftedKey: "SR5.WARN_NoAttackSleazeLifted"
  })) return

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

  //Kill Code p. 74: +2 dice per Sleuther mark on the single icon the test concerns, for the legitimate user (ice-sleuther.js)
  if (SLEUTHER_ACTIONS.includes(rollKey)) {
    const targets = matrixTargets(rollData)
    //A mark of an unlinked IC token bears its world actor's id: its tokens are read too, their host may be theirs alone
    const marker = id => [SR5_EntityHelpers.getRealActorFromID(id), ...Array.from(game.scenes ?? []).flatMap(scene =>
      Array.from(scene.tokens ?? []).filter(token => !token.actorLink && token.actorId === id).map(token => token.actor))]
    const dice = targets.length === 1 ? sleutherDice(actor, targets[0].actor, marker, iceHostOf) : 0
    if (dice) rollData.dicePool.modifiers.push({
      type: "sleutherMarks", label: game.i18n.localize("SR5.IceSleutherMarks"), value: dice,
    })
  }

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

  //An action a module offers after another (lot 19, the chained action of the module Matrice): it costs no action,
  //and the card says so
  if (rollData.matrix.offeredAction) {
    rollData.test.title += ` (${game.i18n.localize("SR5.MatrixOfferedAction")})`
    return finishMatrixAction(rollData, rollKey, actor)
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

  return finishMatrixAction(rollData, rollKey, actor)
}

// What every Matrix action checks and adds, its cost counted or offered
async function finishMatrixAction(rollData, rollKey, actor){
  const matrixAction = actor.system.matrix.actions[rollKey]
  //Add public grid switch
  if (actor.system.matrix.userGrid === "public") rollData.dialogSwitch.publicGrid = true
    
  //A drone with its wireless off can no longer be hacked wirelessly (SR5 p. 424): no wireless matrix
  //action reaches it, hacking or not. Only a direct connection does (p. 234), which the GM plays by
  //switching its wireless on for the action (N91). IC, complex forms and resonance actions: roll-prepare.js
  //The "matrix" rule lock lifted (B13), the action reaches it, and the gamemaster hears of it (named after the actor)
  if (checksTargetMarks(rollKey) && targetsWirelessOffDrone(actor, rollData) && refuseByRule("matrix", "SR5.WARN_TargetWirelessOff", null, {
    actor
  })) return

  //Check target's Marks before rolling if a target is selected
  if (matrixTargets(rollData).length && checksTargetMarks(rollKey)) {
    let canContinue = await checkTargetMarks(rollData, matrixAction, actor)
    if (!canContinue) return
  }

  //Add scene noise modifier, if any
  let noiseScene = SR5_PrepareRollHelper.getSceneNoise()
  if (noiseScene) rollData.matrix.noiseScene = noiseScene
  rollData.matrix.personalNoise = -actor.system.matrix.noise.value

  //Add special info for Data spike
  //Popup has no Attack base: its damage is the hits alone (Kill Code p. 45)
  if (rollKey === "dataSpike") rollData.damage.matrix.base = actor.system.matrix.attributes.attack.value

  return rollData
}

/** Kill Code p. 45: tell whether the hacker holds a Watchdog mark on the single targeted icon
 * @param {Object} rollData - the roll being prepared
 * @return {Boolean} true if the interruption actions are open against that target
 */
function hasWatchdogMarkOnTarget(rollData){
  const targets = matrixTargets(rollData)
  if (targets.length !== 1) return false
  const target = targets[0]
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
 * @param {Object} [rollData] - the roll being prepared, whose target may be named without a token (A1)
 * @return {Boolean} true if the roll must be refused
 */
function targetsWirelessOffDrone(actor, rollData){
  return matrixTargets(rollData).some(t => isWirelessOffDrone(t.actor, actor))
}

/** An action only the owner takes (SR5 p. 238, lot 19). The owner goes; anyone else is refused by the book, the
 * "matrix" rule lock lifted the action goes and the gamemaster hears of it. An icon whose owner the system cannot
 * tell (a device with no master, a drone with no creator) is never refused: the gamemaster is told (Élise, lot 19)
 * @return {Boolean} true if the roll goes on
 */
function ownershipOf(actor, target, speakerId){
  return matrixOwnership(actor, target, {
    speakerId,
    resolve: uuid => globalThis.fromUuidSync?.(uuid) ?? null,
    hostOf: iceHostOf,
    actorById: id => SR5_EntityHelpers.getRealActorFromID(id),
  })
}

function ownerActionAllowed(actor, target, speakerId){
  const ownership = ownershipOf(actor, target, speakerId)
  if (ownership === OWNER) return true
  const data = {
    name: target.name ?? ""
  }
  if (ownership === UNKNOWN_OWNER) {
    noticeGM("matrix", "SR5.WARN_OwnerUnknown", data, actor)
    return true
  }
  return !refuseByRule("matrix", "SR5.WARN_OwnerOnlyAction", data, {
    actor
  })
}

// The file the card aims at (the crown, or rollMatrixActionOn with its uuid), or null
function fileAimedAt(rollData){
  const uuid = rollData?.target?.itemUuid
  const item = uuid ? globalThis.fromUuidSync?.(uuid) ?? null : null
  return isFile(item) ? item : null
}

//Too few marks (SR5 p. 238). The "matrix" rule lock lifted (B13), the action goes, and the gamemaster hears of it
function refuseMarks(actor, onFile = false){
  //A file asks for marks on itself: those on its host do not count (SR5 p. 240), which the table took for a defect
  return refuseByRule("matrix", onFile ? "SR5.NotEnoughMarksOnFile" : "SR5.NotEnoughMarksOnTarget", null, {
    actor, level: "info"
  })
}

async function checkTargetMarks(rollData, matrixAction, actor){
  const cibles = matrixTargets(rollData)
  if (cibles.length > 1) {
    ui.notifications.warn(`${game.i18n.localize("SR5.WARN_TargetTooMany")}`)
    return false
  }

  for (let t of cibles) {
    rollData.target.grid = t.actor.system.matrix.userGrid

    // "S" (special) is not a number and asks for no check here
    const neededMarks = Number(matrixAction.neededMarks)
    if (neededMarks > 0 && t.actor.id !== actor.id){
      // SR5 p. 238: owning an icon counts as four marks, more than anyone else can place (lot 19, matrix-ownership.js)
      if (neededMarks > 3) return ownerActionAllowed(actor, t.actor, rollData.owner.speakerId)
      // The owner holds four marks, more than any action asks: the creator of a drone, the spider of a host (KC p. 51)
      if (ownershipOf(actor, t.actor, rollData.owner.speakerId) === OWNER) return true
      let marks = 0
      //A file aimed at counts its own marks, as any icon (SR5 p. 233: the mark is placed on the file itself)
      const file = fileAimedAt(rollData)
      if (file) {
        const fileMark = (file.system.marks ?? []).find(m => m.ownerId === rollData.owner.speakerId)
        return !((Number(fileMark?.value) || 0) < neededMarks && refuseMarks(actor, true))
      }
      for (let item of t.actor.items){
        const mark = item.system.marks?.find(m => m.ownerId === rollData.owner.speakerId)
        if (mark?.value > marks) marks = mark.value
      }
      //An AI outside any device carries the marks on its persona (Data Trails p. 157)
      const personaMark = t.actor.system.matrix?.marks?.find(m => m.ownerId === rollData.owner.speakerId)
      if (personaMark?.value > marks) marks = personaMark.value
      return !(marks < neededMarks && refuseMarks(actor))
    } else return true
  }
}

// Exported for the tests
export {
  checkTargetMarks, checksTargetMarks, isWirelessOffDrone, matrixTargets, targetsWirelessOffDrone
}
