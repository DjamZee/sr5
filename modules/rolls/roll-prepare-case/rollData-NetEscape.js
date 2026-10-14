import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers
} from "../roll-helpers/miscellaneous.js"
import {
  netEffectOf, isLargeTarget, netSizeModifier
} from "../roll-helpers/net-rules.js"

//Run & Gun p. 25: getting free from a net, a Complex action, Unarmed Combat + Agility or Escape Artist + Agility, threshold =
//the attacker's net hits; the better of the two skills is taken. Run & Gun p. 28: an XL net on a target of normal size,
//-2 Agility; a standard net on a large one, +2
export default function netEscape(rollData, actor){
  const net = netEffectOf(actor)
  const skills = ["unarmedCombat", "escapeArtist"].filter(key => actor.system.skills?.[key])
  const skillKey = skills.reduce((best, key) => (actor.system.skills[key].test?.dicePool ?? 0) > (actor.system.skills[best].test?.dicePool ?? 0) ? key : best, skills[0])
  const skillModifiers = actor.system.skills[skillKey].test.modifiers

  rollData.test.title = game.i18n.localize("SR5.NetEscape")

  //The skill and its linked attribute, Agility for both
  rollData.dicePool.composition = skillModifiers.filter(mod => (mod.type === "skillRating" || mod.type === "skillGroup" || mod.type === "linkedAttribute"))
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skillModifiers)
  const size = netSizeModifier(!!net?.flags?.sr5?.net?.xl, isLargeTarget(actor))
  if (size) rollData.dicePool.modifiers.push({
    type: "netSize",
    label: game.i18n.localize(size < 0 ? "SR5.NetSizeXL" : "SR5.NetSizeLarge"),
    value: size,
  })

  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.limits.physicalLimit.value, actor.system.limits.physicalLimit.modifiers)
  rollData.limit.type = "physicalLimit"

  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "netEscape"
  })

  rollData.test.type = "netEscape"
  rollData.threshold.value = Math.max(0, Number(net?.system?.value) || 0)

  return rollData
}
