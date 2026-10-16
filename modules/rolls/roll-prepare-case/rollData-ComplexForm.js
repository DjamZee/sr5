import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  streamOf, streamFadingReduction
} from "../../entities/actors/technomancer-streams.js"

export default function complexForm(rollData, actor, item){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.Thread")} ${item.name}`

  //Determine dicepool composition
  rollData.dicePool.composition = actor.system.matrix.resonanceActions.threadComplexForm.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.matrix.resonanceActions.threadComplexForm.test.modifiers)

  //SR5 p. 252: Thread is limited by the form's level (roll-test.js); the effects on that limit add to it (Kill Code p. 114)
  rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, actor.system.matrix.resonanceActions.threadComplexForm.limit?.modifiers ?? [])

  //Add others informations
  rollData.test.type = "complexForm"
  rollData.matrix.fading.type = "stun"
  rollData.matrix.level = actor.system.specialAttributes.resonance.augmented.value
  rollData.various.defenseFirstAttribute = item.system.defenseAttribute
  rollData.various.defenseSecondAttribute = item.system.defenseMatrixAttribute
  rollData.owner.itemUuid = item.uuid
  rollData.matrix.fading.modifiers.complexForm = {
    value: item.system.fadingModifier,
    label: game.i18n.localize("SR5.FadingModifier"),
  }
  //The stream lowers the fading of the forms that aim at what it knows best (Kill Code p. 100-101, 145-146); the
  //dialog keeps the floor of 2
  const streamReduction = streamFadingReduction(streamOf(actor), item.system.target)
  if (streamReduction) rollData.matrix.fading.modifiers.technomancerStream = {
    value: -streamReduction,
    label: game.i18n.localize("SR5.TechnomancerStream"),
  }

  //Manage actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "complexForm"
  })

  //Determine sub type
  for (let e of item.system.systemEffects){
    if (e.value === "sre_ResonanceSpike") rollData.test.typeSub = "resonanceSpike"
    if (e.value === "sre_Derezz") rollData.test.typeSub = "derezz"
    if (e.value === "sre_Redundancy") rollData.test.typeSub = "redundancy"
  }

  //Add public grid switch
  if (actor.system.matrix.userGrid === "public") rollData.dialogSwitch.publicGrid = true

  //Check if an effect is transferable
  rollData = SR5_PrepareRollHelper.addTransferableEffect(rollData, item)

  return rollData
}