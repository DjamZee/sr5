// Extended tests take time: one interval per roll, "(threshold, interval)" (SR5 p. 50); a healing test also
// counts a glitched roll twice (SR5 p. 207-208), already in test.extended.intervalValue. The card of such a test
// offers the GM a button to move the world clock on by the time spent since the last time he did it.
// Nothing moves without that click
import {
  calendarStartYear, worldTimeToComponents, componentsToWorldTime
} from "./calendar.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"

export const INTERVAL_SECONDS = {
  combatTurn: 3,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
}

// Intervals spent on the test and not yet put on the clock
export function pendingIntervals(extended){
  const spent = Number(extended?.intervalValue) || 0
  const done = Number(extended?.clockAdvanced) || 0
  if (!extended?.interval || (!INTERVAL_SECONDS[extended.interval] && extended.interval !== "month")) return 0
  return Math.max(0, spent - done)
}

// The world time n intervals after "now": months are calendar months
export function timeAfter(now, n, interval, startYear){
  if (interval === "month"){
    const c = worldTimeToComponents(now, startYear)
    const months = c.month + n
    return componentsToWorldTime({
      ...c, year: c.year + Math.floor(months / 12), month: months % 12
    }, startYear)
  }
  return now + n * (INTERVAL_SECONDS[interval] ?? 0)
}

async function advance(message, button){
  const data = message.flags?.sr5data
  const extended = data?.test?.extended
  const n = pendingIntervals(extended)
  if (!n) return
  button.disabled = true
  await game.time.set(timeAfter(game.time.worldTime, n, extended.interval, calendarStartYear()))
  await message.update({
    "flags.sr5data.test.extended.clockAdvanced": (Number(extended.clockAdvanced) || 0) + n
  })
}

// The GM's button, put on the card at render: no template change, and the count follows each new roll
export function addExtendedClockButton(message, html){
  if (!game.user.isGM) return
  const extended = message.flags?.sr5data?.test?.extended
  const n = pendingIntervals(extended)
  if (!n || !(Number(message.flags?.sr5data?.test?.extended?.roll) > 0)) return
  const unit = game.i18n.localize(CONFIG.SR5?.extendedIntervals?.[extended.interval] ?? extended.interval)
  const button = document.createElement("button")
  button.type = "button"
  button.classList.add("sr5-extended-clock")
  button.innerHTML = `<i class="fa-solid fa-clock"></i> ${game.i18n.format("SR5.CALENDAR_AdvanceExtended", {
    n, unit
  })}`
  button.addEventListener("click", () => advance(message, button)
    .catch(e => SR5_SystemHelpers.srLog(1, `Clock not advanced: ${e}`)))
  const anchor = html.querySelector("#srButtonTest") ?? html.querySelector(".message-content")
  anchor?.after?.(button)
}
