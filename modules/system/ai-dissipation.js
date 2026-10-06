// Dissipation of an AI (Data Trails p. 161). When the matrix or core monitor of an AI fills, it is dissipated: it always
// loses 1 point of Essence, and resists the overflow of the attack with Willpower + Depth (+ the Firewall of its device
// when it ran on one that is not bricked); each box not resisted costs one more point of Essence. A bricked device adds
// its Device Rating to the Essence to resist. It also loses 1 point of Depth (minimum 1) and a random advanced program.
// The system cannot know the overflow for sure (the damage card can be forged): the active GM's client offers the
// dissipation on a card, the GM confirms the overflow, and the pool is read from the actor when the GM rolls.
// The advanced program, the Fragmentation trait and the Edge burnt to escape are left to the GM, as the card says.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0

// The overflow and the extra dice the GM types are whole numbers in a sane range
export function boundCount(value, max = 50){
  return Math.max(0, Math.min(max, Math.trunc(num(value))))
}

export function dissipationPool({
  willpower, depth, firewall = 0, extra = 0
}){
  return Math.max(0, num(willpower) + num(depth) + num(firewall) + num(extra))
}

// What must be resisted: the overflow, plus the Device Rating of a bricked device. The book says the AI resists "also"
// a loss equal to the Device Rating: read as added to the overflow (reading to be confirmed by DjamZ)
export function essenceToResist({
  surplus, bricked = false, deviceRating = 0
}){
  return boundCount(surplus) + (bricked ? boundCount(deviceRating) : 0)
}

// Always 1, plus each point not resisted
export function dissipationEssenceLoss(toResist, hits){
  return 1 + Math.max(0, num(toResist) - num(hits))
}

// The Essence base after the loss: the value never goes below 0
export function essenceBaseAfterLoss(essence, loss){
  return num(essence?.base) - Math.min(num(loss), Math.max(0, num(essence?.value)))
}

// The Depth base after the loss of one point, the value never under 1
export function depthBaseAfterLoss(depth){
  return num(depth?.augmented?.value) > 1 ? num(depth?.natural?.base) - 1 : num(depth?.natural?.base)
}

export function isAI(actor){
  return (actor?.type === "actorPc" || actor?.type === "actorGrunt") && actor.system?.activeSpecialAttribute === "depth"
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
const isFull = (monitor) => !!monitor && monitor.value > 0 && monitor.actual?.base >= monitor.value

// Where the AI was when it was dissipated, read by the GM: the device named by the damage is believed only if it
// belongs to the AI and its matrix monitor is full. Its update may still be on its way: give it a moment
export async function dissipationContext(actor, hint = {
}){
  let device = hint.itemUuid ? await fromUuid(hint.itemUuid).catch(() => null) : null
  if (device && (device.type !== "itemDevice" || device.actor?.id !== actor.id)) device = null
  if (device) for (let i = 0; i < 20 && !isFull(device.system.conditionMonitors?.matrix); i++) await new Promise(r => setTimeout(r, 100))
  if (device && isFull(device.system.conditionMonitors?.matrix)) return {
    bricked: true, deviceName: device.name, deviceRating: boundCount(device.system.deviceRating, 20), onDevice: true
  }
  const active = actor.items.find(i => i.type === "itemDevice" && i.system.isActive)
  return {
    bricked: false, deviceName: active?.name ?? "", deviceRating: 0, onDevice: !!active
  }
}

// The pool, read from the actor when the GM rolls
function poolParts(actor, context){
  const willpower = num(actor.system.attributes?.willpower?.augmented?.value)
  const depth = num(actor.system.specialAttributes?.depth?.augmented?.value)
  const firewall = (context.onDevice && !context.bricked) ? num(actor.system.matrix?.attributes?.firewall?.value) : 0
  return {
    willpower, depth, firewall
  }
}

function poolLabel(parts){
  let label = `${game.i18n.localize("SR5.Willpower")} ${parts.willpower} + ${game.i18n.localize("SR5.Depth")} ${parts.depth}`
  if (parts.firewall) label += ` + ${game.i18n.localize("SR5.Firewall")} ${parts.firewall}`
  return label
}

// A "dead" status lands on an AI: the active GM is offered the dissipation, once per status
async function offerDissipation(effect){
  if (!isActiveGM() || !effect?.statuses?.has?.("dead")) return
  const actor = effect.parent
  if (!(actor instanceof Actor) || !isAI(actor)) return
  const hint = effect.flags?.sr5?.aiDissipation ?? {
  }
  const context = await dissipationContext(actor, hint)
  const where = context.bricked ? game.i18n.format("SR5.AIDISSIPATION_Bricked", {
    device: escape(context.deviceName), rating: context.deviceRating
  }) : game.i18n.localize(context.onDevice ? "SR5.AIDISSIPATION_OnDevice" : "SR5.AIDISSIPATION_NoDevice")
  await ChatMessage.create({
    content: `<div class="sr5-ai-dissipation-card"><h3>${game.i18n.format("SR5.AIDISSIPATION_Title", {
      name: escape(actor.name)
    })}</h3>
      <p>${where}</p><p>${game.i18n.localize("SR5.AIDISSIPATION_EdgeEscape")}</p><ul>
      <li class="sr5-ai-dissipation-row" data-actor-uuid="${escape(actor.uuid)}" data-surplus="${boundCount(hint.surplus)}" data-bricked="${context.bricked ? 1 : 0}" data-device-rating="${context.deviceRating}" data-on-device="${context.onDevice ? 1 : 0}">
      <button type="button" data-sr5-ai-dissipation="resolve">${game.i18n.localize("SR5.AIDISSIPATION_Resolve")}</button></li></ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        aiDissipationCard: true
      }
    },
  })
}

const resolving = new Set()

// The GM confirms the overflow; the pool is the actor's, the roll the GM's
async function resolveDissipation(row, message){
  const actor = await fromUuid(row.dataset.actorUuid)
  if (!actor || !isAI(actor)) return ui.notifications.warn(game.i18n.localize("SR5.AIDISSIPATION_Gone"))
  const context = {
    bricked: row.dataset.bricked === "1", onDevice: row.dataset.onDevice === "1", deviceRating: boundCount(row.dataset.deviceRating, 20)
  }
  const parts = poolParts(actor, context)
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.format("SR5.AIDISSIPATION_Title", {
        name: actor.name
      })
    },
    position: {
      width: 480
    },
    content: `<p>${game.i18n.localize("SR5.AIDISSIPATION_Rule")}</p>
      <p>${game.i18n.format("SR5.AIDISSIPATION_Pool", {
    pool: escape(poolLabel(parts))
  })}</p>
      <div class="form-group"><label>${game.i18n.localize("SR5.AIDISSIPATION_Surplus")}</label><input type="number" name="surplus" min="0" value="${boundCount(row.dataset.surplus)}"></div>
      ${context.bricked ? `<p>${game.i18n.format("SR5.AIDISSIPATION_DeviceRatingAdded", {
    rating: context.deviceRating
  })}</p>` : ""}
      <div class="form-group"><label>${game.i18n.localize("SR5.AIDISSIPATION_Extra")}</label><input type="number" name="extra" value="0"></div>`,
    ok: {
      label: game.i18n.localize("SR5.AIDISSIPATION_Roll"),
      callback: (event, button) => ({
        surplus: boundCount(button.form.elements.surplus.value),
        extra: Math.trunc(num(button.form.elements.extra.value)),
      })
    },
    rejectClose: false,
  })
  if (!data || !isActiveGM()) return false
  // Applied once: the button is gone from a card already resolved
  if (!game.messages.get(message.id)?.content.includes("data-sr5-ai-dissipation")) return false
  const fresh = poolParts(actor, context)
  const dicePool = dissipationPool({
    ...fresh, extra: data.extra
  })
  const toResist = essenceToResist({
    surplus: data.surplus, bricked: context.bricked, deviceRating: context.deviceRating
  })
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  const roll = await SR5_RollTest.rollDice({
    dicePool
  })
  const loss = dissipationEssenceLoss(toResist, roll.hits)
  const essence = actor.system.essence, depth = actor.system.specialAttributes.depth
  const oldEssence = num(essence?.value), oldDepth = num(depth?.augmented?.value)
  await actor.update({
    "system.essence.base": essenceBaseAfterLoss(essence, loss),
    "system.specialAttributes.depth.natural.base": depthBaseAfterLoss(depth),
  })
  const newEssence = Math.max(0, oldEssence - loss)
  const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id)
  await ChatMessage.create({
    content: `<div class="sr5-ai-dissipation-card"><h3>${game.i18n.format("SR5.AIDISSIPATION_Title", {
      name: escape(actor.name)
    })}</h3>
      <p>${game.i18n.format("SR5.AIDISSIPATION_Result", {
    pool: dicePool, hits: roll.hits, toResist, loss
  })}</p>
      <p class="sr5-ai-dissipation-dice">[${(roll.dices ?? []).map(d => d.result).join(" ")}]</p>
      <p>${game.i18n.format("SR5.AIDISSIPATION_Applied", {
    oldEssence, newEssence, oldDepth, newDepth: Math.max(1, oldDepth - 1)
  })}</p>
      <p>${game.i18n.localize(newEssence <= 0 ? "SR5.AIDISSIPATION_Destroyed" : "SR5.AIDISSIPATION_Reminders")}</p></div>`,
    whisper: [...gmIds(), ...owners],
  })
  return true
}

export function activateAIDissipationListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-ai-dissipation]")
  if (!game.user.isGM || !cardFromGM(message)) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-ai-dissipation-row")
    if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.AIDISSIPATION_ActiveGMOnly"))
    if (resolving.has(message.id)) return
    resolving.add(message.id)
    btn.disabled = true
    try {
      const done = await resolveDissipation(row, message)
      if (done) await markRowDoneInMessage(row, "[data-sr5-ai-dissipation]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    } catch (e) {
      SR5_SystemHelpers.srLog(1, `AI dissipation not applied: ${e}`)
    } finally {
      resolving.delete(message.id)
      btn.disabled = false
    }
  }))
}

export function initAIDissipation(){
  Hooks.on("createActiveEffect", (effect) => offerDissipation(effect).catch(e => SR5_SystemHelpers.srLog(1, `AI dissipation not offered: ${e}`)))
}
