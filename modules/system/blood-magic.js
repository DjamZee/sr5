// Blood magic in play (Street Grimoire p. 89-91, Forbidden Arcana p. 122-130): the Blood Magic Points a magician who
// knows Sacrifice draws from a melee wound, granted by the GM, spent at casting, and the addiction they call for.
// The rules themselves are in blood-magic-rules.js.
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5_MiscellaneousHelpers
} from "../rolls/roll-helpers/miscellaneous.js"
import {
  consumedKey
} from "../rolls/roll-helpers/socket-guard.js"
import {
  availablePoints, livingBatches, spendPoints, bloodPointsFor, VICTIM_KINDS
} from "./blood-magic-rules.js"

export const BLOOD_FLAG = "bloodMagic"

function now(){
  return game.time?.worldTime ?? 0
}

export function bloodBatches(actor){
  const batches = actor?.getFlag?.("sr5", BLOOD_FLAG)?.batches
  return Array.isArray(batches) ? batches : []
}

/** The points a magician has at hand, the expired ones left out */
export function bloodPointsOf(actor){
  return availablePoints(bloodBatches(actor), game.combat, now())
}

/** Whether a magician knows a technique of the path of blood */
export function knowsBloodMagic(actor){
  const m = actor?.system?.magic?.metamagics
  return !!(m?.sacrifice || m?.cannibalize)
}

async function writeBatches(actor, batches){
  await actor.setFlag("sr5", BLOOD_FLAG, {
    batches
  })
}

/** Points granted by the GM: a batch dated by the combat round (or the world clock) it was gained in */
export async function addBloodPoints(actor, points){
  const combat = game.combat
  const batches = livingBatches(bloodBatches(actor), combat, now())
  batches.push({
    points, combatId: combat?.id ?? "", round: combat?.round ?? 0, time: now()
  })
  await writeBatches(actor, batches)
  return availablePoints(batches, combat, now())
}

/** Points spent at casting, by the caster's owner */
export async function spendBloodPoints(actor, points){
  if (!(points > 0)) return
  await writeBatches(actor, spendPoints(bloodBatches(actor), points, game.combat, now()))
}

/** The attacker of a melee attack whose resistance card this is, walking back its defense card (SR5 p. 187) */
export function meleeAttackerOf(options){
  let id = options?.previousMessage?.messageId
  for (let hop = 0; hop < 3 && id; hop++) {
    const data = game.messages?.get(id)?.flags?.sr5data
    if (!data) return null
    if (data.test?.typeSub === "meleeWeapon") return {
      attackerId: data.test.type === "defense" ? data.previousMessage?.actorId : data.owner?.actorId,
      actorUuids: data.actorUuids,
    }
    id = data.previousMessage?.messageId
  }
  return null
}

function sacrificeRecipients(attacker){
  return game.users.filter(u => u.isGM || attacker.testUserPermission(u, "OWNER")).map(u => u.id)
}

/**
 * A wound from a melee weapon, dealt by a magician who knows Sacrifice or Cannibalize (Street Grimoire p. 90): a card
 * for him and the GM. Nothing is gained until his owner picks the kind of victim and the GM grants it.
 * Called where the damage is written (entityActor-helpers.js, takeDamage), on one client only.
 */
export async function offerSacrifice(victim, options, boxes){
  if (!(boxes > 0) || !victim || victim.type === "actorSpirit") return
  if (!["actorPc", "actorGrunt"].includes(victim.type)) return
  const melee = meleeAttackerOf(options)
  if (!melee?.attackerId) return
  const attacker = SR5_EntityHelpers.getRealActorFromID(melee.attackerId, melee.actorUuids)
  if (!attacker || !knowsBloodMagic(attacker) || attacker === victim) return
  const buttons = VICTIM_KINDS.map(kind => ({
    kind, points: bloodPointsFor(boxes, kind)
  })).filter(b => b.points > 0)
  if (!buttons.length) return
  const name = SR5_EntityHelpers.displayName?.(victim) ?? victim.name
  const content = `<div class="sr5-blood-card"><p>${game.i18n.format("SR5.BloodSacrificeOffer", {
    caster: foundry.utils.escapeHTML(attacker.name), victim: foundry.utils.escapeHTML(name), boxes
  })}</p>${buttons.map(b => `<button type="button" class="sr5-blood-button" data-blood="${b.kind}">${game.i18n.format(`SR5.BloodVictim_${b.kind}`, {
    points: b.points
  })}</button>`).join("")}</div>`
  await ChatMessage.create({
    content, whisper: sacrificeRecipients(attacker), flags: {
      sr5: {
        bloodSacrifice: {
          attackerId: melee.attackerId, actorUuids: melee.actorUuids ?? null, victimName: name, boxes
        }
      }
    }
  })
}

/** The card's buttons: its magician's owner asks, the GM grants */
export function onRenderSacrificeCard(message, html){
  const card = message.flags?.sr5?.bloodSacrifice
  if (!card) return
  const attacker = SR5_EntityHelpers.getRealActorFromID(card.attackerId, card.actorUuids)
  const buttons = html.querySelectorAll(".sr5-blood-button")
  if (!game.user.isGM && !attacker?.isOwner) return buttons.forEach(el => el.remove())
  buttons.forEach(el => el.addEventListener("click", async ev => {
    ev.preventDefault()
    const kind = el.dataset.blood
    if (!VICTIM_KINDS.includes(kind)) return
    if (game.user.isGM) return grantSacrifice(message.id, kind, game.user)
    await SR5_SocketHandler.emitForGM("bloodSacrifice", {
      messageId: message.id, kind
    })
    ui.notifications.info(game.i18n.localize("SR5.BloodSacrificeAsked"))
  }))
}

export async function _socketBloodSacrifice(message, senderId){
  const data = message?.data ?? {
  }
  if (!VICTIM_KINDS.includes(data.kind)) return
  await grantSacrifice(data.messageId, data.kind, game.users.get(senderId))
}

/** The GM grants the points of a sacrifice card, once; a player's request is shown to him first */
async function grantSacrifice(messageId, kind, requester){
  if (!game.user.isGM) return
  const message = game.messages.get(messageId)
  const card = message?.flags?.sr5?.bloodSacrifice
  if (!card) return
  const attacker = SR5_EntityHelpers.getRealActorFromID(card.attackerId, card.actorUuids)
  if (!attacker) return
  if (requester && !requester.isGM && !attacker.testUserPermission(requester, "OWNER")) return
  const key = consumedKey(messageId, "bloodSacrifice")
  if (SR5_MiscellaneousHelpers.isConsumed(key)) return ui.notifications.warn(game.i18n.localize("SR5.BloodSacrificeSpent"))
  const points = bloodPointsFor(card.boxes, kind)
  if (!(points > 0)) return
  if (requester && !requester.isGM) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.MetamagicSacrifice"
      },
      content: `<p>${game.i18n.format("SR5.BloodSacrificeConfirm", {
        user: foundry.utils.escapeHTML(requester.name), caster: foundry.utils.escapeHTML(attacker.name),
        victim: foundry.utils.escapeHTML(card.victimName ?? ""), boxes: card.boxes, points,
        kind: game.i18n.format(`SR5.BloodVictim_${kind}`, {
          points
        })
      })}</p>`,
      rejectClose: false,
    }).catch(() => false)
    if (!ok) {
      await ChatMessage.create({
        content: `<p>${game.i18n.format("SR5.BloodSacrificeRefused", {
          caster: foundry.utils.escapeHTML(attacker.name)
        })}</p>`, whisper: sacrificeRecipients(attacker)
      })
      return
    }
  }
  if (!(await SR5_MiscellaneousHelpers.consume(key))) return
  const total = await addBloodPoints(attacker, points)
  await ChatMessage.create({
    content: `<p>${game.i18n.format("SR5.BloodSacrificeGranted", {
      caster: foundry.utils.escapeHTML(attacker.name), points, total
    })}</p>`, whisper: sacrificeRecipients(attacker)
  })
}

/**
 * The addiction test after sacrificial points were spent (Forbidden Arcana p. 130): psychological, rating = Magic,
 * threshold 2 or 3. Rolled from the actor's addictions list, where a "blood magic" entry is kept (SR5 p. 415)
 */
export async function bloodAddictionTest(actor, threshold){
  const magic = Number(actor.system?.specialAttributes?.magic?.augmented?.value) || 0
  const name = game.i18n.localize("SR5.BloodMagicAddiction")
  const list = foundry.utils.deepClone(actor.system.addictions ?? [])
  let index = list.findIndex(a => a?.name === name)
  if (index < 0) {
    list.push({
      name,
      shot: {
        value: 1, base: 1, modifiers: []
      },
      addiction: {
        type: "psychological", rating: magic, threshold
      },
      weekAddiction: {
        value: Math.max(1, 11 - magic), base: Math.max(1, 11 - magic), modifiers: []
      },
    })
    index = list.length - 1
  } else {
    list[index].addiction = {
      ...list[index].addiction, type: "psychological", rating: magic, threshold
    }
    if (list[index].shot) list[index].shot.value = (Number(list[index].shot.value) || 0) + 1
  }
  await actor.update({
    "system.addictions": list
  })
  return actor.rollTest("addictionTest", `psychological_${index}`)
}
