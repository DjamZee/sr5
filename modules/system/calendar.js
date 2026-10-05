// The Sixth World calendar: Foundry V13 keeps the world time (game.time.worldTime, in seconds) and this file
// says which date it is. World time 0 is midnight, 1 January of the start year (a world setting).
// The Sixth World uses the Gregorian calendar, leap years included: the date math is done by Date.UTC,
// not by Foundry's simplified Gregorian, whose leap years do not fall on the right years.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"

export const CALENDAR_START_YEAR_SETTING = "sr5CalendarStartYear"
export const CALENDAR_COMBAT_TIME_SETTING = "sr5CalendarCombatTime"
export const DEFAULT_START_YEAR = 2070
// "A Combat Turn is approximately three seconds" (SR5 p. 51)
export const COMBAT_ROUND_SECONDS = 3

// Calendar modules that bring their own calendar: when one is active, the system leaves CONFIG.time alone
export const THIRD_PARTY_CALENDAR_MODULES = [
  "foundryvtt-simple-calendar",
  "foundryvtt-simple-calendar-reborn",
  "foundryvtt-simple-calendar-compat",
  "seasons-and-stars",
  "gg-calendar",
  "calendaria",
]

const SECONDS_PER_DAY = 86400
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

export function isLeapYear(year){
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function epochMs(startYear){
  //Date.UTC maps 0-99 to 1900-1999: setUTCFullYear does not
  const d = new Date(0)
  d.setUTCFullYear(startYear, 0, 1)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

// World time (seconds since the start of the start year) to Foundry time components, with the real year
export function worldTimeToComponents(time, startYear){
  const total = Math.floor(time ?? 0)
  const d = new Date(epochMs(startYear) + total * 1000)
  const year = d.getUTCFullYear()
  const yearStart = new Date(0)
  yearStart.setUTCFullYear(year, 0, 1)
  yearStart.setUTCHours(0, 0, 0, 0)
  const day = Math.floor((d.getTime() - yearStart.getTime()) / (SECONDS_PER_DAY * 1000))
  return {
    year,
    day,
    month: d.getUTCMonth(),
    dayOfMonth: d.getUTCDate() - 1,
    //Foundry counts the week from Monday (0), Date from Sunday (0)
    dayOfWeek: (d.getUTCDay() + 6) % 7,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    leapYear: isLeapYear(year),
    season: [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][d.getUTCMonth()],
  }
}

// The reverse: components to world time. Without a month, "day" is the day of the year (Foundry's convention);
// with a month, "dayOfMonth" counts from 0. A missing year means the start year
export function componentsToWorldTime(components, startYear){
  const c = components ?? {
  }
  const d = new Date(0)
  if (c.month !== undefined && c.month !== null) d.setUTCFullYear(c.year ?? startYear, c.month, (c.dayOfMonth ?? 0) + 1)
  else d.setUTCFullYear(c.year ?? startYear, 0, (c.day ?? 0) + 1)
  d.setUTCHours(c.hour ?? 0, c.minute ?? 0, c.second ?? 0, 0)
  return Math.round((d.getTime() - epochMs(startYear)) / 1000)
}

// A duration expressed in components (Foundry's advance() accepts it): years count as 365 days, days as 24 h
export function durationToSeconds(delta){
  const c = delta ?? {
  }
  return ((((c.year ?? 0) * 365 + (c.day ?? 0)) * 24 + (c.hour ?? 0)) * 60 + (c.minute ?? 0)) * 60 + (c.second ?? 0)
}

export function sr5CalendarConfig(){
  return {
    name: "SR5.CALENDAR_Name",
    description: "SR5.CALENDAR_Description",
    years: {
      yearZero: 0,
      firstWeekday: 0,
      //Leap years are computed by worldTimeToComponents, not by Foundry
      leapYear: null,
    },
    months: {
      values: MONTHS.map((m, i) => ({
        name: `SR5.CALENDAR_${m}`,
        abbreviation: `SR5.CALENDAR_${m}Abbr`,
        ordinal: i + 1,
        days: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i],
        leapDays: i === 1 ? 29 : null,
      })),
    },
    days: {
      values: WEEKDAYS.map((w, i) => ({
        name: `SR5.CALENDAR_${w}`,
        abbreviation: `SR5.CALENDAR_${w}Abbr`,
        ordinal: i + 1,
      })),
      daysPerYear: 365,
      hoursPerDay: 24,
      minutesPerHour: 60,
      secondsPerMinute: 60,
    },
    seasons: {
      values: [
        {
          name: "CALENDAR.GREGORIAN.Spring", monthStart: 3, monthEnd: 5
        },
        {
          name: "CALENDAR.GREGORIAN.Summer", monthStart: 6, monthEnd: 8
        },
        {
          name: "CALENDAR.GREGORIAN.Fall", monthStart: 9, monthEnd: 11
        },
        {
          name: "CALENDAR.GREGORIAN.Winter", monthStart: 12, monthEnd: 2
        },
      ],
    },
  }
}

// Foundry's CalendarData with the real Gregorian math. The start year rides on the instance, read in the setting
function createSR5CalendarClass(Base){
  return class SR5CalendarData extends Base {
    get sr5StartYear(){
      return calendarStartYear()
    }

    timeToComponents(time = 0){
      return worldTimeToComponents(time, this.sr5StartYear)
    }

    // An absolute date (with a year) or a duration (without one): advance() sends durations
    componentsToTime(components){
      if (components?.year === undefined || components.year === null) return durationToSeconds(components)
      return componentsToWorldTime(components, this.sr5StartYear)
    }
  }
}

export function thirdPartyCalendarModule(modules = game.modules){
  return THIRD_PARTY_CALENDAR_MODULES.find(id => modules?.get(id)?.active) ?? null
}

export function calendarStartYear(){
  try {
    return Number(game.settings.get("sr5", CALENDAR_START_YEAR_SETTING)) || DEFAULT_START_YEAR
  } catch {
    return DEFAULT_START_YEAR
  }
}

export function combatRoundSeconds(enabled){
  return enabled ? COMBAT_ROUND_SECONDS : 0
}

// A calendar module advances the clock in combat its own way: the system leaves roundTime to it, or each turn
// would be counted twice
export function roundTimeFor(enabled, thirdParty, current){
  if (thirdParty) return current
  return combatRoundSeconds(enabled)
}

function applyCombatTime(){
  CONFIG.time.roundTime = roundTimeFor(game.settings.get("sr5", CALENDAR_COMBAT_TIME_SETTING), thirdPartyCalendarModule(), CONFIG.time.roundTime)
}

function applyCalendar(){
  const module = thirdPartyCalendarModule()
  if (module){
    SR5_SystemHelpers.srLog(2, `Calendar module ${module} is active: the SR5 calendar stays out of CONFIG.time`)
    return false
  }
  CONFIG.time.worldCalendarConfig = sr5CalendarConfig()
  CONFIG.time.worldCalendarClass = createSR5CalendarClass(foundry.data.CalendarData)
  return true
}

// Called at init: settings, calendar and combat time. game.time already exists, so its calendar is rebuilt
export function registerCalendarSettings(){
  game.settings.register("sr5", CALENDAR_START_YEAR_SETTING, {
    name: "SR5.SETTINGS_CalendarStartYear_T",
    hint: "SR5.SETTINGS_CalendarStartYear_D",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_START_YEAR,
    requiresReload: true,
  })
  game.settings.register("sr5", CALENDAR_COMBAT_TIME_SETTING, {
    name: "SR5.SETTINGS_CalendarCombatTime_T",
    hint: "SR5.SETTINGS_CalendarCombatTime_D",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => applyCombatTime(),
  })
  applyCombatTime()
  if (applyCalendar()) game.time?.initializeCalendar?.()
}
