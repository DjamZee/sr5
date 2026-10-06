// Essence Loss weakness of the Infected (SR5 p. 403): the stolen Essence goes, one point per lunar month. Every use
// of a power that is not automatic hastens the loss by one week. At 0 the creature dies in (Body + Willpower) days
// unless it feeds. Dark Terrors adds no cycle of its own.
// The clock lives in a hidden world setting written by the active GM alone, never on the actor or on a chat card:
// a player owns both. Essence moves only on a click of the GM, and is read from the actor by the GM's client.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

export const HUNGER_LEDGER = "sr5HungerLedger"
export const HUNGER_MONTH_SETTING = "sr5HungerMonthDays"

export const DAY = 86400
export const WEEK = 7 * DAY
// A synodic month (SR5 p. 403 says "lunar month" without a number of days): a world setting, this by default
export const LUNAR_MONTH_DAYS = 29.5

export function monthSeconds(days){
  const d = Number(days)
  return Math.round((d > 0 ? d : LUNAR_MONTH_DAYS) * DAY)
}

export function newHunger({
  actorUuid, actorName, now, month
}){
  return {
    actorUuid, actorName, nextLoss: now + month, pending: 0, deadline: null, deadlineNotified: false,
  }
}

// A power that is not automatic was used: the next loss comes one week sooner per use
export function hasten(entry, uses = 1){
  return {
    ...entry, nextLoss: entry.nextLoss - Math.max(0, Math.floor(uses)) * WEEK
  }
}

// The losses the clock went past since the last check, and when the next one falls
export function lossesDue(entry, now, month){
  let next = entry.nextLoss
  let count = 0
  while (next <= now){
    count++
    next += month
  }
  return {
    count, nextLoss: next
  }
}

// The Essence once the pending losses are applied, never below 0
export function essenceAfter(essence, losses){
  return Math.max(0, (Number(essence) || 0) - Math.max(0, losses))
}

// At 0 Essence: dead in (Body + Willpower) days unless fed (SR5 p. 403)
export function deadlineFrom(now, body, willpower){
  return now + Math.max(0, (Number(body) || 0) + (Number(willpower) || 0)) * DAY
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function hungerLedger(){
  try {
    return game.settings.get("sr5", HUNGER_LEDGER) ?? {
      creatures: {
      }
    }
  } catch {
    return {
      creatures: {
      }
    }
  }
}

export function hungerOf(actorUuid){
  return hungerLedger().creatures?.[actorUuid] ?? null
}

async function writeLedger(mutate){
  if (!isActiveGM()) return false
  const ledger = foundry.utils.duplicate(hungerLedger())
  ledger.creatures ??= {
  }
  mutate(ledger.creatures)
  await game.settings.set("sr5", HUNGER_LEDGER, ledger)
  return true
}

const month = () => monthSeconds(game.settings.get("sr5", HUNGER_MONTH_SETTING))
const fmt = (t) => game.time.calendar.format(t)
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

/* The sheet ----------------------------------- */

// What the essence block of the sheet shows to the GM
export function hungerStatus(actor){
  const entry = actor?.uuid ? hungerOf(actor.uuid) : null
  if (!entry) return {
    tracked: false
  }
  return {
    tracked: true,
    nextLoss: fmt(entry.nextLoss),
    pending: entry.pending,
    deadline: entry.deadline ? fmt(entry.deadline) : null,
  }
}

export async function toggleHunger(actor){
  if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.HUNGER_ActiveGMOnly"))
  const tracked = !!hungerOf(actor.uuid)
  await writeLedger(c => {
    if (tracked) delete c[actor.uuid]
    else c[actor.uuid] = newHunger({
      actorUuid: actor.uuid, actorName: actor.name, now: game.time.worldTime, month: month()
    })
  })
  await queueCheck()
}

export async function hastenHunger(actor){
  if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.HUNGER_ActiveGMOnly"))
  return hastenByUuid(actor.uuid)
}

async function hastenByUuid(uuid){
  if (!isActiveGM()) return false
  const entry = hungerOf(uuid)
  if (!entry) return true
  await writeLedger(c => {
    c[uuid] = hasten(entry, 1)
  })
  await queueCheck()
  return true
}

// A power that needs an action draws on the Essence (SR5 p. 403); automatic and permanent ones do not
export function powerHastens(item){
  if (item?.type !== "itemPower") return false
  const a = item.system?.actionType
  return !!a && a !== "automatic" && a !== "permanent"
}

/* A power used ------------------------------- */

// A roll card of a power: the GM is offered "+1 week", never applied for him. Only the identity of the power is
// read from the card; the action type comes from the item itself, and the author must own its actor
async function offerHasten(message){
  if (!isActiveGM()) return
  const data = message.flags?.sr5data
  if (data?.test?.type !== "power" || !data.owner?.itemUuid) return
  const item = fromUuidSync(data.owner.itemUuid)
  const actor = item?.parent
  if (!actor || !powerHastens(item) || !hungerOf(actor.uuid)) return
  if (!message.author || !actor.testUserPermission(message.author, "OWNER")) return
  await postCard([{
    uuid: actor.uuid, text: game.i18n.format("SR5.HUNGER_PowerUsed", {
      actor: escape(actor.name), power: escape(item.name)
    }), button: "hasten"
  }])
}

/* The clock ----------------------------------- */

export async function checkHunger(){
  if (!isActiveGM()) return
  const now = game.time.worldTime
  const m = month()
  const rows = []
  const next = foundry.utils.duplicate(hungerLedger())
  for (const [uuid, entry] of Object.entries(next.creatures ?? {
  })){
    const due = lossesDue(entry, now, m)
    if (due.count){
      entry.nextLoss = due.nextLoss
      entry.pending += due.count
      rows.push({
        uuid, text: game.i18n.format("SR5.HUNGER_Loss", {
          actor: escape(entry.actorName), n: entry.pending
        }), button: true
      })
    }
    // Fed since it fell to 0: the countdown stops
    if (entry.deadline){
      const actor = fromUuidSync(uuid)
      if (actor && actor.system.essence?.value > 0){
        entry.deadline = null
        entry.deadlineNotified = false
      } else if (!entry.deadlineNotified && entry.deadline <= now){
        entry.deadlineNotified = true
        rows.push({
          uuid, text: game.i18n.format("SR5.HUNGER_Dead", {
            actor: escape(entry.actorName)
          }), button: false
        })
      }
    }
  }
  if (!rows.length && JSON.stringify(next) === JSON.stringify(hungerLedger())) return
  await game.settings.set("sr5", HUNGER_LEDGER, next)
  if (rows.length) await postCard(rows)
}

async function postCard(rows){
  const list = rows.map(r => `<li class="sr5-hunger-row" data-actor-uuid="${escape(r.uuid)}">
      <span>${r.text}</span>
      ${r.button === "hasten" ? `<button type="button" data-sr5-hunger-apply="hasten">${game.i18n.localize("SR5.HUNGER_Hasten")}</button>` :
    (r.button ? `<button type="button" data-sr5-hunger-apply="loss">${game.i18n.localize("SR5.HUNGER_Apply")}</button>` : "")}
    </li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-hunger-card"><h3>${game.i18n.localize("SR5.HUNGER_Title")}</h3><ul>${list}</ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        hungerDue: true
      }
    },
  })
}

// The GM applies the losses the ledger holds: the card only says which creature, never how much
async function applyPending(uuid){
  if (!isActiveGM()) return false
  const entry = hungerOf(uuid)
  if (!entry || !entry.pending) return true
  const actor = await fromUuid(uuid)
  if (!actor) return false
  const essence = essenceAfter(actor.system.essence?.value, entry.pending)
  const lost = (actor.system.essence?.value ?? 0) - essence
  await actor.update({
    "system.essence.base": (actor.system.essence?.base ?? 0) - lost
  })
  const now = game.time.worldTime
  const a = actor.system.attributes
  await writeLedger(c => {
    const e = c[uuid]
    if (!e) return
    e.pending = 0
    if (essence <= 0 && !e.deadline){
      e.deadline = deadlineFrom(now, a?.body?.augmented?.value, a?.willpower?.augmented?.value)
      e.deadlineNotified = false
    }
  })
  if (essence <= 0) await ChatMessage.create({
    content: `<div class="sr5-hunger-card"><h3>${game.i18n.localize("SR5.HUNGER_Title")}</h3><p>${game.i18n.format("SR5.HUNGER_Zero", {
      actor: escape(actor.name), date: fmt(hungerOf(uuid)?.deadline ?? now)
    })}</p></div>`,
    whisper: gmIds(),
  })
  return true
}

export function activateHungerListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-hunger-apply]")
  if (!game.user.isGM || !cardFromGM(message)) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-hunger-row")
    btn.disabled = true
    const act = btn.dataset.sr5HungerApply === "hasten" ? hastenByUuid : applyPending
    const done = await act(row.dataset.actorUuid).catch(e => SR5_SystemHelpers.srLog(1, `Hunger not applied: ${e}`))
    if (done) await markRowDoneInMessage(row, "[data-sr5-hunger-apply]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}

/* -------------------------------------------- */

let checking = null
let again = false
function queueCheck(){
  if (checking){
    again = true
    return checking
  }
  checking = (async () => {
    do {
      again = false
      await checkHunger().catch(e => SR5_SystemHelpers.srLog(1, `Hunger not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

export function initHunger(){
  Hooks.on("updateWorldTime", () => queueCheck())
  Hooks.on("createChatMessage", (message) => offerHasten(message).catch(e => SR5_SystemHelpers.srLog(1, `Hunger offer failed: ${e}`)))
  //The sheets of the tracked creatures show the next loss
  //(the first write of the ledger creates the setting: "createSetting", not "updateSetting")
  const redraw = (setting) => {
    if (setting.key !== `sr5.${HUNGER_LEDGER}`) return
    for (const actor of Object.values(ui.windows ?? {
    }).concat([...foundry.applications.instances.values()]).map(app => app.actor).filter(Boolean)) {
      actor.sheet?.rendered && actor.sheet.render(false)
    }
  }
  Hooks.on("updateSetting", redraw)
  Hooks.on("createSetting", redraw)
}

export function registerHungerSettings(){
  game.settings.register("sr5", HUNGER_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      creatures: {
      }
    },
  })
  game.settings.register("sr5", HUNGER_MONTH_SETTING, {
    name: "SR5.SETTINGS_HungerMonth_T",
    hint: "SR5.SETTINGS_HungerMonth_D",
    scope: "world",
    config: true,
    type: Number,
    default: LUNAR_MONTH_DAYS,
  })
}
