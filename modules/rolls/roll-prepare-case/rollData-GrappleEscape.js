import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  grappleEscapeThreshold
} from "../roll-helpers/grapple-rules.js"

//Run & Gun p. 135 and SR5 p. 195: Unarmed Combat + Strength [Physical], threshold = net hits of the grapple or subdue test
export default function grappleEscape(rollData, actor){
  let skillModifiers = actor.system.skills.unarmedCombat.test.modifiers

  //Determine title
  rollData.test.title = game.i18n.localize("SR5.GrappleEscape")

  //Determine dicepool composition: the skill of Unarmed Combat, linked to Strength instead of Agility
  rollData.dicePool.composition = skillModifiers.filter(mod => (mod.type === "skillRating" || mod.type === "skillGroup"))
  rollData.dicePool.composition.push({
    source: game.i18n.localize("SR5.Strength"), type: "linkedAttribute", value: actor.system.attributes.strength.augmented.value
  })

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skillModifiers)

  //Determine limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.limits.physicalLimit.value, actor.system.limits.physicalLimit.modifiers)
  rollData.limit.type = "physicalLimit"

  //Add others informations
  rollData.test.type = "grappleEscape"

  //Grappling rules: the threshold is the hold the actor is caught in, still open to the GM in the dialog
  if (game.settings.get("sr5", "sr5GrapplingRules")) {
    const threshold = grappleEscapeThreshold(actor.effects)
    if (threshold !== null) rollData.threshold.value = threshold
  }

  return rollData
}
