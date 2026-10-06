// The Sixth World clock: date and time for everyone, at the top of the screen; buttons to advance the clock
// and a "go to" for the GM only. It reads game.time, so a calendar module, when active, keeps its own display
import {
  thirdPartyCalendarModule, componentsToWorldTime, calendarStartYear
} from "../system/calendar.js"

export const CLOCK_ID = "sr5-calendar-clock"

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

function names(list){
  return list.map(v => game.i18n.localize(v.name))
}

function render(){
  let el = document.getElementById(CLOCK_ID)
  if (!el){
    el = document.createElement("section")
    el.id = CLOCK_ID
    el.classList.add("sr5-calendar-clock")
    const parent = document.getElementById("ui-top") ?? document.body
    parent.append(el)
  }
  const cal = game.time.calendar
  const text = formatClock(game.time.components, names(cal.months.values), names(cal.days.values))
  const steps = game.user.isGM ? `<div class="sr5-clock-steps">${CLOCK_STEPS.map(s =>
    `<button type="button" data-sr5-clock-step="${s.seconds}" data-tooltip="${game.i18n.localize(s.label)}">+${game.i18n.localize(s.label + "Abbr")}</button>`).join("")}
    <button type="button" data-sr5-clock-goto data-tooltip="${game.i18n.localize("SR5.CALENDAR_GoTo")}" aria-label="${game.i18n.localize("SR5.CALENDAR_GoTo")}"><i class="fa-solid fa-calendar-day"></i></button></div>` : ""
  el.innerHTML = `<div class="sr5-clock-display"><span class="sr5-clock-date">${text.date}</span><span class="sr5-clock-time">${text.time}</span></div>${steps}`
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
  if (!game.user.isGM) return
  const step = event.target.closest("[data-sr5-clock-step]")
  if (step){
    advanceClock ??= createClockAdvancer(game.time)
    return advanceClock(Number(step.dataset.sr5ClockStep))
  }
  if (event.target.closest("[data-sr5-clock-goto]")) return goTo()
}

// At ready: the clock follows every change of world time, from a button, a combat or a macro
export function initCalendarClock(){
  if (thirdPartyCalendarModule()) return
  render()
  document.getElementById(CLOCK_ID)?.addEventListener("click", onClick)
  Hooks.on("updateWorldTime", () => render())
}
