/**
 * The matrix cards behind a defense, a resistance or a damage, read again (security lot "VD des cartes", part 2).
 *
 * A player writes the flags of her own cards: the hits of a matrix action, the damage a winning defender deals back,
 * the boxes on a resistance card. What the GM's actors take never comes from them. Each card is read again from the
 * chat log (SR5_MiscellaneousHelpers.cardOf: written by a GM or by an owner of the actor who rolled it), its hits counted
 * again on its dice within the pool of the roller's sheet plus Chance (SR5 p. 56), never above what it announces.
 * A card a GM wrote stands as written. Pure rules first; the lookups are passed in (tests) or imported.
 */
import {
  hitsUnderPush, edgeSpentOn
} from "./socket-guard.js"

/** The hits a card stands for: a GM's as written, a player's counted again (null: no dice, 0), never above the claim. */
export function cardHits(byGM, claimed, counted) {
  const announced = Math.max(0, Math.floor(Number(claimed)) || 0)
  if (byGM) return announced
  return Math.min(announced, Math.max(0, Number(counted) || 0))
}

/**
 * The boxes a defender who wins deals back to the attacker (SR5 p. 232: the net hits), or that the attacker's
 * Biofeedback-free resistance reads: the defender's hits over the attack's, both counted again, never above the claim.
 */
export function defenderNetHits({
  claimed, defenseHits, attackHits
}) {
  const announced = Math.max(0, Math.floor(Number(claimed)) || 0)
  return Math.min(announced, Math.max(0, (Number(defenseHits) || 0) - (Number(attackHits) || 0)))
}

/**
 * The dice a card shows, the rerolls of the Rule of Six left out (SR5 p. 58): what a pool rolled. 0 without dice.
 * Compared with the pool worked out on the sheet, it tells the GM when a card rolled more than it can show for.
 */
export function diceShown(rollJSON) {
  let roll = rollJSON
  if (typeof roll === "string") {
    try {
      roll = JSON.parse(roll)
    } catch {
      return 0
    }
  }
  const results = roll?.terms?.[0]?.results
  return Array.isArray(results) ? results.filter(d => !d.ruleOfSix).length : 0
}

/**
 * Whether `actor` is the one a card was rolled for, or the rigger of that drone (the biofeedback of a jumped-in drone).
 * The drone's owner is written on its sheet, which its player may write: it only counts with standsFor below, which also
 * asks that the card's author own the actor hurt (Hyacinthe's review, D2).
 */
export function sameActor(roller, actor) {
  if (!roller || !actor) return false
  if (roller === actor || (roller.uuid && roller.uuid === actor.uuid)) return true
  return roller.type === "actorDrone" && !!roller.system?.vehicleOwner?.id && roller.system.vehicleOwner.id === actor.id
}

/** Whether a card read again (cardOf) may hurt `actor`: a GM's always; a player's only for an actor its author owns,
 * the one it was rolled for (or the rigger of that drone). */
export function standsFor(card, actor) {
  if (!card || !actor) return false
  if (card.byGM) return true
  if (!card.author || !actor.testUserPermission?.(card.author, "OWNER")) return false
  return sameActor(card.roller, actor)
}

/** The value at `path` on the actor's prepared sheet (a pool, a limit). */
export function sheetValue(actor, path) {
  const value = path.split(".").reduce((o, k) => o?.[k], actor?.system)
  return Math.max(0, Number(value) || 0)
}

/**
 * The GM grants a push a player's card announces (SR5 p. 58): only if the sheet shows Edge spent, and he confirms,
 * the hits with and without it in front of him. A player's browser never grants it.
 */
export async function grantPush(card, {
  withPush, without, label = ""
}) {
  if (!game.user?.isGM) return false
  const actor = card.roller
  const esc = s => foundry.utils.escapeHTML?.(String(s)) ?? String(s)
  if (!edgeSpentOn(actor)) {
    ui.notifications.warn(game.i18n.format("SR5.PushNoEdgeSpent", {
      actor: actor?.name ?? "?", hits: without
    }))
    return false
  }
  return foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.localize("SR5.PushConfirmTitle")
    },
    content: `<p>${game.i18n.format("SR5.PushConfirm", {
      user: esc(card.author?.name ?? "?"), actor: esc(actor?.name ?? "?"), test: esc(label), withPush, without,
      spent: Number(actor?.system?.conditionMonitors?.edge?.actual?.value) || 0,
      rating: Number(actor?.system?.specialAttributes?.edge?.augmented?.value) || 0,
    })}</p>`,
    rejectClose: false,
  }).catch(() => false)
}

/**
 * The hits a card stands for (Hyacinthe's review, D1): a GM's as written; a player's counted again on its dice, within
 * the sheet's `pool` and the test's `limit`, with no reroll, unless its push of the limit is granted (grantPush), then
 * within the pool plus Edge with the rerolls it earned (never more than its dice). Never above what it announces.
 * null when it shows no dice.
 */
export async function trustedHits({
  card, claimed, pool, limit = 0, label = "", helpers = null
}) {
  const announced = Math.max(0, Math.floor(Number(claimed)) || 0)
  if (card.byGM) return {
    hits: announced, pushed: false
  }
  const rollJSON = card.data.roll?.r
  const edge = Number(card.roller?.system?.specialAttributes?.edge?.augmented?.value) || 0
  const without = hitsUnderPush({
    rollJSON, pool, limit
  })
  if (without === null) return null
  let hits = without, pushed = false
  if (card.data.edge?.hasUsedPushTheLimit) {
    const withPush = hitsUnderPush({
      rollJSON, pool, edge, pushed: true
    }) ?? 0
    if (Math.min(announced, withPush) > Math.min(announced, without)) {
      const grant = helpers?.grantPush ?? grantPush
      if (await grant(card, {
        withPush: Math.min(announced, withPush), without: Math.min(announced, without), label
      })) {
        hits = withPush
        pushed = true
      }
    }
  }
  return {
    hits: Math.min(announced, hits), pushed
  }
}

async function lookups() {
  const {
    SR5_MiscellaneousHelpers
  } = await import("./miscellaneous.js")
  const {
    SR5_EntityHelpers
  } = await import("../../entities/helpers.js")
  return {
    cardOf: id => SR5_MiscellaneousHelpers.cardOf(id),
    poolCap: (roller, path) => SR5_MiscellaneousHelpers.poolCap(roller, path),
    actorOf: (id, uuids) => SR5_EntityHelpers.getRealActorFromID(id, uuids),
  }
}

/**
 * The matrix action a defense answers: its hits counted again within the hacker's pool for that action, and its
 * action type read on his sheet. null when the card is refused (no GM nor owner of the hacker wrote it).
 */
export async function trustedMatrixAction(chatData, helpers = null) {
  const h = helpers ?? await lookups()
  const card = h.cardOf(chatData?.owner?.messageId)
  if (!card) return null
  const typeSub = card.data.test?.typeSub
  if (card.byGM) return {
    card, hits: cardHits(true, chatData.roll?.hits), actionType: chatData.matrix?.actionType
  }
  const action = card.roller?.system?.matrix?.actions?.[typeSub]
  if (card.data.test?.type !== "matrixAction" || !action) return null
  //The limit of a matrix action is the matrix attribute it names (SR5 p. 238), ignored only by a granted push
  const counted = await trustedHits({
    card, claimed: chatData.roll?.hits, pool: sheetValue(card.roller, `matrix.actions.${typeSub}.test.dicePool`),
    limit: Number(action.limit?.value) || 0, label: card.data.test?.title ?? typeSub, helpers: h,
  })
  return {
    card, hits: counted?.hits ?? 0,
    actionType: action.limit?.linkedAttribute ?? chatData.matrix?.actionType,
    overPool: overPoolOf(h, card, `matrix.actions.${typeSub}.test.dicePool`),
  }
}

/** The sub type a complex form's card carries, read on the item's own system effects (rollData-ComplexForm.js). */
export function complexFormSubType(item, fallback = "") {
  let typeSub = fallback
  for (const e of item?.system?.systemEffects ?? []) {
    if (e.value === "sre_ResonanceSpike") typeSub = "resonanceSpike"
    if (e.value === "sre_Derezz") typeSub = "derezz"
    if (e.value === "sre_Redundancy") typeSub = "redundancy"
  }
  return typeSub
}

/**
 * The complex form a defense answers: the form must be on the technomancer who threaded it, its hits counted again
 * within his Thread a Complex Form pool plus Chance, its sub type and defense attributes read on the item. null when
 * the card is refused.
 */
export async function trustedComplexForm(chatData, helpers = null) {
  const h = helpers ?? await lookups()
  const card = h.cardOf(chatData?.owner?.messageId)
  if (!card) return null
  const itemId = card.data.owner?.itemId ?? String(card.data.owner?.itemUuid ?? "").split(".").pop()
  const item = itemId ? card.roller?.items?.get?.(itemId) : null
  if (card.byGM) return {
    card, item, hits: cardHits(true, chatData.roll?.hits), typeSub: chatData.test?.typeSub,
    defenseFirstAttribute: chatData.various?.defenseFirstAttribute, defenseSecondAttribute: chatData.various?.defenseSecondAttribute,
  }
  if (card.data.test?.type !== "complexForm" || !item || item.type !== "itemComplexForm") return null
  //The Level of a complex form is chosen when threaded: its limit is not read again (a known limit), the Rule of Six is
  const counted = await trustedHits({
    card, claimed: chatData.roll?.hits, pool: sheetValue(card.roller, "matrix.resonanceActions.threadComplexForm.test.dicePool"),
    label: item.name, helpers: h,
  })
  return {
    card, item,
    hits: counted?.hits ?? 0,
    typeSub: complexFormSubType(item, chatData.test?.typeSub === "resonanceSpike" || chatData.test?.typeSub === "derezz" || chatData.test?.typeSub === "redundancy" ? "" : chatData.test?.typeSub),
    defenseFirstAttribute: item.system.defenseAttribute, defenseSecondAttribute: item.system.defenseMatrixAttribute,
    overPool: overPoolOf(h, card, "matrix.resonanceActions.threadComplexForm.test.dicePool"),
  }
}

/**
 * Tells the GM what a player's matrix or complex form card announced beyond its dice: hits counted again, and dice
 * beyond the pool worked out on the sheet. Nothing when the card holds.
 */
export async function tellMatrixCard(result, claimedHits) {
  const claimed = Number(claimedHits) || 0
  const lines = []
  if (result.hits !== claimed) lines.push(game.i18n.format("SR5.MatrixCardHits", {
    user: result.card.author?.name ?? "?", actor: result.card.roller?.name ?? "?", value: result.hits, claimed,
  }))
  if (result.overPool) lines.push(game.i18n.format("SR5.AttackCardOverPool", result.overPool))
  if (!lines.length) return
  const text = lines.join(" ")
  const {
    SR5_ActorHelper
  } = await import("../../entities/actors/entityActor-helpers.js")
  if (game.user?.isGM) ui.notifications.warn(text, {
    permanent: true
  })
  await SR5_ActorHelper.whisperGM(text)
}

//More dice on a player's card than the pool worked out on the sheet allows (plus Chance): said to the GM, never cut silently
function overPoolOf(h, card, path) {
  if (!h.poolCap) return null
  const cap = h.poolCap(card.roller, path), dice = diceShown(card.data.roll?.r)
  return dice > cap ? {
    dice, cap
  } : null
}

/**
 * The damage a winning defender's card deals back to the attacker (matrix boxes or biofeedback), as the GM may stand
 * by it: the card's own when a GM wrote it; otherwise the net hits counted again on both cards (the attack, read
 * again too, must be the attacker's). null when the defense card is refused.
 */
export async function trustedDefenderDamage(messageId, claimed, helpers = null) {
  const h = helpers ?? await lookups()
  const card = h.cardOf(messageId)
  if (!card || card.data.test?.type !== "matrixDefense") return null
  if (card.byGM) return Math.max(0, Math.floor(Number(claimed)) || 0)
  const attacker = h.actorOf(card.data.previousMessage?.actorId, card.data.actorUuids)
  const attack = h.cardOf(card.data.previousMessage?.messageId)
  //The attack must be the attacker's matrix action this defense answers (Hyacinthe's review, D3)
  const typeSub = attack?.data?.test?.typeSub
  if (!attack || !attacker || (attack.roller !== attacker && attack.roller?.uuid !== attacker.uuid)) return null
  if (attack.data.test?.type !== "matrixAction" || !typeSub || card.data.test?.typeSub !== typeSub) return null
  const action = attack.roller?.system?.matrix?.actions?.[typeSub]
  const attackHits = await trustedHits({
    card: attack, claimed: attack.data.roll?.hits, pool: sheetValue(attack.roller, `matrix.actions.${typeSub}.test.dicePool`),
    limit: Number(action?.limit?.value) || 0, label: typeSub, helpers: h,
  })
  const defenseHits = await trustedHits({
    card, claimed: card.data.roll?.hits, pool: sheetValue(card.roller, `matrix.actions.${typeSub}.defense.dicePool`),
    label: typeSub, helpers: h,
  })
  //Dice that cannot be counted do not stand for 0 hits: the card is refused
  if (!attackHits || !defenseHits) return null
  return defenderNetHits({
    claimed, defenseHits: defenseHits.hits, attackHits: attackHits.hits
  })
}

/** Whether a resistance or damage card may hurt `actor` (standsFor): a GM's, or a player's for an actor its author owns. */
export async function cardStandsFor(messageId, actor, helpers = null) {
  const h = helpers ?? await lookups()
  return standsFor(h.cardOf(messageId), actor)
}

/** The buttons a player's browser relays to the GM without spending them (Hyacinthe's review, D5). */
export const RELAYED_BUTTONS = ["defenderDoMatrixDamage", "takeMatrixDamage"]

/** On the GM's browser, once he wrote a relayed damage: the card's button is spent there, never on a refusal. */
export async function spendRelayedButton(messageId, button) {
  if (!messageId || !RELAYED_BUTTONS.includes(button)) return false
  const {
    SR5_RollMessage
  } = await import("../roll-message.js")
  await SR5_RollMessage.updateChatButtonHelper(messageId, button)
  return true
}

/** Whether this browser can write a damage on `actor`, itself or through the active GM (socket.js emitForGM). */
export function damageReachable(actor) {
  if (game.user?.isGM || actor?.isOwner) return true
  return !!(game.users?.activeGM ?? game.users?.find?.(u => u.isGM && u.active))
}
