// Matrix combat of a Monad (Dark Terrors p. 88-89, and the sidebar "What about Boston?" p. 91).
// Two strains exist: the Lockdown strain (Lockdown p. 206, the "head case" device: mental attribute + Nanite Volume)
// and the original strain of Dark Terrors, treated as an AI on a local device. Dark Terrors p. 91 leaves the choice
// to the GM; it is made on each head case device, Lockdown by default (arbitrage de DjamZ, 06/10).
// Original strain (Dark Terrors p. 88):
// - its own mental attributes; the nanite swarm is its device, with a Device Rating equal to the Nanite Volume (NV),
//   the four matrix attributes and no program slot. The book gives no value to these four attributes: each one is
//   the NV (arbitrage de DjamZ, 06/10);
// - Matrix Initiative = NV + Intuition + 4D6, always in hot sim (+2 to its matrix actions);
// - two monitors, both resisted with Willpower + Firewall: the Core, 8 + MEC / 2, and the Matrix one of the swarm,
//   8 + NV / 2. Both rounded up, as for an AI (Data Trails p. 161). Matrix damage goes to the swarm; the GM alone
//   puts it on the Core, as for an AI; Core damage gives wound modifiers, as for an AI (arbitrage de DjamZ, 06/10).
// Both strains: the Monad adds its NV to resist Format Device (Dark Terrors p. 88, kept for Lockdown as the sidebar
// p. 91 recommends; arbitrage de DjamZ, 06/10).

import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

export const STRAINS = ["lockdown", "darkTerrors"]

const num = (v) => Number(v) || 0
const aug = (actor, path) => num(path.split(".").reduce((o, k) => o?.[k], actor?.system)?.augmented?.value)

/* -------------------------------------------- */
/* Rules                                        */
/* -------------------------------------------- */

// A device or core monitor: 8 + half the rating, rounded up (Data Trails p. 161, SR5 p. 228)
export function monitorSize(rating){
  return 8 + Math.ceil(Math.max(0, num(rating)) / 2)
}

// The wound modifier of the Core, counted as a Physical or Stun one: -1 per full step of boxes
export function corePenalty(boxes, step = 3, boxReduction = 0){
  const s = num(step) > 0 ? num(step) : 3
  return 0 - Math.max(0, Math.floor((num(boxes) - num(boxReduction)) / s))
}

/* -------------------------------------------- */
/* Actor                                        */
/* -------------------------------------------- */

export function naniteVolume(actor){
  return aug(actor, "specialAttributes.nanite")
}

export function matrixEntityConcentration(actor){
  return aug(actor, "specialAttributes.cem")
}

// The active head case device of a Monad, or null
export function activeHeadcase(actor){
  if (!["actorPc", "actorGrunt"].includes(actor?.type)) return null
  if (actor.system?.activeSpecialAttribute !== "nanite") return null
  return actor.items?.find?.(i => i.type === "itemDevice" && i.system?.isActive && i.system?.type === "headcase") ?? null
}

export function strainOf(device){
  return device?.system?.strain === "darkTerrors" ? "darkTerrors" : "lockdown"
}

// The Monad of the original strain (Dark Terrors), or null: its head case device
export function originalStrainDevice(actor){
  const device = activeHeadcase(actor)
  return device && strainOf(device) === "darkTerrors" ? device : null
}

export function isOriginalStrainMonad(actor){
  return !!originalStrainDevice(actor)
}

// The boxes a matrix damage card offers to put on the Core: the card is the defender's, who may be a player, so the
// number is only a suggestion, never above the damage the attack carried; the GM confirms it
export function suggestedCoreBoxes(cardData){
  const value = Math.trunc(num(cardData?.damage?.matrix?.value))
  const base = Math.trunc(num(cardData?.damage?.matrix?.base))
  return Math.max(0, Math.min(value, base > 0 ? base : value, 50))
}

// The Core after some boxes: never beyond the monitor; the boxes beyond it are the overflow (Data Trails p. 161)
export function coreAfterDamage(current, boxes, size){
  const total = Math.max(0, num(current)) + Math.max(0, Math.trunc(num(boxes)))
  return {
    base: Math.min(total, num(size)), surplus: Math.max(0, total - num(size)), full: total >= num(size)
  }
}

// A full Core dissipates the Monad (Dark Terrors p. 88): its Nanite Volume drops by 1 + the overflow not resisted.
// The overflow is resisted with Willpower + Firewall + MEC, as an AI does with its Depth (Data Trails p. 161;
// arbitrage de DjamZ, 06/10)
export const MENTAL_ATTRIBUTES = ["logic", "intuition", "charisma", "willpower"]

export function boundCount(value, max = 50){
  return Math.max(0, Math.min(max, Math.trunc(num(value))))
}

export function coreDissipationPool({
  willpower, firewall, cem, extra = 0
}){
  return Math.max(0, num(willpower) + num(firewall) + num(cem) + Math.trunc(num(extra)))
}

export function naniteLossOnDissipation(surplus, hits){
  return 1 + Math.max(0, boundCount(surplus) - Math.max(0, num(hits)))
}

// The personality sleeps (10 - Nanite Volume) hours, at least 1, while its source code recompiles
export function sleepHours(nanite){
  return Math.max(1, 10 - num(nanite))
}

// A bricked swarm destroys the Monad and lowers the host's mental attributes by NV / 4, rounded down
export function mentalLoss(nanite){
  return Math.floor(Math.max(0, num(nanite)) / 4)
}

// A natural base lowered by a loss, the value never under 1
export function baseAfterLoss(base, value, loss){
  return num(base) - Math.max(0, Math.min(num(loss), num(value) - 1))
}

// The Nanite Volume base after a loss: the value never under 0
export function naniteBaseAfterLoss(base, value, loss){
  return num(base) - Math.max(0, Math.min(num(loss), num(value)))
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)
const ownerIds = (actor) => game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id)
const isFull = (monitor) => !!monitor && num(monitor.value) > 0 && num(monitor.actual?.value) >= num(monitor.value)

// A card is believed to be about an actor only when its author is a GM or owns that actor: anybody else's card is a
// forgery, whatever actor it names
export function authorMayActFor(author, actor){
  if (!author || !actor) return false
  return !!author.isGM || !!actor.testUserPermission?.(author, "OWNER")
}

async function cardActor(message){
  const data = message?.flags?.sr5data
  const {
    SR5_EntityHelpers
  } = await import("../entities/helpers.js")
  const actor = SR5_EntityHelpers.getRealActorFromID(data?.owner?.actorId, data?.actorUuids)
  return authorMayActFor(message?.author, actor) ? actor : null
}

// The active GM puts the matrix damage of a card on the Core of a Monad of the original strain, instead of its swarm
// (Data Trails p. 161 by analogy; arbitrage de DjamZ, 06/10). Only while the card still offers to apply the damage
export async function addMonadCoreButton(message, html){
  if (!isActiveGM()) return
  const data = message.flags?.sr5data
  if (!data?.chatCard?.buttons?.takeMatrixDamage) return
  const actor = await cardActor(message)
  if (!isOriginalStrainMonad(actor)) return
  const button = document.createElement("button")
  button.type = "button"
  button.classList.add("sr5-monad-core")
  button.textContent = game.i18n.format("SR5.MONAD_CoreButton", {
    boxes: suggestedCoreBoxes(data)
  })
  button.addEventListener("click", () => coreFromCard(message, button).catch(e => SR5_SystemHelpers.srLog(1, `Monad Core damage not applied: ${e}`)))
  const anchor = html.querySelector("#srButtonTest") ?? html.querySelector(".message-content")
  anchor?.after?.(button)
}

async function coreFromCard(message, button){
  if (button.dataset.pending) return
  button.dataset.pending = "1"
  try {
    const fresh = game.messages.get(message.id)
    const data = fresh?.flags?.sr5data
    if (!data?.chatCard?.buttons?.takeMatrixDamage) return button.remove()
    const actor = await cardActor(fresh)
    if (!isOriginalStrainMonad(actor)) return button.remove()
    const boxes = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: game.i18n.format("SR5.MONAD_CoreTitle", {
          name: actor.name
        })
      },
      content: `<p>${game.i18n.localize("SR5.MONAD_CoreRule")}</p>
        <div class="form-group"><label>${game.i18n.localize("SR5.MONAD_CoreBoxes")}</label><input type="number" name="boxes" min="0" value="${suggestedCoreBoxes(data)}"></div>`,
      ok: {
        label: game.i18n.localize("SR5.MONAD_CoreApply"),
        callback: (event, b) => Math.max(0, Math.min(50, Math.trunc(num(b.form.elements.boxes.value))))
      },
      rejectClose: false,
    })
    if (boxes === null || boxes === undefined || !isActiveGM()) return
    //Applied once: a card whose damage was applied meanwhile, on the swarm or here, no longer offers it
    if (!game.messages.get(message.id)?.flags?.sr5data?.chatCard?.buttons?.takeMatrixDamage) return button.remove()
    await applyCoreDamage(actor, boxes)
    const {
      SR5_RollMessage
    } = await import("../rolls/roll-message.js")
    await SR5_RollMessage.updateChatButtonHelper(message.id, "takeMatrixDamage")
    button.remove()
  } finally {
    delete button.dataset.pending
  }
}

// Written by the active GM only
export async function applyCoreDamage(actor, boxes){
  const core = actor.system.conditionMonitors?.core
  if (!core || !isActiveGM()) return null
  const after = coreAfterDamage(core.actual.base, boxes, core.value)
  await actor.update({
    "system.conditionMonitors.core.actual.base": after.base
  }, {
    sr5MonadCore: {
      surplus: after.surplus
    }
  })
  ui.notifications.info(game.i18n.format("SR5.MONAD_CoreApplied", {
    name: actor.name, boxes: Math.max(0, Math.trunc(num(boxes)))
  }))
  return after
}

// The overflow a GM's own update carries (the Core button) is believed; any other update says it comes from a player
export function surplusHint(options, author){
  if (author?.isGM && options?.sr5MonadCore) return {
    surplus: boundCount(options.sr5MonadCore.surplus), fromPlayer: false
  }
  return {
    surplus: 0, fromPlayer: !author?.isGM
  }
}

async function postCard(actor, kind, hint = {
}){
  const title = game.i18n.format(kind === "core" ? "SR5.MONAD_CoreFullTitle" : "SR5.MONAD_SwarmFullTitle", {
    name: escape(actor.name)
  })
  const rule = game.i18n.localize(kind === "core" ? "SR5.MONAD_CoreFullRule" : "SR5.MONAD_SwarmFullRule")
  await ChatMessage.create({
    content: `<div class="sr5-monad-card"><h3>${title}</h3><p>${rule}</p><ul>
      <li class="sr5-monad-row" data-actor-uuid="${escape(actor.uuid)}" data-kind="${kind}" data-surplus="${boundCount(hint.surplus)}" data-from-player="${hint.fromPlayer ? 1 : 0}">
      <button type="button" data-sr5-monad="resolve">${game.i18n.localize("SR5.MONAD_Resolve")}</button></li></ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        monadMatrixCard: true
      }
    },
  })
}

function offerCore(actor, changes, options, userId){
  if (!isActiveGM() || !isOriginalStrainMonad(actor)) return
  if (!foundry.utils.hasProperty(changes, "system.conditionMonitors.core.actual.base")) return
  if (!isFull(actor.system.conditionMonitors?.core)) return
  return postCard(actor, "core", surplusHint(options, game.users.get(userId)))
}

function offerSwarm(item, changes){
  const actor = item?.parent
  if (!isActiveGM() || !(actor instanceof Actor) || originalStrainDevice(actor)?.id !== item.id) return
  if (!foundry.utils.hasProperty(changes, "system.conditionMonitors.matrix.actual.base")) return
  if (!isFull(item.system.conditionMonitors?.matrix)) return
  return postCard(actor, "swarm")
}

async function rollPool(dicePool){
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  return SR5_RollTest.rollDice({
    dicePool
  })
}

async function resultCard(actor, html){
  await ChatMessage.create({
    content: `<div class="sr5-monad-card"><h3>${escape(actor.name)}</h3>${html}</div>`,
    whisper: [...gmIds(), ...ownerIds(actor)],
  })
}

function coreParts(actor){
  return {
    willpower: num(actor.system.attributes?.willpower?.augmented?.value),
    firewall: num(actor.system.matrix?.attributes?.firewall?.value),
    cem: matrixEntityConcentration(actor),
  }
}

// The GM confirms the overflow; the pool is read from the actor, the roll is the GM's
async function resolveCore(row, message, actor){
  const parts = coreParts(actor)
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.format("SR5.MONAD_CoreFullTitle", {
        name: actor.name
      })
    },
    position: {
      width: 480
    },
    content: `<p>${game.i18n.localize("SR5.MONAD_CoreFullRule")}</p>
      <p>${game.i18n.format("SR5.MONAD_CorePool", parts)}</p>
      <div class="form-group"><label>${game.i18n.localize("SR5.MONAD_Surplus")}</label><input type="number" name="surplus" min="0" value="${boundCount(row.dataset.surplus)}"></div>
      ${row.dataset.fromPlayer === "1" ? `<p><em>${game.i18n.localize("SR5.MONAD_SurplusFromPlayer")}</em></p>` : ""}
      <div class="form-group"><label>${game.i18n.localize("SR5.MONAD_Extra")}</label><input type="number" name="extra" value="0"></div>`,
    ok: {
      label: game.i18n.localize("SR5.MONAD_Roll"),
      callback: (event, button) => ({
        surplus: boundCount(button.form.elements.surplus.value),
        extra: Math.trunc(num(button.form.elements.extra.value)),
      })
    },
    rejectClose: false,
  })
  if (!data || !isActiveGM()) return false
  if (!game.messages.get(message.id)?.content.includes("data-sr5-monad")) return false
  const dicePool = coreDissipationPool({
    ...coreParts(actor), extra: data.extra
  })
  const roll = await rollPool(dicePool)
  const loss = naniteLossOnDissipation(data.surplus, roll.hits)
  const nanite = actor.system.specialAttributes.nanite
  const before = num(nanite.augmented?.value)
  const after = Math.max(0, before - loss)
  await actor.update({
    "system.specialAttributes.nanite.natural.base": naniteBaseAfterLoss(nanite.natural?.base, before, loss)
  })
  await resultCard(actor, `<p>${game.i18n.format("SR5.MONAD_CoreResult", {
    pool: dicePool, hits: roll.hits, surplus: data.surplus, loss, before, after
  })}</p><p class="sr5-monad-dice">[${(roll.dices ?? []).map(d => d.result).join(" ")}]</p>
    <p>${after > 0 ? game.i18n.format("SR5.MONAD_Sleeps", {
    hours: sleepHours(after)
  }) : game.i18n.localize("SR5.MONAD_Destroyed")}</p><p>${game.i18n.localize("SR5.MONAD_Ejected")}</p>`)
  return true
}

// The GM confirms; the losses are worked out from the actor at that moment
async function resolveSwarm(message, actor){
  const nanite = actor.system.specialAttributes.nanite
  const volume = num(nanite.augmented?.value)
  const loss = mentalLoss(volume)
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.format("SR5.MONAD_SwarmFullTitle", {
        name: actor.name
      })
    },
    content: `<p>${game.i18n.localize("SR5.MONAD_SwarmFullRule")}</p><p>${game.i18n.format("SR5.MONAD_SwarmConfirm", {
      volume, loss
    })}</p>`,
    rejectClose: false,
  })
  if (!ok || !isActiveGM()) return false
  if (!game.messages.get(message.id)?.content.includes("data-sr5-monad")) return false
  const update = {
    "system.specialAttributes.nanite.natural.base": naniteBaseAfterLoss(nanite.natural?.base, volume, volume)
  }
  for (const key of MENTAL_ATTRIBUTES) {
    const attribute = actor.system.attributes[key]
    update[`system.attributes.${key}.natural.base`] = baseAfterLoss(attribute?.natural?.base, attribute?.natural?.value, loss)
  }
  await actor.update(update)
  await resultCard(actor, `<p>${game.i18n.format("SR5.MONAD_SwarmResult", {
    volume, loss
  })}</p><p>${game.i18n.localize("SR5.MONAD_SwarmReminders")}</p>`)
  return true
}

const resolving = new Set()

export function activateMonadListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-monad]")
  if (!game.user.isGM || !cardFromGM(message)) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-monad-row")
    if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.MONAD_ActiveGMOnly"))
    if (resolving.has(message.id)) return
    resolving.add(message.id)
    btn.disabled = true
    try {
      const actor = await fromUuid(row.dataset.actorUuid)
      if (!isOriginalStrainMonad(actor)) return ui.notifications.warn(game.i18n.localize("SR5.MONAD_Gone"))
      const done = row.dataset.kind === "core" ? await resolveCore(row, message, actor) : await resolveSwarm(message, actor)
      if (done) await markRowDoneInMessage(row, "[data-sr5-monad]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    } catch (e) {
      SR5_SystemHelpers.srLog(1, `Monad card not applied: ${e}`)
    } finally {
      resolving.delete(message.id)
      btn.disabled = false
    }
  }))
}

export function initMonadMatrix(){
  Hooks.on("updateActor", (actor, changes, options, userId) => offerCore(actor, changes, options, userId)?.catch?.(e => SR5_SystemHelpers.srLog(1, `Monad Core card not offered: ${e}`)))
  Hooks.on("updateItem", (item, changes) => offerSwarm(item, changes)?.catch?.(e => SR5_SystemHelpers.srLog(1, `Monad swarm card not offered: ${e}`)))
}
