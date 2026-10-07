import {
  describe, it, expect
} from "vitest"
import {
  dueEvents, markNotified, upsertEvent, removeEvent, visibleEvents, eventsInMonth, monthGrid, validEvents,
  changeCalendarEvents
} from "../modules/system/calendar-events.js"
import {
  shiftMonth, parseJournalLink
} from "../modules/interface/calendar-clock.js"
import {
  componentsToWorldTime
} from "../modules/system/calendar.js"

const DAY = 86400

// The clock as the active GM sees it: each move reminds what is due, then marks it
function move(events, now){
  const due = dueEvents(events, now)
  return {
    reminded: due.map(e => e.id), events: markNotified(events, due.map(e => e.id))
  }
}

function list(now = 0){
  let events = []
  events = upsertEvent(events, {
    id: "a", title: "Rendez-vous", date: 1 * DAY, visibility: "all"
  }, now)
  events = upsertEvent(events, {
    id: "b", title: "Livraison", date: 2 * DAY + 3600, visibility: "gm"
  }, now)
  events = upsertEvent(events, {
    id: "c", title: "Échéance", date: 3 * DAY, visibility: "gm", journal: "JournalEntry.x"
  }, now)
  events = upsertEvent(events, {
    id: "d", title: "Plus tard", date: 5 * DAY, visibility: "all"
  }, now)
  return events
}

describe("Calendar events: passing a date", () => {
  it("one day: the event of that day is reminded, not the next ones", () => {
    expect(move(list(), DAY).reminded).toEqual(["a"])
  })

  it("three days in one step: one reminder per event passed, in date order", () => {
    expect(move(list(), 3 * DAY).reminded).toEqual(["a", "b", "c"])
  })

  it("the clock moved back, then forward again: no reminder twice", () => {
    let state = move(list(), 3 * DAY)
    state = move(state.events, 0)
    expect(state.reminded).toEqual([])
    state = move(state.events, 4 * DAY)
    expect(state.reminded).toEqual([])
    state = move(state.events, 6 * DAY)
    expect(state.reminded).toEqual(["d"])
  })

  it("two checks at the same time remind once", () => {
    const first = move(list(), 2 * DAY + 3600)
    expect(first.reminded).toEqual(["a", "b"])
    expect(move(first.events, 2 * DAY + 3600).reminded).toEqual([])
  })

  it("an event written with a date already passed is not reminded", () => {
    const events = upsertEvent([], {
      id: "x", title: "Passé", date: DAY
    }, 2 * DAY)
    expect(move(events, 3 * DAY).reminded).toEqual([])
  })

  it("moving a reminded event to a later date reminds it again when the clock gets there", () => {
    let state = move(list(), DAY)
    state.events = upsertEvent(state.events, {
      id: "a", title: "Rendez-vous reporté", date: 4 * DAY, visibility: "all"
    }, DAY)
    expect(move(state.events, 4 * DAY).reminded).toEqual(["b", "c", "a"])
  })
})

describe("Calendar events: the list", () => {
  it("a player sees only the events shown to everyone", () => {
    expect(visibleEvents(list(), false).map(e => e.id)).toEqual(["a", "d"])
    expect(visibleEvents(list(), true).map(e => e.id)).toEqual(["a", "b", "c", "d"])
  })

  it("drops what is not an event, and keeps an unknown visibility for the GM alone", () => {
    expect(validEvents([null, {
      id: "z", title: "", date: 0
    }, {
      id: "y", title: "T", date: "abc"
    }, {
      id: "w", title: "T", date: 0, visibility: "players"
    }])).toEqual([{
      id: "w", title: "T", date: 0, journal: "", visibility: "gm", notified: false
    }])
  })

  it("replaces an event of the same id, removes one by id", () => {
    const events = upsertEvent(list(), {
      id: "b", title: "Autre", date: 2 * DAY
    }, 0)
    expect(events.filter(e => e.id === "b").map(e => e.title)).toEqual(["Autre"])
    expect(removeEvent(events, "b").map(e => e.id)).toEqual(["a", "c", "d"])
  })

  it("finds the events of a month, across a change of year", () => {
    const start = 2070
    const events = upsertEvent(upsertEvent([], {
      id: "jan", title: "Janvier", date: componentsToWorldTime({
        year: 2071, month: 0, dayOfMonth: 4
      }, start)
    }, 0), {
      id: "dec", title: "Décembre", date: componentsToWorldTime({
        year: 2070, month: 11, dayOfMonth: 30
      }, start)
    }, 0)
    expect(eventsInMonth(events, 2071, 0, start).map(e => e.id)).toEqual(["jan"])
    expect(eventsInMonth(events, 2070, 11, start).map(e => e.id)).toEqual(["dec"])
  })
})

describe("Calendar events: the GM's register", () => {
  it("two events written at once both stay in the list", async () => {
    //A server that answers late: the setting changes only once each write has come back
    const store = {
      sr5CalendarEvents: []
    }
    globalThis.foundry.utils.deepClone ??= (o) => JSON.parse(JSON.stringify(o))
    globalThis.game.settings = {
      get: (scope, key) => store[key],
      set: (scope, key, value) => new Promise(resolve => setTimeout(() => resolve(store[key] = value), 10)),
    }
    await Promise.all([
      changeCalendarEvents(events => upsertEvent(events, {
        id: "p", title: "Premier", date: DAY
      }, 0)),
      changeCalendarEvents(events => upsertEvent(events, {
        id: "s", title: "Second", date: 2 * DAY
      }, 0)),
    ])
    expect(store.sr5CalendarEvents.map(e => e.id)).toEqual(["p", "s"])
  })
})

describe("Calendar: month view", () => {
  it("lays January 2070 out from Monday (1 January 2070 is a Wednesday)", () => {
    const weeks = monthGrid(2070, 0)
    expect(weeks[0]).toEqual([null, null, 1, 2, 3, 4, 5])
    expect(weeks.flat().filter(Boolean)).toHaveLength(31)
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })

  it("counts 29 days in February of a leap year", () => {
    expect(monthGrid(2072, 1).flat().filter(Boolean)).toHaveLength(29)
    expect(monthGrid(2100, 1).flat().filter(Boolean)).toHaveLength(28)
  })

  it("browses the months across the years", () => {
    expect(shiftMonth(2070, 11, 1)).toEqual({
      year: 2071, month: 0
    })
    expect(shiftMonth(2070, 0, -1)).toEqual({
      year: 2069, month: 11
    })
  })

  it("reads a journal link as a uuid", () => {
    expect(parseJournalLink("@UUID[JournalEntry.abc.JournalEntryPage.def]{Note}")).toBe("JournalEntry.abc.JournalEntryPage.def")
    expect(parseJournalLink(" JournalEntry.abc ")).toBe("JournalEntry.abc")
    expect(parseJournalLink("")).toBe("")
  })
})
