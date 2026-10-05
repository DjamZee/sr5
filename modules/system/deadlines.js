// Dated deadlines on the world clock: the next withdrawal test of an addiction (SR5 p. 79-80) and the end of
// the months of rent paid in advance (SR5 p. 377). When the clock passes one, the GM gets one card listing them,
// with the action to take as a button. Nothing is rolled or debited without that click.
import {
  calendarStartYear, addCalendarMonths
} from "./calendar.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"
import {
  ORDERS_FLAG, freshlyDue, deliverOrder
} from "../interface/shop-orders.js"

export const REVEAL_DEADLINES_SETTING = "sr5CalendarRevealDeadlines"
const DAY = 86400

// Mild: once a month; moderate: about every two weeks; severe: once a week; burnout: every day (SR5 p. 79-80)
export const WITHDRAWAL_INTERVALS = {
  mild: {
    months: 1
  },
  moderate: {
    days: 14
  },
  severe: {
    days: 7
  },
  burnout: {
    days: 1
  },
}

// Calendar months, capped at the last day of the month (calendar.js)
export function addMonths(time, n, startYear){
  return addCalendarMonths(time, n, startYear)
}

export function addInterval(time, interval, startYear){
  if (interval?.months) return addMonths(time, interval.months, startYear)
  return time + (interval?.days ?? 0) * DAY
}

// Months still paid at a given time: how many month starts, from now on, fall before the end of the rent
export function monthsLeft(now, paidUntil, startYear){
  let n = 0
  while (n < 1200 && addMonths(now, n, startYear) < paidUntil) n++
  return n
}

export function withdrawalDue(addiction){
  return !!WITHDRAWAL_INTERVALS[addiction?.level]
}

// The rent counts down when it is rented (not bought) and has an end
export function rentCounts(system){
  return !system?.rent?.bought && system?.rent?.paidUntil !== null && system?.rent?.paidUntil !== undefined
}

/* -------------------------------------------- */

function isWriter(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function allActors(){
  const actors = new Set(game.actors)
  for (const scene of game.scenes){
    for (const token of scene.tokens){
      if (!token.actorLink && token.actor) actors.add(token.actor)
    }
  }
  return [...actors]
}

const fmt = (t) => game.time.calendar.format(t)

// Stamps what has no date yet, counts the rent down, and returns the deadlines the clock has just passed
async function collect(actor, now, startYear){
  const rows = []
  // Addictions: the first withdrawal test falls one interval after the clock first sees the addiction
  const addictions = foundry.utils.duplicate(actor.system?.addictions ?? [])
  let changed = false
  addictions.forEach((a, index) => {
    if (!withdrawalDue(a)) return
    if (a.nextWithdrawal === undefined || a.nextWithdrawal === null){
      a.nextWithdrawal = addInterval(now, WITHDRAWAL_INTERVALS[a.level], startYear)
      changed = true
    }
    if (now >= a.nextWithdrawal && !a.withdrawalNotified){
      a.withdrawalNotified = true
      changed = true
      rows.push({
        kind: "addiction", actor, index, label: a.name, due: a.nextWithdrawal,
        level: a.level, pools: a.addiction?.type,
      })
    }
    else if (now < a.nextWithdrawal && a.withdrawalNotified){
      a.withdrawalNotified = false
      changed = true
    }
  })
  if (changed) await actor.update({
    "system.addictions": addictions
  }, {
    sr5Calendar: true
  })

  // Lifestyles rented: the months paid count down, and the end of them is a deadline
  for (const item of actor.items.filter(i => i.type === "itemLifestyle" && !i.system.rent?.bought)){
    const rent = item.system.rent
    if ((rent.paidUntil === null || rent.paidUntil === undefined)){
      if (Number(rent.duration) > 0) await item.update({
        "system.rent.paidUntil": addMonths(now, Number(rent.duration), startYear)
      }, {
        sr5Calendar: true
      })
      continue
    }
    const left = monthsLeft(now, rent.paidUntil, startYear)
    const notified = !!item.flags?.sr5?.rentNotified
    const update = {
    }
    if (left !== rent.duration) update["system.rent.duration"] = left
    if (now >= rent.paidUntil && !notified){
      update["flags.sr5.rentNotified"] = true
      rows.push({
        kind: "rent", actor, item, label: item.name, due: rent.paidUntil, price: Number(item.system.price?.value) || 0,
      })
    }
    else if (now < rent.paidUntil && notified) update["flags.sr5.rentNotified"] = false
    if (Object.keys(update).length) await item.update(update, {
      sr5Calendar: true
    })
  }

  // Shop orders (SR5 p. 420): once found, the goods wait for the GM's click to reach the sheet
  const orders = actor.getFlag?.("sr5", ORDERS_FLAG) ?? []
  const arrived = freshlyDue(orders, now)
  if (arrived.length){
    for (const order of arrived) rows.push({
      kind: "delivery", actor, orderId: order.id, label: order.quantity > 1 ? `${order.name} (x${order.quantity})` : order.name,
      due: order.due,
    })
    const ids = new Set(arrived.map(o => o.id))
    await actor.setFlag("sr5", ORDERS_FLAG, orders.map(o => ids.has(o.id) ? {
      ...o, notified: true
    } : o))
  }
  return rows
}

export async function checkDeadlines(){
  if (!isWriter()) return
  const startYear = calendarStartYear()
  const now = game.time.worldTime
  const rows = []
  for (const actor of allActors()) rows.push(...await collect(actor, now, startYear))
  if (!rows.length) return
  await postDeadlineCard(rows)
  if (game.settings.get("sr5", REVEAL_DEADLINES_SETTING)) await revealToOwners(rows)
}

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
      await checkDeadlines().catch(e => SR5_SystemHelpers.srLog(1, `Deadlines not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

/* -------------------------------------------- */

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

function rowText(r){
  if (r.kind === "addiction") return game.i18n.format("SR5.CALENDAR_DeadlineAddiction", {
    actor: escape(r.actor.name), name: escape(r.label), level: game.i18n.localize(CONFIG.SR5?.addictionLevels?.[r.level] ?? r.level)
  })
  if (r.kind === "delivery") return game.i18n.format("SR5.CALENDAR_DeadlineDelivery", {
    actor: escape(r.actor.name), name: escape(r.label)
  })
  return game.i18n.format("SR5.CALENDAR_DeadlineRent", {
    actor: escape(r.actor.name), name: escape(r.label), price: r.price.toLocaleString()
  })
}

function rowData(r){
  const base = `data-kind="${r.kind}" data-actor-uuid="${r.actor.uuid}"`
  if (r.kind === "delivery") return `${base} data-order-id="${r.orderId}"`
  return r.kind === "addiction" ? `${base} data-index="${r.index}" data-name="${escape(r.label)}"` : `${base} data-item-id="${r.item.id}"`
}

const ACTION_LABELS = {
  addiction: "SR5.CALENDAR_DeadlineRollWithdrawal",
  rent: "SR5.CALENDAR_DeadlinePayRent",
  delivery: "SR5.CALENDAR_DeadlineDeliver",
}

async function postDeadlineCard(rows){
  const list = rows.map(r => `<li class="sr5-deadline-row" ${rowData(r)}>
      <span class="sr5-deadline-text">${rowText(r)}</span>
      <span class="sr5-deadline-due">${fmt(r.due)}</span>
      <span class="sr5-deadline-buttons">
        <button type="button" data-sr5-deadline="act">${game.i18n.localize(ACTION_LABELS[r.kind])}</button>
        <button type="button" data-sr5-deadline="reveal">${game.i18n.localize("SR5.CALENDAR_DeadlineReveal")}</button>
      </span>
    </li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-deadline-card"><h3>${game.i18n.localize("SR5.CALENDAR_DeadlineTitle")}</h3>
      <p>${game.i18n.format("SR5.CALENDAR_DeadlineIntro", {
    date: fmt(game.time.worldTime)
  })}</p><ul>${list}</ul></div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: {
      sr5: {
        deadlines: true
      }
    },
  })
}

function playerOwners(actor){
  return game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id)
}

// The player of the character sees the deadline as text, without the GM's buttons
async function revealToOwners(rows){
  const byActor = new Map()
  for (const r of rows){
    const owners = playerOwners(r.actor)
    if (!owners.length) continue
    const key = r.actor.uuid
    if (!byActor.has(key)) byActor.set(key, {
      owners, rows: []
    })
    byActor.get(key).rows.push(r)
  }
  for (const {
    owners, rows: list
  } of byActor.values()){
    await ChatMessage.create({
      content: `<div class="sr5-deadline-card"><h3>${game.i18n.localize("SR5.CALENDAR_DeadlineTitle")}</h3><ul>${list.map(r =>
        `<li>${rowText(r)} — ${fmt(r.due)}</li>`).join("")}</ul></div>`,
      whisper: [...owners, ...ChatMessage.getWhisperRecipients("GM").map(u => u.id)],
    })
  }
}

/* -------------------------------------------- */

async function rollWithdrawal(row){
  const actor = await fromUuid(row.dataset.actorUuid)
  const index = Number(row.dataset.index)
  const addictions = foundry.utils.duplicate(actor?.system?.addictions ?? [])
  const a = addictions[index]
  if (!a || a.name !== row.dataset.name) return ui.notifications.warn(game.i18n.localize("SR5.WARN_AddictionNotFound"))
  const pools = a.addiction?.type === "both" ? ["physiological", "psychological"] : [a.addiction?.type || "physiological"]
  // The deadline moves on once a withdrawal roll is in the chat, not when its window opens: a window closed
  // without rolling leaves the deadline where it is
  const done = new Promise(resolve => {
    const hookId = Hooks.on("createChatMessage", (message) => {
      if (!isWithdrawalRollOf(message.flags?.sr5data, index, a.name)) return
      Hooks.off("createChatMessage", hookId)
      resolve(advanceWithdrawal(actor, index, a.name).then(() => markRowDone(row)))
    })
  })
  for (const pool of pools) await actor.rollTest("addictionTest", `${pool}_${index}_withdrawal`)
  done.catch(e => SR5_SystemHelpers.srLog(1, `Withdrawal deadline not moved: ${e}`))
  return false
}

// The card of a withdrawal roll for this addiction
export function isWithdrawalRollOf(data, index, name){
  return data?.test?.type === "addictionTest" && !!data?.various?.withdrawal &&
    data.various.addictionIndex === index && data.various.addictionName === name
}

// The next withdrawal test comes one interval after this one (SR5 p. 79-80)
async function advanceWithdrawal(actor, index, name){
  const addictions = foundry.utils.duplicate(actor.system?.addictions ?? [])
  const a = addictions[index]
  if (!a || a.name !== name) return
  const interval = WITHDRAWAL_INTERVALS[a.level]
  if (interval) a.nextWithdrawal = addInterval(a.nextWithdrawal ?? game.time.worldTime, interval, calendarStartYear())
  a.withdrawalNotified = false
  await actor.update({
    "system.addictions": addictions
  }, {
    sr5Calendar: true
  })
}

// One month of rent, taken from the character's nuyen as the shop does it (a "loss" transaction)
async function payRent(row){
  const actor = await fromUuid(row.dataset.actorUuid)
  const item = actor?.items.get(row.dataset.itemId)
  if (!item) return false
  const price = Number(item.system.price?.value) || 0
  const c = game.time.components
  const date = `${String(c.year).padStart(4, "0")}-${String(c.month + 1).padStart(2, "0")}-${String(c.dayOfMonth + 1).padStart(2, "0")}`
  await actor.createEmbeddedDocuments("Item", [{
    name: game.i18n.format("SR5.CALENDAR_RentTransaction", {
      name: item.name
    }),
    type: "itemNuyen",
    img: "systems/sr5/assets/img/items/itemNuyen.svg",
    system: {
      amount: price, type: "loss", date, description: "",
    },
  }])
  const startYear = calendarStartYear()
  const paidUntil = addMonths(item.system.rent.paidUntil ?? game.time.worldTime, 1, startYear)
  await item.update({
    "system.rent.paidUntil": paidUntil,
    "system.rent.duration": monthsLeft(game.time.worldTime, paidUntil, startYear),
    "flags.sr5.rentNotified": false,
  }, {
    sr5Calendar: true
  })
  return true
}

async function revealRow(row){
  const actor = await fromUuid(row.dataset.actorUuid)
  const owners = actor ? playerOwners(actor) : []
  if (!owners.length) return ui.notifications.warn(game.i18n.localize("SR5.CALENDAR_DeadlineNoPlayer"))
  await ChatMessage.create({
    content: `<div class="sr5-deadline-card"><h3>${game.i18n.localize("SR5.CALENDAR_DeadlineTitle")}</h3><p>${row.querySelector(".sr5-deadline-text")?.innerHTML ?? ""} — ${escape(row.querySelector(".sr5-deadline-due")?.textContent)}</p></div>`,
    whisper: [...owners, ...ChatMessage.getWhisperRecipients("GM").map(u => u.id)],
  })
  return true
}

// The action of a row ran: written in the card, so the button does not come back at the next render
function markRowDone(row){
  return markRowDoneInMessage(row, "[data-sr5-deadline=act]", game.i18n.localize("SR5.CALENDAR_RowDone"))
}

// The goods of a shop order reach the sheet (SR5 p. 420)
async function deliverRow(row){
  return deliverOrder(await fromUuid(row.dataset.actorUuid), row.dataset.orderId)
}

const ROW_ACTIONS = {
  addiction: rollWithdrawal, rent: payRent, delivery: deliverRow,
}

export function activateDeadlineCardListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-deadline]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-deadline]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-deadline-row")
    const reveal = btn.dataset.sr5Deadline === "reveal"
    btn.disabled = true
    const action = reveal ? revealRow : ROW_ACTIONS[row.dataset.kind]
    const done = await action(row).catch(e => SR5_SystemHelpers.srLog(1, `Deadline action failed: ${e}`))
    if (done && !reveal) await markRowDone(row)
    else if (done) btn.remove()
    else btn.disabled = false
  }))
}

export function registerDeadlineSettings(){
  game.settings.register("sr5", REVEAL_DEADLINES_SETTING, {
    name: "SR5.SETTINGS_CalendarRevealDeadlines_T",
    hint: "SR5.SETTINGS_CalendarRevealDeadlines_D",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  })
  // SR5 p. 417 asks for "the appropriate modifiers for the level of addiction" and never gives them.
  // Arbitrage de DjamZ (05/10): a world setting, none by default; the craving penalty of p. 79 as an option
  game.settings.register("sr5", "sr5WithdrawalModifier", {
    name: "SR5.SETTINGS_WithdrawalModifier_T",
    hint: "SR5.SETTINGS_WithdrawalModifier_D",
    scope: "world",
    config: true,
    type: String,
    default: "none",
    choices: {
      none: "SR5.SETTINGS_WithdrawalModifierNone",
      craving: "SR5.SETTINGS_WithdrawalModifierCraving",
    },
  })
}

export function initDeadlines(){
  // A GM who changes the months paid by hand starts them again from now
  Hooks.on("updateItem", (item, changes, options) => {
    if (options?.sr5Calendar || !isWriter() || item.type !== "itemLifestyle") return
    const months = changes.system?.rent?.duration
    if (months === undefined || item.system.rent.bought) return
    item.update({
      "system.rent.paidUntil": Number(months) > 0 ? addMonths(game.time.worldTime, Number(months), calendarStartYear()) : null,
      "flags.sr5.rentNotified": false,
    }, {
      sr5Calendar: true
    })
  })
  // A new addiction or lifestyle gets its date at once, not at the next move of the clock
  Hooks.on("updateActor", (actor, changes, options) => {
    if (!options?.sr5Calendar && (changes.system?.addictions || changes.flags?.sr5?.[ORDERS_FLAG])) queueCheck()
  })
  Hooks.on("createActor", (actor) => {
    if (actor.system?.addictions?.length) queueCheck()
  })
  Hooks.on("createItem", (item) => {
    if (item.type === "itemLifestyle" && item.parent) queueCheck()
  })
  Hooks.on("updateWorldTime", () => queueCheck())
  if (isWriter()) queueCheck()
}
