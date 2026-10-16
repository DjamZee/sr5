// Deus vult ! and Mon pays, qu'il ait tort ou raison (Manuel de l'assassin p. 14-15) on the table: at the start of
// the action phase of a fighter whose quality carries the effect, the active GM deals a card asking for a test of
// Willpower; the roll's card brings the result back. The GM's to believe, so the active GM alone writes the ledger
// (a hidden world setting), read by the actor preparation (utilityActor.updatePenalties). The rules are in
// wound-resolve-rules.js
import {
  hasWoundResolve, woundBoxes, ledgerWithFighters, atPhaseStart, afterTest, ignoresWounds, ledgerWithoutCombat
} from "./wound-resolve-rules.js"
import {
  updateLedger
} from "./gm-ledger.js"
import {
  escape, isActiveGM as isWriter, playerOwners
} from "./card-helpers.js"
import {
  cardFromGM
} from "./card-rows.js"
import {
  cardTrusted
} from "../rolls/roll-helpers/socket-guard.js"

export const WOUND_RESOLVE_LEDGER = "sr5WoundResolveLedger"

const t = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key)
const log = e => console.error("SR5 | Deus vult", e)

export function registerWoundResolveSetting(){
  game.settings.register("sr5", WOUND_RESOLVE_LEDGER, {
    scope: "world", config: false, type: Object, default: {
    },
    onChange: value => refreshFighters(value),
  })
}

export function woundResolveLedger(){
  try {
    return game.settings.get("sr5", WOUND_RESOLVE_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

// The actors whose entry came or went are prepared again: their wound modifiers change
let shown = new Set()
function refreshFighters(ledger){
  const now = new Set(Object.keys(ledger ?? {
  }))
  for (const uuid of new Set([...shown, ...now])){
    const actor = globalThis.fromUuidSync?.(uuid)
    if (!actor) continue
    actor.reset?.()
    if (actor.sheet?.rendered) actor.sheet.render()
  }
  shown = now
}

/** Read by utilityActor.updatePenalties: true while the last test held. */
export function woundResolveHolds(actor){
  if (!actor?.uuid) return false
  return ignoresWounds(woundResolveLedger()[actor.uuid])
}

const fightersOf = combat => [...combat.combatants].map(c => c.actor).filter(a => a?.uuid && hasWoundResolve(a.items))

async function onUpdateCombat(combat, changes, options){
  if (!isWriter() || !combat?.started) return
  if (!("turn" in (changes ?? {
  })) && !("round" in (changes ?? {
  }))) return
  if ((options?.direction ?? 1) < 0) return
  const fighters = fightersOf(combat)
  if (!fighters.length) return
  await updateLedger(WOUND_RESOLVE_LEDGER, ledger => ledgerWithFighters(ledger, fighters.map(a => ({
    uuid: a.uuid, boxes: woundBoxes(a.system)
  })), combat.id))
  const actor = combat.combatant?.actor
  if (!actor?.uuid || !hasWoundResolve(actor.items)) return
  let threshold = null
  await updateLedger(WOUND_RESOLVE_LEDGER, ledger => {
    const phase = atPhaseStart(ledger[actor.uuid], woundBoxes(actor.system), combat.id)
    threshold = phase.threshold
    return {
      ...ledger, [actor.uuid]: phase.entry
    }
  })
  if (threshold === null) return
  const card = await ChatMessage.create({
    content: cardContent(actor, threshold),
    speaker: ChatMessage.getSpeaker({
      actor
    }),
    whisper: [...ChatMessage.getWhisperRecipients("GM").map(u => u.id), ...playerOwners(actor)],
    flags: {
      sr5: {
        woundResolve: {
          actorUuid: actor.uuid, threshold, state: "open"
        }
      }
    },
  })
  await updateLedger(WOUND_RESOLVE_LEDGER, ledger => ledger[actor.uuid] ? {
    ...ledger, [actor.uuid]: {
      ...ledger[actor.uuid], card: card.id
    }
  } : null)
}

function cardContent(actor, threshold, outcome = null){
  const button = outcome ? `<p>${escape(outcome)}</p>` :
    `<button type="button" data-sr5-wound-resolve>${t("SR5.WoundResolveRoll", {
      threshold
    })}</button>`
  return `<div class="sr5-wound-resolve-card"><h3>${t("SR5.WoundResolveTitle")}</h3>
    <p>${t("SR5.WoundResolveAsk", {
    name: escape(actor.name), threshold
  })}</p>${button}</div>`
}

/** The card's button, for the owners of the fighter: the test of Willpower with the card's threshold. */
export function activateWoundResolveListeners(html, message){
  const wr = message.flags?.sr5?.woundResolve
  const actor = wr?.actorUuid ? globalThis.fromUuidSync?.(wr.actorUuid) : null
  const buttons = html.querySelectorAll("[data-sr5-wound-resolve]")
  if (!cardFromGM(message) || wr?.state !== "open" || !actor?.isOwner) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", () => {
    actor.rollTest("woundResolve", null, {
      woundResolve: {
        cardId: message.id, threshold: wr.threshold
      }
    })
  }))
}

// The roll of the test, brought back by the active GM: the card it answers must still be the one awaited
async function onCreateChatMessage(message){
  if (!isWriter()) return
  const data = message.flags?.sr5data
  const ref = data?.various?.woundResolve
  if (!ref?.cardId) return
  const card = game.messages.get(ref.cardId)
  const wr = card?.flags?.sr5?.woundResolve
  if (!wr || wr.state !== "open" || !cardFromGM(card)) return
  const actor = globalThis.fromUuidSync?.(wr.actorUuid)
  if (!actor) return
  const {
    SR5_EntityHelpers
  } = await import("../entities/helpers.js")
  if (SR5_EntityHelpers.getRealActorFromID(data.owner?.actorId)?.uuid !== actor.uuid) return
  if (!cardTrusted(message.author, actor.testUserPermission?.(message.author, "OWNER"))) return
  const success = (Number(data.roll?.hits) || 0) >= wr.threshold
  const written = await updateLedger(WOUND_RESOLVE_LEDGER, ledger => ledger[actor.uuid]?.card === card.id ? {
    ...ledger, [actor.uuid]: afterTest(ledger[actor.uuid], success)
  } : null)
  if (!written) return
  const outcome = t(success ? "SR5.WoundResolveHeld" : "SR5.WoundResolveBroken", {
    name: actor.name
  })
  await card.update({
    content: cardContent(actor, wr.threshold, outcome), "flags.sr5.woundResolve.state": "done"
  })
}

export function initWoundResolve(){
  shown = new Set(Object.keys(woundResolveLedger()))
  Hooks.on("updateCombat", (combat, changes, options) => onUpdateCombat(combat, changes, options).catch(log))
  Hooks.on("createChatMessage", message => onCreateChatMessage(message).catch(log))
  // « avant le combat suivant » : the combat over, the advantage comes back
  Hooks.on("deleteCombat", combat => {
    if (isWriter()) updateLedger(WOUND_RESOLVE_LEDGER, ledger => ledgerWithoutCombat(ledger, combat.id)).catch(log)
  })
}
