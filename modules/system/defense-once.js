import {
  updateLedger
} from "./gm-ledger.js"
import {
  CONSUMED_CARDS, SR5_MiscellaneousHelpers
} from "../rolls/roll-helpers/miscellaneous.js"

// "Se défendre" stays on an attack card, for every target of it, but a target defends once against one attack
// (DjamZ's ruling, séance F, 06/10: a player defended three times against the same attack until she succeeded).
// The defenses are kept in the registry of spent cards, written by the active GM alone (gm-ledger.js), under
// "attackMessageId|defense|defenderId": its purge already drops a key whose attack left the chat log. The GM reopens
// a defense by hand. The button only reads the registry: what holds is the GM, who records every defense card as it
// is created, and tells the GMs of a second one, a card rolled from the console included

// The buttons that read "Se défendre", and the test of the card each one rolls
export const DEFENSE_BUTTONS = {
  defenseMeleeWeapon: "defense",
  defenseRangedWeapon: "defense",
  defenseAstralCombat: "defense",
  defenseThroughAndInto: "defense",
  matrixDefense: "matrixDefense",
  complexFormDefense: "complexFormDefense",
  iceDefense: "iceDefense",
  powerDefense: "powerDefense",
  martialArtDefense: "martialArtDefense",
  grappleClinchDefense: "grappleClinchDefense",
  rammingDefense: "rammingDefense",
}
const DEFENSE_TESTS = new Set(Object.values(DEFENSE_BUTTONS))

// The id a card gives its roller (rolls/roll-prepare.js): the token of an unlinked actor, otherwise the actor
export function defenderId(actor) {
  return actor?.isToken ? actor.token?.id : actor?.id
}

export function defenseKey(attackMessageId, defender) {
  return `${attackMessageId}|defense|${defender}`
}

function spent() {
  try {
    return game.settings.get("sr5", CONSUMED_CARDS) ?? {
    }
  } catch {
    return {
    }
  }
}

export function hasDefended(attackMessageId, defender) {
  return !!(attackMessageId && defender && spent()[defenseKey(attackMessageId, defender)])
}

// The attack a defense button answers: the card itself, or for a shot through a barrier the attack it carries
export function attackIdOf(type, messageId, messageData) {
  if (type === "defenseThroughAndInto") return messageData?.originalAttackMessage?.owner?.messageId ?? null
  return messageId
}

/**
 * On a click of "Se défendre": true when the defense may be rolled. A player is told that this target has
 * defended already; a GM is asked whether to reopen it, which takes the key out of the registry.
 */
export async function mayDefend(type, messageId, messageData, actor) {
  if (!(type in DEFENSE_BUTTONS)) return true
  const attackId = attackIdOf(type, messageId, messageData), defender = defenderId(actor)
  if (!hasDefended(attackId, defender)) return true
  const name = actor?.isToken ? actor.token?.name : actor?.name
  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.format("SR5.WARN_AlreadyDefended", {
      name
    }))
    return false
  }
  const reopen = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.localize("SR5.Defend")
    },
    content: `<p>${game.i18n.format("SR5.DefenseReopenAsk", {
      name
    })}</p>`,
  })
  if (!reopen) return false
  await reopenDefense(attackId, defender)
  return true
}

export function reopenDefense(attackId, defender) {
  const key = defenseKey(attackId, defender)
  return updateLedger(CONSUMED_CARDS, ledger => {
    if (!(key in ledger)) return null
    delete ledger[key]
    return ledger
  })
}

/**
 * The active GM records each defense card as it is created; a second one against the same attack is told to the
 * GMs. A card counts only when a GM wrote it or an owner of the actor that rolled it (cardOf).
 * @returns {Promise<boolean|null>} true recorded, false a repeat, null not a defense to record
 */
export async function recordDefense(message) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return null
  const data = message?.flags?.sr5data
  if (!DEFENSE_TESTS.has(data?.test?.type)) return null
  const attackId = data.previousMessage?.messageId, defender = data.owner?.actorId
  if (!attackId || !defender) return null
  if (!SR5_MiscellaneousHelpers.cardOf(message.id)) return null
  const key = defenseKey(attackId, defender)
  let repeat = false
  await updateLedger(CONSUMED_CARDS, ledger => {
    if (ledger[key]) {
      repeat = true
      return null
    }
    return {
      ...ledger, [key]: Date.now()
    }
  })
  if (repeat) await ChatMessage.create({
    content: `<p>${game.i18n.format("SR5.DefenseRepeated", {
      name: data.owner.speakerActor ?? message.speaker?.alias ?? "", author: message.author?.name ?? ""
    })}</p>`,
    whisper: ChatMessage.getWhisperRecipients("GM"),
  })
  return !repeat
}
