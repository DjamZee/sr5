// Vehicle chases (R12, part 2): the vehicle test of a chase action (rollData-VehicleTest.js). Kept apart from
// chase-roll.js, which needs the chase window: the roll preparation reads only what the window put in chatData.

import {
  CHASE_ACTIONS
} from "./chase-actions.js"

// The base of a limit whose modifiers are added back afterwards (SR5_PrepareRollHelper.getBaseLimit)
function baseLimit(value, modifiers) {
  return (modifiers ?? []).reduce((base, m) => base - (Number(m.value) || 0), Number(value) || 0)
}

// The Speed attribute as prepared, off-road when the vehicle drives off-road (as chase.js reads it)
function speedAttribute(actor) {
  const attributes = actor?.system?.attributes
  if (!attributes) return 0
  const offRoad = actor.system.offRoadMode ? Number(attributes.speedOffRoad?.augmented?.value) : 0
  return offRoad || Number(attributes.speed?.augmented?.value) || 0
}

/**
 * The vehicle test of a chase action: its title, threshold, limit and dice. chatData.chaseRoll comes from the chase
 * window (launchChaseAction) or from a chase card (chaseButton).
 * @return {Boolean} true when the roll is a chase action's
 */
export function prepareChaseRoll(rollData, actor, chatData) {
  const chase = chatData?.chaseRoll
  if (!chase?.key || !CHASE_ACTIONS[chase.key]) return false
  rollData.chase = chase
  rollData.threshold.value = Math.max(0, Number(chase.threshold) || 0)
  // [Speed or Handling] by the environment (SR5 p. 205): the limit modifiers of the vehicle test (VR, control rig)
  // stay, only the base changes
  if (chase.limit === "speed") {
    rollData.limit.base = baseLimit(speedAttribute(actor), actor?.system?.vehicleTest?.limit?.modifiers)
    rollData.limit.type = "speed"
  }
  for (const d of chase.dice ?? []) rollData.dicePool.modifiers.push({
    type: "chaseAction", label: game.i18n.localize(d.key), value: Number(d.value) || 0
  })
  if (chase.originId) rollData.previousMessage.messageId = chase.originId
  const action = game.i18n.localize(`SR5.CHASE_Action_${chase.key}`)
  const what = chase.mode === "followUp" ? game.i18n.localize(`SR5.CHASE_FollowUp_${chase.test}`) :
    chase.mode === "oppose" ? game.i18n.format("SR5.CHASE_Opposing", {
      action
    }) : action
  rollData.test.title = `${game.i18n.localize("SR5.CHASE_Title")}${game.i18n.localize("SR5.Colons")} ${what}${rollData.threshold.value > 0 ? ` (${rollData.threshold.value})` : ""}`
  return true
}
