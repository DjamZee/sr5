import {
  SR5_RollMessage
} from "../rolls/roll-message.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SOCIAL_MANEUVERS, maneuverSucceeded, carriedEffect, zanshinTier
} from "./social-maneuvers.js"
import {
  addPending
} from "./social-pending.js"
import {
  rolledStepOutcome
} from "./con-rules.js"
import {
  checkedConStep, recordRolledStep
} from "./con-card.js"
import {
  intimidationFallout
} from "./barter-rules.js"

// Cutting Aces on the chat cards (lot 21): the outcome of a social maneuver (p. 153-154), the con step to write in
// the gamemaster's tracker (p. 163-164), the bartering window (p. 160-162) and what a failed Intimidation leaves
// (p. 164). Called for every card once its own buttons are set (roll-test.js, addInfoToCard).

const info = (label) => SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)

/**
 * The author's hits and the net hits a card knows: on the resistance card, the author's hits are its threshold.
 */
function socialResult(cardData){
  if (cardData.test.isOpposedResistance) {
    const authorHits = Number(cardData.threshold?.value) || 0
    return {
      hits: authorHits, net: authorHits - (Number(cardData.roll?.hits) || 0)
    }
  }
  return {
    hits: Number(cardData.roll?.hits) || 0, net: null
  }
}

function maneuverInfo(cardData){
  const key = cardData.test.maneuver
  const m = SOCIAL_MANEUVERS[key]
  if (!m) return
  const resist = !!cardData.test.isOpposedResistance
  // Read once: on the resistance card when it depends on the net hits, on the author's card otherwise
  const onResist = m.success === "net" || m.success === "fail"
  if (resist !== onResist && !(m.success === "fail" && !resist && cardData.roll?.hits === 0)) {
    if (!resist && onResist) cardData.chatCard.buttons.maneuverInfo = info(game.i18n.format("SR5.CA_ManeuverWaits", {
      name: game.i18n.localize(`SR5.CA_Maneuver_${key}`)
    }))
    return
  }
  const result = socialResult(cardData)
  const ok = maneuverSucceeded(key, result)
  const name = game.i18n.localize(`SR5.CA_Maneuver_${key}`)
  let text
  if (key === "zanshin") text = game.i18n.localize("SR5.CA_Maneuver_zanshin_Effect")
  else if (ok === false) text = game.i18n.localize("SR5.CA_ManeuverFailed")
  else text = game.i18n.format(`SR5.CA_Maneuver_${key}_Effect`, {
    hits: result.hits, tier: zanshinTier(result.net)
  })
  cardData.chatCard.buttons.maneuverInfo = info(`${name} : ${text}`)
  // What it carries to a later test, for the gamemaster to apply (or to judge, Fake Gun)
  if (m.carry && (ok === true || m.success === "gm")) cardData.chatCard.buttons.maneuverApply = SR5_RollMessage.generateChatButton("nonOpposedTest", "maneuverApply", game.i18n.format("SR5.CA_ApplyButton", {
    name
  }), {
    gmAction: true
  })
}

/**
 * The cards' Cutting Aces lines. Rebuilt with the card (a Second Chance reads them again).
 */
export function socialCardInfo(cardData){
  const t = cardData.test
  if (!t) return
  delete cardData.chatCard.buttons.maneuverInfo
  delete cardData.chatCard.buttons.maneuverApply
  if (t.maneuver) maneuverInfo(cardData)
  if (!t.isOpposedResistance) return
  const {
    net
  } = socialResult(cardData)

  // The con step the target resisted: the gamemaster writes it in the tracker (p. 163-164)
  if (t.typeSub === "con" && t.con?.id) {
    const con = checkedConStep(t.con, t.socialAuthor)
    if (con) cardData.chatCard.buttons.conRecord = SR5_RollMessage.generateChatButton("nonOpposedTest", "conRecord", game.i18n.format("SR5.CON_RecordButton", {
      step: game.i18n.localize(`SR5.CON_Step_${t.con.step}`),
      outcome: game.i18n.localize(`SR5.CON_Status_${rolledStepOutcome(t.con.step, net, con.kind)}`),
    }), {
      gmAction: true
    })
  }

  // The negotiated value, or what Intimidation obtained (p. 161, 164): a calculator anyone may open
  if (t.typeSub === "negotiation" || t.typeSub === "intimidation") {
    cardData.chatCard.buttons.barterOpen = SR5_RollMessage.generateChatButton("nonOpposedTest", "barterOpen", game.i18n.localize(t.typeSub === "intimidation" ? "SR5.BARTER_OpenIntimidation" : "SR5.BARTER_Open"))
  }

  // A failed Intimidation that glitched (p. 164): a grudge, or a lasting enemy
  if (t.typeSub === "intimidation" && t.authorFallout && net <= 0) {
    cardData.chatCard.buttons.intimidationFallout = info(game.i18n.localize(`SR5.CA_IntimidationFallout_${t.authorFallout}`))
  }
}

/**
 * What the resistance card keeps of the card resisted (rollData-Skill.js, getOpposedData).
 */
export function carrySocialToResistance(rollData, chatData){
  rollData.test.socialAuthor = chatData.owner?.actorId ?? null
  if (chatData.test?.maneuver) rollData.test.maneuver = chatData.test.maneuver
  if (chatData.test?.typeSub === "intimidation") rollData.test.authorFallout = intimidationFallout(chatData.roll)
  return rollData
}

/* -------------------------------------------- */
// The gamemaster's buttons (roll-message.js)

/**
 * Applies what a maneuver carries to its holder (social-pending.js).
 * @returns {Promise<string|null>} the label written on the card, null when nothing was applied
 */
export async function applyManeuver(messageData){
  if (!game.user?.isGM) return null
  const key = messageData.test?.maneuver
  const resist = !!messageData.test?.isOpposedResistance
  const authorId = resist ? messageData.test.socialAuthor : messageData.owner?.actorId
  const targetId = resist ? messageData.owner?.actorId : messageData.target?.actorId
  const result = socialResult(messageData)
  const ok = maneuverSucceeded(key, result)
  if (ok === false) return null
  const effect = carriedEffect(key, result, {
    authorId, targetId
  })
  if (!effect) {
    ui.notifications.warn(game.i18n.localize("SR5.CA_ApplyNoTarget"))
    return null
  }
  const holder = SR5_EntityHelpers.getRealActorFromID(effect.holder, messageData.actorUuids)
  if (!holder) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActor"))
    return null
  }
  const author = SR5_EntityHelpers.getRealActorFromID(authorId, messageData.actorUuids)
  const label = `${game.i18n.localize(`SR5.CA_Maneuver_${key}`)} (${author?.name ?? "?"})`
  await addPending(holder, effect, label)
  return game.i18n.format("SR5.CA_Applied", {
    name: holder.name, value: effect.value > 0 ? `+${effect.value}` : `${effect.value}`
  })
}

/**
 * Writes the con step of a resistance card in the tracker.
 * @returns {Promise<string|null>} the outcome's label
 */
export async function recordConFromCard(messageData){
  const t = messageData.test
  const con = checkedConStep(t?.con, t?.socialAuthor)
  if (!con) {
    ui.notifications.warn(game.i18n.localize("SR5.CON_StepClosed"))
    return null
  }
  const outcome = await recordRolledStep(con.id, t.con.step, socialResult(messageData).net)
  return outcome ? game.i18n.localize(`SR5.CON_Status_${outcome}`) : null
}
