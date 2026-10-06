/**
 * The matrix cards behind a defense, a resistance or a damage, read again (security lot "VD des cartes", part 2).
 *
 * A player writes the flags of her own cards: the hits of a matrix action, the damage a winning defender deals back,
 * the boxes on a resistance card. What the GM's actors take never comes from them. Each card is read again from the
 * chat log (SR5_MiscellaneousHelpers.cardOf: written by a GM or by an owner of the actor who rolled it), its hits counted
 * again on its dice within the pool of the roller's sheet plus Chance (SR5 p. 56), never above what it announces.
 * A card a GM wrote stands as written. Pure rules first; the lookups are passed in (tests) or imported.
 */

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

/** Whether `actor` is the one a card was rolled for, or the rigger of that drone (the biofeedback of a jumped-in drone). */
export function sameActor(roller, actor) {
  if (!roller || !actor) return false
  if (roller === actor || (roller.uuid && roller.uuid === actor.uuid)) return true
  return roller.type === "actorDrone" && !!roller.system?.vehicleOwner?.id && roller.system.vehicleOwner.id === actor.id
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
    hitsOf: (card, path) => SR5_MiscellaneousHelpers.hitsOf(card, path),
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
  return {
    card, hits: cardHits(false, chatData.roll?.hits, h.hitsOf(card, `matrix.actions.${typeSub}.test.dicePool`)),
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
  return {
    card, item,
    hits: cardHits(false, chatData.roll?.hits, h.hitsOf(card, "matrix.resonanceActions.threadComplexForm.test.dicePool")),
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
  if (!attack || !sameActor(attack.roller, attacker)) return 0
  const attackHits = h.hitsOf(attack, `matrix.actions.${attack.data.test?.typeSub}.test.dicePool`)
  const defenseHits = h.hitsOf(card, `matrix.actions.${card.data.test?.typeSub}.defense.dicePool`)
  return defenderNetHits({
    claimed, defenseHits, attackHits
  })
}

/** Whether a resistance or damage card may hurt `actor`: written by a GM, or by an owner of the actor it was rolled for. */
export async function cardStandsFor(messageId, actor, helpers = null) {
  const h = helpers ?? await lookups()
  const card = h.cardOf(messageId)
  if (!card) return false
  return card.byGM || sameActor(card.roller, actor)
}

/** Whether this browser can write a damage on `actor`, itself or through the active GM (socket.js emitForGM). */
export function damageReachable(actor) {
  if (game.user?.isGM || actor?.isOwner) return true
  return !!(game.users?.activeGM ?? game.users?.find?.(u => u.isGM && u.active))
}
