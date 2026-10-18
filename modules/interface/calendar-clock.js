// The Sixth World clock: date and time for everyone, at the top of the screen; buttons to advance the clock
// and a "go to" for the GM only. It reads game.time, so a calendar module, when active, keeps its own display.
// Each user shows it as an icon alone, as the date and time, or as the month with its events
import {
  thirdPartyCalendarModule, componentsToWorldTime, calendarStartYear, worldTimeToComponents
} from "../system/calendar.js"
import {
  getCalendarEvents, changeCalendarEvents, visibleEvents, eventsInMonth, monthGrid, upsertEvent, removeEvent,
  registerCalendarEventSettings, initCalendarEvents
} from "../system/calendar-events.js"
import {
  escape
} from "../system/card-helpers.js"

export const CLOCK_ID = "sr5-calendar-clock"
export const CLOCK_VIEW_SETTING = "sr5CalendarClockView"
export const CLOCK_VIEWS = ["collapsed", "compact", "month"]

// The GM's steps, in seconds
export const CLOCK_STEPS = [
  {
    key: "minute", seconds: 60, label: "SR5.CALENDAR_StepMinute"
  },
  {
    key: "tenMinutes", seconds: 600, label: "SR5.CALENDAR_StepTenMinutes"
  },
  {
    key: "hour", seconds: 3600, label: "SR5.CALENDAR_StepHour"
  },
  {
    key: "day", seconds: 86400, label: "SR5.CALENDAR_StepDay"
  },
  {
    key: "week", seconds: 604800, label: "SR5.CALENDAR_StepWeek"
  },
]

const pad = (n) => String(n).padStart(2, "0")

// "mercredi 1 janvier 2070" and "00:00:09": the names come already translated
export function formatClock(components, monthNames, weekdayNames){
  const c = components
  return {
    date: `${weekdayNames[c.dayOfWeek] ?? ""} ${c.dayOfMonth + 1} ${monthNames[c.month] ?? ""} ${c.year}`.trim(),
    time: `${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`,
  }
}

// The value of an <input type="datetime-local"> to world time, null when the input is not a date
export function parseDateTimeInput(value, startYear){
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value ?? "")
  if (!m) return null
  return componentsToWorldTime({
    year: Number(m[1]), month: Number(m[2]) - 1, dayOfMonth: Number(m[3]) - 1,
    hour: Number(m[4]), minute: Number(m[5]), second: Number(m[6] ?? 0),
  }, startYear)
}

export function dateTimeInputValue(c){
  return `${String(c.year).padStart(4, "0")}-${pad(c.month + 1)}-${pad(c.dayOfMonth + 1)}T${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`
}

// n months after (or before) a month, across the years
export function shiftMonth(year, month, n){
  const total = month + n
  return {
    year: year + Math.floor(total / 12), month: ((total % 12) + 12) % 12
  }
}

// "@UUID[JournalEntry.x.JournalEntryPage.y]{name}" or a bare uuid: the uuid
export function parseJournalLink(value){
  const text = String(value ?? "").trim()
  return /@UUID\[([^\]]+)\]/.exec(text)?.[1] ?? text
}

function names(list){
  return list.map(v => game.i18n.localize(v.name))
}

function viewMode(){
  try {
    const view = game.settings.get("sr5", CLOCK_VIEW_SETTING)
    return CLOCK_VIEWS.includes(view) ? view : "compact"
  } catch {
    return "compact"
  }
}

function iconButton(data, label, icon){
  const text = game.i18n.localize(label)
  return `<button type="button" ${data} data-tooltip="${text}" aria-label="${text}"><i class="${icon}"></i></button>`
}

// The month shown in the month view: the clock's month until someone browses
let shownMonth = null

function shownMonthOrClock(){
  const c = game.time.components
  return shownMonth ?? {
    year: c.year, month: c.month
  }
}

async function journalLink(uuid){
  if (!uuid) return ""
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]`)
}

async function monthPanel(components, monthNames){
  const isGM = game.user.isGM
  const startYear = calendarStartYear()
  const {
    year, month
  } = shownMonthOrClock()
  const events = eventsInMonth(visibleEvents(getCalendarEvents(), isGM), year, month, startYear)
  const days = new Set(events.map(e => worldTimeToComponents(e.date, startYear).dayOfMonth + 1))
  const today = components.year === year && components.month === month ? components.dayOfMonth + 1 : null
  const dayNames = game.time.calendar.days.values.map(v => game.i18n.localize(v.abbreviation))
  const monthAbbr = game.time.calendar.months.values.map(v => game.i18n.localize(v.abbreviation))
  const grid = monthGrid(year, month).map(week => `<tr>${week.map(d => {
    if (!d) return "<td></td>"
    const classes = [d === today ? "sr5-clock-today" : "", days.has(d) ? "sr5-clock-has-event" : ""].filter(Boolean).join(" ")
    return `<td class="${classes}" data-sr5-clock-day="${d}">${d}</td>`
  }).join("")}</tr>`).join("")
  const rows = []
  for (const e of events){
    const c = worldTimeToComponents(e.date, startYear)
    const gmOnly = e.visibility === "gm" ? `<i class="fa-solid fa-eye-slash" data-tooltip="${game.i18n.localize("SR5.CALENDAR_EventVisibilityGM")}"></i> ` : ""
    const tools = isGM ? `<span class="sr5-clock-event-tools">${iconButton(`data-sr5-clock-edit="${e.id}"`, "SR5.CALENDAR_EventEdit", "fa-solid fa-pen")}${iconButton(`data-sr5-clock-delete="${e.id}"`, "SR5.CALENDAR_EventDelete", "fa-solid fa-trash")}</span>` : ""
    rows.push(`<li class="sr5-clock-event"><span class="sr5-clock-event-date">${c.dayOfMonth + 1} ${monthAbbr[c.month] ?? ""} ${pad(c.hour)}:${pad(c.minute)}</span>
      <span class="sr5-clock-event-title">${gmOnly}${escape(e.title)} ${await journalLink(e.journal)}</span>${tools}</li>`)
  }
  const list = rows.length ? rows.join("") : `<li class="sr5-clock-event-none">${game.i18n.localize("SR5.CALENDAR_EventNone")}</li>`
  const add = isGM ? `<button type="button" class="sr5-clock-event-add" data-sr5-clock-add>${game.i18n.localize("SR5.CALENDAR_EventAdd")}</button>` : ""
  return `<div class="sr5-clock-month">
    <div class="sr5-clock-month-nav">${iconButton("data-sr5-clock-month=\"-1\"", "SR5.CALENDAR_MonthPrevious", "fa-solid fa-chevron-left")}
      <span class="sr5-clock-month-title">${monthNames[month] ?? ""} ${year}</span>
      ${iconButton("data-sr5-clock-month=\"1\"", "SR5.CALENDAR_MonthNext", "fa-solid fa-chevron-right")}
      ${iconButton("data-sr5-clock-month=\"0\"", "SR5.CALENDAR_MonthToday", "fa-solid fa-calendar-check")}</div>
    <table class="sr5-clock-grid"><thead><tr>${dayNames.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>${grid}</tbody></table>
    <ul class="sr5-clock-events">${list}</ul>${add}</div>`
}

let renderId = 0

async function render(){
  const id = ++renderId
  let el = document.getElementById(CLOCK_ID)
  if (!el){
    el = document.createElement("section")
    el.id = CLOCK_ID
    el.classList.add("sr5-calendar-clock")
    const parent = document.getElementById("ui-top") ?? document.body
    parent.append(el)
  }
  const view = viewMode()
  if (view === "collapsed"){
    el.dataset.view = view
    el.innerHTML = iconButton("data-sr5-clock-view=\"compact\"", "SR5.CALENDAR_ClockShow", "fa-solid fa-calendar")
    return
  }
  const cal = game.time.calendar
  const monthNames = names(cal.months.values)
  const text = formatClock(game.time.components, monthNames, names(cal.days.values))
  const views = `${iconButton("data-sr5-clock-view=\"collapsed\"", "SR5.CALENDAR_ClockHide", "fa-solid fa-eye-slash")}${view === "month" ?
    iconButton("data-sr5-clock-view=\"compact\"", "SR5.CALENDAR_ClockCompact", "fa-solid fa-compress") :
    iconButton("data-sr5-clock-view=\"month\"", "SR5.CALENDAR_ClockMonth", "fa-solid fa-calendar-days")}`
  const steps = game.user.isGM ? `<div class="sr5-clock-steps">${CLOCK_STEPS.map(s =>
    `<button type="button" data-sr5-clock-step="${s.seconds}" data-tooltip="${game.i18n.localize(s.label)}">+${game.i18n.localize(s.label + "Abbr")}</button>`).join("")}
    <button type="button" data-sr5-clock-goto data-tooltip="${game.i18n.localize("SR5.CALENDAR_GoTo")}" aria-label="${game.i18n.localize("SR5.CALENDAR_GoTo")}"><i class="fa-solid fa-calendar-day"></i></button></div>` : ""
  const month = view === "month" ? await monthPanel(game.time.components, monthNames) : ""
  //A newer render started while this one waited for the journal links
  if (id !== renderId) return
  el.dataset.view = view
  el.innerHTML = `<div class="sr5-clock-display"><span class="sr5-clock-date">${text.date}</span><span class="sr5-clock-time">${text.time}</span><span class="sr5-clock-views">${views}</span></div>${steps}${month}`
}

export function refreshCalendarClock(){
  if (document.getElementById(CLOCK_ID)) render()
}

async function goTo(){
  const value = dateTimeInputValue(game.time.components)
  const input = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.CALENDAR_GoTo"
    },
    content: `<div class="form-group"><label>${game.i18n.localize("SR5.CALENDAR_GoToLabel")}</label><input type="datetime-local" name="date" step="1" value="${value}"></div>`,
    ok: {
      label: "SR5.CALENDAR_GoToConfirm",
      callback: (event, button) => button.form.elements.date.value,
    },
    rejectClose: false,
  })
  if (!input) return
  const time = parseDateTimeInput(input, calendarStartYear())
  if (time === null) return ui.notifications.warn(game.i18n.localize("SR5.CALENDAR_GoToInvalid"))
  await game.time.set(time)
}

function journalDrop(event){
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
  return ["JournalEntry", "JournalEntryPage"].includes(data?.type) && data.uuid ? data.uuid : null
}

// The GM writes an event: title, date, who sees it, and a journal (a uuid, or a journal dropped on the field)
async function editEvent(initial){
  const startYear = calendarStartYear()
  const date = dateTimeInputValue(worldTimeToComponents(initial.date, startYear))
  const visibility = ["gm", "all"].map(v => `<option value="${v}" ${initial.visibility === v ? "selected" : ""}>${game.i18n.localize(v === "all" ? "SR5.CALENDAR_EventVisibilityAll" : "SR5.CALENDAR_EventVisibilityGM")}</option>`).join("")
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: initial.id ? "SR5.CALENDAR_EventEdit" : "SR5.CALENDAR_EventAdd"
    },
    content: `<div class="form-group"><label>${game.i18n.localize("SR5.CALENDAR_EventTitle")}</label><input type="text" name="title" value="${escape(initial.title)}" autofocus></div>
      <div class="form-group"><label>${game.i18n.localize("SR5.CALENDAR_EventDate")}</label><input type="datetime-local" name="date" step="1" value="${date}"></div>
      <div class="form-group"><label>${game.i18n.localize("SR5.CALENDAR_EventVisibility")}</label><select name="visibility">${visibility}</select></div>
      <div class="form-group"><label>${game.i18n.localize("SR5.CALENDAR_EventJournal")}</label><input type="text" name="journal" value="${escape(initial.journal)}" placeholder="${game.i18n.localize("SR5.CALENDAR_EventJournalHint")}"></div>`,
    ok: {
      label: "SR5.CALENDAR_EventSave",
      callback: (event, button) => {
        const f = button.form.elements
        return {
          title: f.title.value, date: parseDateTimeInput(f.date.value, startYear), visibility: f.visibility.value,
          journal: parseJournalLink(f.journal.value),
        }
      },
    },
    render: (event, dialog) => {
      const input = dialog.element.querySelector("input[name=journal]")
      input?.addEventListener("drop", (ev) => {
        const uuid = journalDrop(ev)
        if (!uuid) return
        ev.preventDefault()
        input.value = uuid
      })
    },
    rejectClose: false,
  })
  if (!data) return
  if (!data.title.trim() || data.date === null) return ui.notifications.warn(game.i18n.localize("SR5.CALENDAR_EventInvalid"))
  const id = initial.id || foundry.utils.randomID()
  await changeCalendarEvents(events => upsertEvent(events, {
    ...data, id
  }, game.time.worldTime))
}

// A new event on a day of the shown month, at the clock's time of day rather than midnight
function newEventOn(day, extra = {
}){
  const {
    year, month
  } = shownMonthOrClock()
  const {
    hour, minute, second
  } = game.time.components
  return editEvent({
    title: "", journal: "", visibility: "gm", ...extra,
    date: componentsToWorldTime({
      year, month, dayOfMonth: day - 1, hour, minute, second
    }, calendarStartYear()),
  })
}

async function deleteEvent(id){
  const event = getCalendarEvents().find(e => e.id === id)
  if (!event) return
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "SR5.CALENDAR_EventDelete"
    },
    content: `<p>${game.i18n.format("SR5.CALENDAR_EventDeleteConfirm", {
      title: escape(event.title)
    })}</p>`,
    rejectClose: false,
  })
  if (ok) await changeCalendarEvents(events => removeEvent(events, id))
}

// Quick clicks: game.time.advance reads worldTime before the server has answered the previous click, and the
// click is lost. Each click aims at the target of the clicks still in flight, plus its step
export function createClockAdvancer(time){
  let target = null
  let inFlight = 0
  return async (seconds) => {
    target = (target ?? time.worldTime) + seconds
    inFlight++
    try {
      await time.set(target)
    } finally {
      inFlight--
      if (!inFlight) target = null
    }
  }
}

let advanceClock = null

function onClick(event){
  const target = event.target
  const view = target.closest("[data-sr5-clock-view]")
  if (view) return game.settings.set("sr5", CLOCK_VIEW_SETTING, view.dataset.sr5ClockView)
  const nav = target.closest("[data-sr5-clock-month]")
  if (nav){
    const n = Number(nav.dataset.sr5ClockMonth)
    const {
      year, month
    } = shownMonthOrClock()
    shownMonth = n ? shiftMonth(year, month, n) : null
    return render()
  }
  if (!game.user.isGM) return
  const step = target.closest("[data-sr5-clock-step]")
  if (step){
    advanceClock ??= createClockAdvancer(game.time)
    return advanceClock(Number(step.dataset.sr5ClockStep))
  }
  if (target.closest("[data-sr5-clock-goto]")) return goTo()
  const day = target.closest("[data-sr5-clock-day]")
  if (day) return newEventOn(Number(day.dataset.sr5ClockDay))
  //"Add" on the clock's month proposes today, on another month its 1st
  if (target.closest("[data-sr5-clock-add]")) return newEventOn(shownMonth ? 1 : game.time.components.dayOfMonth + 1)
  const edit = target.closest("[data-sr5-clock-edit]")
  if (edit){
    const e = getCalendarEvents().find(ev => ev.id === edit.dataset.sr5ClockEdit)
    return e ? editEvent(e) : undefined
  }
  const del = target.closest("[data-sr5-clock-delete]")
  if (del) return deleteEvent(del.dataset.sr5ClockDelete)
}

// A journal dropped on a day of the month: a new event on that day, linked to it
async function onDrop(event){
  const day = event.target.closest("[data-sr5-clock-day]")
  if (!game.user.isGM || !day) return
  const uuid = journalDrop(event)
  if (!uuid) return
  event.preventDefault()
  const doc = await fromUuid(uuid)
  return newEventOn(Number(day.dataset.sr5ClockDay), {
    journal: uuid, title: doc?.name ?? ""
  })
}

// At init: the view chosen by each user, and the list of events
export function registerCalendarClockSettings(){
  game.settings.register("sr5", CLOCK_VIEW_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: "compact",
    onChange: () => refreshCalendarClock(),
  })
  registerCalendarEventSettings(() => refreshCalendarClock())
}

// At ready: the clock follows every change of world time, from a button, a combat or a macro
export function initCalendarClock(){
  if (thirdPartyCalendarModule()) return
  render()
  const el = document.getElementById(CLOCK_ID)
  el?.addEventListener("click", onClick)
  el?.addEventListener("dragover", (event) => {
    if (game.user.isGM && event.target.closest("[data-sr5-clock-day]")) event.preventDefault()
  })
  el?.addEventListener("drop", onDrop)
  Hooks.on("updateWorldTime", () => render())
  // Dated events: a whispered reminder to the GM for each event the clock passes
  initCalendarEvents()
}
