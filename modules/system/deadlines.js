// Dated deadlines on the world clock: the next withdrawal test of an addiction (SR5 p. 79-80) and the end of
// the months of rent paid in advance (SR5 p. 377). When the clock passes one, the GM gets one card listing them,
// with the action to take as a button. Nothing is rolled or debited without that click.
import {
  calendarStartYear, worldTimeToComponents, componentsToWorldTime
} from "./calendar.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"

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

export function addMonths(time, n, startYear){
  const c = worldTimeToComponents(time, startYear)
  const months = c.month + n
  return componentsToWorldTime({
    ...c, year: c.year + Math.floor(months / 12), month: ((months % 12) + 12) % 12
  }, startYear)
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
  return game.i18n.format("SR5.CALENDAR_DeadlineRent", {
    actor: escape(r.actor.name), name: escape(r.label), price: r.price.toLocaleString()
  })
}

function rowData(r){
  const base = `data-kind="${r.kind}" data-actor-uuid="${r.actor.uuid}"`
  return r.kind === "addiction" ? `${base} data-index="${r.index}" data-name="${escape(r.label)}"` : `${base} data-item-id="${r.item.id}"`
}

async function postDeadlineCard(rows){
  const list = rows.map(r => `<li class="sr5-deadline-row" ${rowData(r)}>
      <span class="sr5-deadline-text">${rowText(r)}</span>
      <span class="sr5-deadline-due">${fmt(r.due)}</span>
      <span class="sr5-deadline-buttons">
        <button type="button" data-sr5-deadline="act">${game.i18n.localize(r.kind === "addiction" ? "SR5.CALENDAR_DeadlineRollWithdrawal" : "SR5.CALENDAR_DeadlinePayRent")}</button>
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
  for (const pool of pools) await actor.rollTest("addictionTest", `${pool}_${index}`)
  // The next test comes one interval after this one
  const interval = WITHDRAWAL_INTERVALS[a.level]
  if (interval) a.nextWithdrawal = addInterval(a.nextWithdrawal ?? game.time.worldTime, interval, calendarStartYear())
  a.withdrawalNotified = false
  await actor.update({
    "system.addictions": addictions
  }, {
    sr5Calendar: true
  })
  return true
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

export function activateDeadlineCardListeners(html){
  if (!game.user.isGM) return html.querySelectorAll("[data-sr5-deadline]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-deadline]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-deadline-row")
    btn.disabled = true
    const action = btn.dataset.sr5Deadline === "reveal" ? revealRow : (row.dataset.kind === "addiction" ? rollWithdrawal : payRent)
    const done = await action(row).catch(e => SR5_SystemHelpers.srLog(1, `Deadline action failed: ${e}`))
    if (done) btn.remove()
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
  Hooks.on("updateWorldTime", () => queueCheck())
  if (isWriter()) queueCheck()
}
