// Extended tests take time: one interval per roll, "(threshold, interval)" (SR5 p. 50); a healing test also
// counts a glitched roll twice (SR5 p. 207-208), already in test.extended.intervalValue. The card of such a test
// offers the active GM a button to move the world clock on by the time spent since the last time he did it.
// Nothing moves without that click and its confirmation.
// The card is the player's to write (it is his roll): the count of intervals already put on the clock lives in a
// hidden world setting, written by the active GM alone, never in the card's flags
import {
  calendarStartYear, addCalendarMonths
} from "./calendar.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  updateLedger
} from "./gm-ledger.js"

export const EXTENDED_CLOCK_LEDGER = "sr5ExtendedClockLedger"

export const INTERVAL_SECONDS = {
  combatTurn: 3,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
}

// Intervals spent on the test and not yet put on the clock. "advanced" comes from the GM's ledger, not the card
export function pendingIntervals(extended, advanced = 0){
  //A card rolled before the calendar knew nothing of the clock: its time is long spent, no button
  if (extended?.clockAdvanced === undefined || extended?.clockAdvanced === null) return 0
  if (!extended?.interval || (!INTERVAL_SECONDS[extended.interval] && extended.interval !== "month")) return 0
  const spent = Number(extended?.intervalValue) || 0
  return Math.max(0, spent - (Number(advanced) || 0))
}

// The world time n intervals after "now": months are calendar months, capped at the last day
export function timeAfter(now, n, interval, startYear){
  if (interval === "month") return addCalendarMonths(now, n, startYear)
  return now + n * (INTERVAL_SECONDS[interval] ?? 0)
}

// The ledger once n more intervals of a message are on the clock; entries of messages gone are dropped
export function ledgerAfter(ledger, messageId, n, existingIds){
  const next = {
  }
  for (const [id, count] of Object.entries(ledger ?? {
  })) if (!existingIds || existingIds.has(id)) next[id] = count
  next[messageId] = (Number(next[messageId]) || 0) + n
  return next
}

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function ledger(){
  try {
    return game.settings.get("sr5", EXTENDED_CLOCK_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

function label(n, interval){
  const unit = game.i18n.localize(CONFIG.SR5?.extendedIntervals?.[interval] ?? interval)
  return game.i18n.format("SR5.CALENDAR_AdvanceExtended", {
    n, unit
  })
}

async function advance(message, button){
  if (!isActiveGM()) return
  const extended = message.flags?.sr5data?.test?.extended
  const n = pendingIntervals(extended, ledger()[message.id])
  if (!n) return button.remove()
  //The GM sees the value before it moves the clock: a card can carry anything its author wrote in it
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "SR5.CALENDAR_AdvanceExtendedTitle"
    },
    content: `<p>${game.i18n.format("SR5.CALENDAR_AdvanceExtendedConfirm", {
      what: label(n, extended.interval)
    })}</p>`,
    rejectClose: false,
  })
  if (!ok) return
  button.disabled = true
  await game.time.set(timeAfter(game.time.worldTime, n, extended.interval, calendarStartYear()))
  await updateLedger(EXTENDED_CLOCK_LEDGER, current => ledgerAfter(current, message.id, n, new Set(game.messages.keys())))
  button.remove()
}

// The active GM's button, put on the card at render: no template change, and the count follows each new roll
export function addExtendedClockButton(message, html){
  if (!isActiveGM()) return
  const extended = message.flags?.sr5data?.test?.extended
  const n = pendingIntervals(extended, ledger()[message.id])
  if (!n || !(Number(extended?.roll) > 0)) return
  const button = document.createElement("button")
  button.type = "button"
  button.classList.add("sr5-extended-clock")
  button.innerHTML = `<i class="fa-solid fa-clock"></i> ${label(n, extended.interval)}`
  button.addEventListener("click", () => advance(message, button)
    .catch(e => SR5_SystemHelpers.srLog(1, `Clock not advanced: ${e}`)))
  const anchor = html.querySelector("#srButtonTest") ?? html.querySelector(".message-content")
  anchor?.after?.(button)
}

export function registerExtendedClockSetting(){
  game.settings.register("sr5", EXTENDED_CLOCK_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
  })
}
