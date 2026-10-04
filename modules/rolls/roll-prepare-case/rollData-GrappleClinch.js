import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"

//Run & Gun p. 133 (Saisie): Agility + Gymnastics [Physical] against Reaction + Intuition
export default async function grappleClinch(rollData, actor){
  let skillModifiers = actor.system.skills.gymnastics.test.modifiers

  //Determine title
  rollData.test.title = game.i18n.localize("SR5.GrappleClinch")

  //Determine dicepool composition: Gymnastics and its linked attribute, Agility
  rollData.dicePool.composition = skillModifiers.filter(mod => (mod.type === "skillRating" || mod.type === "skillGroup" || mod.type === "linkedAttribute"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skillModifiers)

  //Determine limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.limits.physicalLimit.value, actor.system.limits.physicalLimit.modifiers)
  rollData.limit.type = "physicalLimit"

  //The clinch needs a target to hold
  if (game.user.targets.size) rollData = await SR5_PrepareRollHelper.getTargetData(rollData)

  //Run & Gun p. 133: the clinch needs martial arts training. Whether it is required stays with the GM: a warning
  //only, a ruling of DjamZ (2026-10-04) where the book says nothing of how it is enforced.
  if (!actor.items.some(i => i.type === "itemMartialArt")) ui.notifications.warn(game.i18n.localize("SR5.WARN_GrappleNeedsMartialArts"))

  //Add others informations
  rollData.test.type = "grappleClinch"

  return rollData
}
