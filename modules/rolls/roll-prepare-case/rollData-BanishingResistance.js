export default function banishingResistance(rollData, actor, chatData){
  if (actor.type !== "actorSpirit") return void ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NotASpirit")}`)

  //Determine title
  rollData.test.title = game.i18n.localize("SR5.ResistBanishing")

  //Determine dicepool composition
  rollData.dicePool.composition = [{
    source: game.i18n.localize("SR5.Force"), type: "linkedAttribute", value: actor.system.force.value
  }]

  //Determine base dicepool
  rollData.dicePool.base = actor.system.force.value

  //A wild spirit resists with Force x 2 (Forbidden Arcana p. 172)
  if (actor.system.isWild) rollData.dicePool.composition.push({
    source: game.i18n.localize("SR5.SpiritWild"), type: "wildSpirit", value: actor.system.force.value
  })
  if (actor.system.isWild) rollData.dicePool.base = actor.system.force.value * 2

  //Determine dicepool modififiers
  if (actor.system.isBounded) {
    rollData.dicePool.modifiers.push({
      type: "summonerMagic", 
      label: game.i18n.localize("SR5.SpiritSummonerMagic"),
      value: actor.system.summonerMagic,
    })
  }

  //Add others informations
  rollData.test.type = "banishingResistance"
  rollData.previousMessage.actorId = chatData.owner.actorId
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.messageId = chatData.owner.messageId

  return rollData
}