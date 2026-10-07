// Vehicle chases (R12, part 2): the vehicle test of a chase action (rollData-VehicleTest.js). Kept apart from
// chase-roll.js, which needs the chase window: the roll preparation reads only what the window put in chatData.

import {
  CHASE_ACTIONS, stuntLevel
} from "./chase-actions.js"
import {
  chaseQualityDice
} from "./rigger-qualities.js"

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
 * What a chase test is for the two qualities: a chase action the character takes (not an opposition, not a
 * follow-up test, not one that rolls nothing), and a Stunt test — a stunt alone, within an action (arbitrage de DjamZ,
 * 08/10), or the pursuer's same test after the core book's Stunt (SR5 p. 205).
 */
export function chaseTestKind(chase) {
  const action = CHASE_ACTIONS[chase?.key]
  const initiate = chase?.mode === "initiate" && !!action && action.roll !== false
  return {
    action: initiate,
    stunt: (initiate && (!!action.stunt || stuntLevel(chase.options?.stunt) > 0)) ||
      (chase?.mode === "followUp" && chase.test === "stuntFollow"),
  }
}

/**
 * Whether a vehicle test costs its complex action. A test the action of another imposes (opposing it, following a
 * stunt, avoiding the crash after Cut Off, the final test beyond Extreme) is free, as a defense is, and so is a test
 * that only follows up an action already paid: neither action nor initiative (SR5 p. 205, arbitrage de DjamZ, 08/10).
 * Control a Vehicle, a chase action and a stunt the character takes stay actions.
 */
export function vehicleTestCostsAction(chatData) {
  const mode = chatData?.chaseRoll?.mode
  if (mode === "oppose" || mode === "followUp") return false
  return collisionControlThreshold(chatData) === null
}

/**
 * The threshold of the test to keep control once a collision happens outside a chase (SR5 p. 204): 2 for the pilot
 * who forced it (button of the crash card, falseTest "accident"), 3 for the one who suffered it (ramming defense card).
 * Such a test is free: it follows the action of another, or the ramming already paid (arbitrage de DjamZ, 08/10).
 * @return {Number|null} null when the vehicle test does not follow a collision
 */
export function collisionControlThreshold(chatData) {
  const test = chatData?.test
  if (test?.type === "rammingDefense") return 3
  if (test?.type === "ramming" || (test?.type === "falseTest" && test.typeSub === "accident")) return 2
  return null
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
  // The Handling a stunt gave or took this turn (R5 p. 182): on the Handling only, never on the Speed limit
  if (chase.limit !== "speed") for (const m of chase.limitMods ?? []) {
    let key = "chaseStunt", n = 1
    while (rollData.limit.modifiers[key] !== undefined) key = `chaseStunt_${++n}`
    rollData.limit.modifiers[key] = {
      label: game.i18n.localize(m.key), value: Number(m.value) || 0
    }
  }
  // Cascadeur and Poursuivant infatigable (R5 p. 37), of the character at the controls
  const dice = [...(chase.dice ?? []), ...chaseQualityDice(actor?.system, actor?.system?.vehicleOwner?.items, chaseTestKind(chase))]
  for (const d of dice) rollData.dicePool.modifiers.push({
    type: "chaseAction", label: game.i18n.localize(d.key), value: Number(d.value) || 0
  })
  // A crazy stunt: the point of Edge spent as it was launched pushes the limit of its test (R5 p. 182, roll-test.js)
  if (Number(chase.edgePush) > 0) rollData.edge = {
    ...(rollData.edge ?? {
    }), prepaidPush: Number(chase.edgePush)
  }
  if (chase.originId) rollData.previousMessage.messageId = chase.originId
  const action = game.i18n.localize(`SR5.CHASE_Action_${chase.key}`)
  const what = chase.mode === "followUp" ? game.i18n.localize(`SR5.CHASE_FollowUp_${chase.test}`) :
    chase.mode === "oppose" ? game.i18n.format("SR5.CHASE_Opposing", {
      action
    }) : action
  rollData.test.title = `${game.i18n.localize("SR5.CHASE_Title")}${game.i18n.localize("SR5.Colons")} ${what}${rollData.threshold.value > 0 ? ` (${rollData.threshold.value})` : ""}`
  return true
}
