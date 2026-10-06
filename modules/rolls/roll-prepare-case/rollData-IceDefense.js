import {
  SR5
} from "../../config.js"
import {
  SR5_CharacterUtility
} from "../../entities/actors/utilityActor.js"
import {
  SR5_MiscellaneousHelpers
} from "../roll-helpers/miscellaneous.js"
import {
  recountHits
} from "../roll-helpers/socket-guard.js"

// The hits of an IC attack the defense stands by. A GM's card as written; the card of an owner of the IC counted
// again on its dice, within the IC's pool (Host rating x 2, SR5 p. 248) and its Attack limit, read on its sheet.
// null when the card shows no dice
export function iceAttackHits({
  byGM, written, rollJSON, pool, limit
}){
  if (byGM) return Math.max(0, Math.floor(Number(written)) || 0)
  const hits = recountHits(rollJSON, pool)
  if (hits === null) return null
  return Number(limit) > 0 ? Math.min(hits, Number(limit)) : hits
}

// The IC attack card behind the defense, read again from the chat log, never from the button's data: a card a GM wrote,
// or an owner of the IC, of an IC attack. A card written by anyone else (a player's copy of the GM's card, its hits
// changed) is refused. The GM confirms the hits of a player's card. null when refused, false when the GM declines
export async function trustedIceAttack(chatData){
  const card = SR5_MiscellaneousHelpers.cardOf(chatData?.owner?.messageId)
  const ice = card?.roller
  if (!card || card.data.test?.type !== "iceAttack" || ice?.system?.matrix?.deviceType !== "ice") return null
  const hits = iceAttackHits({
    byGM: card.byGM, written: card.data.roll?.hits, rollJSON: card.data.roll?.r,
    pool: ice.system.matrix.ice?.attackDicepool, limit: ice.system.matrix.attributes?.attack?.value,
  })
  if (hits === null) return null
  if (!card.byGM && game.user?.isGM) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.IceAttack")
      },
      content: `<p>${game.i18n.format("SR5.IceAttackConfirm", {
        user: foundry.utils.escapeHTML?.(card.author.name) ?? card.author.name, ice: foundry.utils.escapeHTML?.(ice.name) ?? ice.name, hits
      })}</p>`,
      rejectClose: false,
    }).catch(() => false)
    if (!confirmed) return false
  }
  return {
    card, ice, hits
  }
}

export default async function iceDefense(rollData, actor, chatData){
  if (actor.type !== "actorPc" && actor.type !== "actorGrunt" &&
      actor.type !== "actorAgent" && actor.type !== "actorSprite") return void ui.notifications.warn(game.i18n.localize('SR5.WARN_InvalidActorType'))

  const attack = await trustedIceAttack(chatData)
  if (attack === false) return void ui.notifications.warn(game.i18n.localize("SR5.IceAttackDeclined"))
  if (!attack) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_IceAttackCardRefused"))
  //What the defense reads on the IC comes from its sheet, not from the card
  const iceMatrix = attack.ice.system.matrix
  chatData = {
    ...chatData,
    various: {
      ...chatData.various,
      defenseFirstAttribute: iceMatrix.ice?.defenseFirstAttribute ?? chatData.various?.defenseFirstAttribute,
      defenseSecondAttribute: iceMatrix.ice?.defenseSecondAttribute ?? chatData.various?.defenseSecondAttribute,
    },
  }

  //Determine title
  rollData.test.title = game.i18n.localize("SR5.Defense")

  //Determine base dicepool & composition
  let firstAttribute = actor.system.attributes[chatData.various.defenseFirstAttribute].augmented.value || 0
  let firstLabel = SR5.allAttributes[chatData.various.defenseFirstAttribute]
  let secondAttribute = actor.system.matrix.attributes[chatData.various.defenseSecondAttribute].value || 0
  rollData.dicePool.composition = []
  //An AI outside any device defends with its Willpower or Intuition alone, as set for the world,
  //and no matrix attribute (Data Trails p. 157), as against any other matrix action
  let devicelessAI = SR5_CharacterUtility.isDevicelessAI(actor)
  if (devicelessAI && chatData.various.defenseFirstAttribute === "logic") {
    let standIn = SR5_CharacterUtility.devicelessAILogicStandIn(actor.system)
    firstAttribute = standIn.value
    firstLabel = standIn.label
  }
  rollData.dicePool.composition.push({
    source: game.i18n.localize(firstLabel), type: "linkedAttribute", value: firstAttribute
  })
  if (devicelessAI) secondAttribute = 0
  else rollData.dicePool.composition.push({
    source: game.i18n.localize(SR5.matrixAttributes[chatData.various.defenseSecondAttribute]), type: "matrixAttribute", value: secondAttribute
  })
  rollData.dicePool.base = firstAttribute + secondAttribute

  //Determine targeted device: an AI outside any device has none, the IC targets its persona (Data Trails p. 157)
  let deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
  rollData.target.itemUuid = deck?.uuid

  //Add others informations
  rollData.test.type = "iceDefense"
  rollData.test.typeSub = iceMatrix.deviceSubType ?? chatData.test.typeSub
  rollData.previousMessage.hits = attack.hits
  rollData.previousMessage.actorId = attack.card.data.owner.actorId
  //The IC's card, read again by the GM when a player relays the marks it puts (mark.js)
  rollData.previousMessage.messageId = attack.card.id
  //SR5 p. 250: the DV starts at the IC's Attack (+1 per net hit, +2 per mark, updateMatrixDamage); it was read on the
  //new roll data, 0, and the Attack was lost
  rollData.damage.matrix.base = Number(iceMatrix.attributes?.attack?.value) || 0

  return rollData
}