// Events of the Sixth World calendar: a list kept by the GM (date, title, an optional journal link, seen by the
// GM alone or by everyone). When the clock passes the date of an event, even several days in one step, the
// active GM gets one whispered reminder per event passed. An event is reminded once: a clock moved back and
// forth again does not remind it twice (editing its date to a later one does).
import {
  worldTimeToComponents, daysInMonth
} from "./calendar.js"
import {
  updateLedger
} from "./gm-ledger.js"
import {
  escape, isActiveGM as isWriter, queuedCheck
} from "./card-helpers.js"

export const CALENDAR_EVENTS_SETTING = "sr5CalendarEvents"
export const EVENT_VISIBILITY = ["gm", "all"]

// One event as it is stored: anything else in the setting is dropped
export function normalizeEvent(e){
  return {
    id: String(e?.id ?? ""),
    title: String(e?.title ?? "").trim(),
    date: Number(e?.date),
    journal: e?.journal ? String(e.journal) : "",
    visibility: EVENT_VISIBILITY.includes(e?.visibility) ? e.visibility : "gm",
    notified: !!e?.notified,
  }
}

export function validEvents(events){
  return (Array.isArray(events) ? events : []).map(normalizeEvent).filter(e => e.id && e.title && Number.isFinite(e.date))
}

// The events the clock has passed and not reminded yet, oldest first
export function dueEvents(events, now){
  return validEvents(events).filter(e => !e.notified && e.date <= now).sort((a, b) => a.date - b.date)
}

export function markNotified(events, ids){
  const set = new Set(ids)
  return validEvents(events).map(e => set.has(e.id) ? {
    ...e, notified: true
  } : e)
}

// Adds or replaces an event. A date already passed counts as reminded: the GM writing it already knows it
export function upsertEvent(events, data, now){
  const event = normalizeEvent({
    ...data, notified: Number(data?.date) <= now
  })
  const list = validEvents(events).filter(e => e.id !== event.id)
  list.push(event)
  return list.sort((a, b) => a.date - b.date)
}

export function removeEvent(events, id){
  return validEvents(events).filter(e => e.id !== id)
}

export function visibleEvents(events, isGM){
  return validEvents(events).filter(e => isGM || e.visibility === "all")
}

export function eventsInMonth(events, year, month, startYear){
  return validEvents(events).filter(e => {
    const c = worldTimeToComponents(e.date, startYear)
    return c.year === year && c.month === month
  }).sort((a, b) => a.date - b.date)
}

// The weeks of a month, from Monday: day numbers (1-based), null before the 1st and after the last day
export function monthGrid(year, month){
  const first = new Date(0)
  first.setUTCFullYear(year, month, 1)
  const lead = (first.getUTCDay() + 6) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({
    length: daysInMonth(year, month)
  }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/* -------------------------------------------- */

export function getCalendarEvents(){
  try {
    return validEvents(game.settings.get("sr5", CALENDAR_EVENTS_SETTING))
  } catch {
    return []
  }
}

// The list is a register of the GM: each change waits for the previous one and starts from the latest list
export function changeCalendarEvents(change){
  return updateLedger(CALENDAR_EVENTS_SETTING, async (events) => {
    const next = await change(validEvents(events))
    return next ? validEvents(next) : null
  })
}

async function postReminder(event){
  const link = event.journal ? `<p>@UUID[${event.journal}]</p>` : ""
  const visibility = game.i18n.localize(event.visibility === "all" ? "SR5.CALENDAR_EventVisibilityAll" : "SR5.CALENDAR_EventVisibilityGM")
  await ChatMessage.create({
    content: `<div class="sr5-deadline-card sr5-calendar-event-card"><h3>${game.i18n.localize("SR5.CALENDAR_EventReminderTitle")}</h3>
      <p><strong>${escape(event.title)}</strong> — ${escape(game.time.calendar.format(event.date))}</p>${link}<p class="sr5-calendar-event-visibility">${visibility}</p></div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: {
      sr5: {
        calendarEvent: event.id
      }
    },
  })
}

export async function checkCalendarEvents(){
  if (!isWriter()) return
  // Marked first: a second check while the messages are written finds nothing to remind
  let due = []
  await changeCalendarEvents((events) => {
    due = dueEvents(events, game.time.worldTime)
    return due.length ? markNotified(events, due.map(e => e.id)) : null
  })
  for (const event of due) await postReminder(event)
}

const queueCheck = queuedCheck(() => checkCalendarEvents(), "Calendar events not checked")

export function registerCalendarEventSettings(onChange){
  game.settings.register("sr5", CALENDAR_EVENTS_SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => onChange?.(),
  })
}

export function initCalendarEvents(){
  Hooks.on("updateWorldTime", () => queueCheck())
  if (isWriter()) queueCheck()
}
