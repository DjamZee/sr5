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

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

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
