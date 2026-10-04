import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  perceptionModifiers
} from "../roll-helpers/pickpocket-rules.js"

const MODIFIER_LABELS = {
  concealment: "SR5.PickpocketConcealment",
  distracted: "SR5.PickpocketDistracted",
  attentive: "SR5.PickpocketAttentive",
  diversion: "SR5.PickpocketDiversion",
}

//SR5 p. 422: the target's Perception + Intuition [Mental], the object's concealability added to the pool;
//p. 139 for the situations. `chatData` is the thief card, with the GM's choices in `various`
export default function pickpocketPerception(rollData, actor, chatData){
  const skill = actor.system.skills?.perception
  const skillModifiers = skill?.test?.modifiers ?? []

  rollData.test.title = `${game.i18n.localize("SR5.SkillPerception")} ${game.i18n.localize("SR5.Against")} ${game.i18n.localize("SR5.Pickpocket")} (${chatData.roll.hits})`

  //Perception and Intuition; a creature without skills uses Intuition alone
  if (skill) rollData.dicePool.composition = skillModifiers.filter(mod => (mod.type === "skillRating" || mod.type === "skillGroup" || mod.type === "linkedAttribute"))
  else rollData.dicePool.composition = [{
    source: game.i18n.localize("SR5.Intuition"), type: "linkedAttribute", value: actor.system.attributes?.intuition?.augmented?.value ?? 0
  }]
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  rollData.dicePool.modifiers = skill ? SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skillModifiers) : []

  //The object's concealability and what the GM ticked (distracted, attentive, diversion)
  for (const mod of perceptionModifiers(chatData.various.pickpocketConcealment, chatData.various.pickpocketSituations)) {
    SR5_PrepareRollHelper.addDicepoolModifier(rollData, mod.type, mod.value, game.i18n.localize(MODIFIER_LABELS[mod.type]))
  }

  if (actor.system.limits?.mentalLimit) {
    rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.limits.mentalLimit.value, actor.system.limits.mentalLimit.modifiers)
    rollData.limit.type = "mentalLimit"
  }

  rollData.test.type = "pickpocketPerception"
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.actorId = chatData.owner.actorId
  rollData.previousMessage.messageId = chatData.owner.messageId
  rollData.various.pickpocketMode = chatData.various.pickpocketMode
  rollData.various.pickpocketItemId = chatData.various.pickpocketItemId
  rollData.various.pickpocketItemName = chatData.various.pickpocketItemName

  return rollData
}
