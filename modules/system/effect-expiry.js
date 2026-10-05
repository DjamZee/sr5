// Effects that last minutes, hours, days, weeks or months count down on the world clock (game.time).
// An effect notes the world time it began at; when the clock passes its end, the GM gets one chat card
// listing every effect that ran out, with a button to remove each. Nothing is removed without that click.
import {
  calendarStartYear, addCalendarMonths
} from "./calendar.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

export const TIMED_DURATIONS = {
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  //A month is a calendar month: see expiryTime
  month: null,
}

const NOTIFIED_FLAG = "expiryNotified"

export function isTimedEffect(system){
  return Object.hasOwn(TIMED_DURATIONS, system?.durationType) && Number(system?.duration) > 0
}

// An effect taken again while it runs (dumpshock): it now ends at the later of its old end and "now + new
// duration", counted from now. Returns the update to write, in the effect's own unit (rounded up)
export function extendTimedEffect(system, newDuration, now, startYear){
  const unit = TIMED_DURATIONS[system?.durationType]
  if (!unit) return {
    "system.duration": newDuration
  }
  const oldEnd = expiryTime(system, startYear)
  const remaining = oldEnd === null ? 0 : Math.ceil(Math.max(0, oldEnd - now) / unit)
  return {
    "system.duration": Math.max(Number(newDuration) || 0, remaining), "system.startTime": now, "flags.sr5.expiryNotified": false
  }
}

// The world time an effect ends at, null when it does not count on the clock or never started
export function expiryTime(system, startYear){
  if (!isTimedEffect(system)) return null
  const start = system.startTime
  if (start === null || start === undefined || !Number.isFinite(Number(start))) return null
  const n = Number(system.duration)
  if (system.durationType === "month") return addCalendarMonths(Number(start), n, startYear)
  return Number(start) + n * TIMED_DURATIONS[system.durationType]
}

// Splits the effects into those whose end the clock has just passed and those to alert again after a rewind
export function sortExpiries(effects, now, startYear){
  const expired = []
  const rewound = []
  for (const effect of effects){
    const end = expiryTime(effect.system, startYear)
    if (end === null) continue
    const notified = !!effect.flags?.sr5?.[NOTIFIED_FLAG]
    if (now >= end && !notified) expired.push({
      effect, end
    })
    else if (now < end && notified) rewound.push(effect)
  }
  return {
    expired, rewound
  }
}

// Every actor of the world, those of unlinked tokens included (their effects live in the token)
function allActors(){
  const actors = new Set(game.actors)
  for (const scene of game.scenes){
    for (const token of scene.tokens){
      if (!token.actorLink && token.actor) actors.add(token.actor)
    }
  }
  return [...actors]
}

function timedEffectsOf(actor){
  return actor.items.filter(i => i.type === "itemEffect" && isTimedEffect(i.system))
}

// One writer: the active GM
function isWriter(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export async function checkEffectExpiries(){
  if (!isWriter()) return
  const startYear = calendarStartYear()
  const now = game.time.worldTime
  const rows = []
  for (const actor of allActors()){
    const {
      expired, rewound
    } = sortExpiries(timedEffectsOf(actor), now, startYear)
    for (const effect of rewound) await effect.unsetFlag("sr5", NOTIFIED_FLAG)
    for (const {
      effect, end
    } of expired){
      await effect.setFlag("sr5", NOTIFIED_FLAG, true)
      rows.push({
        actor, effect, end
      })
    }
  }
  if (rows.length) await postExpiryCard(rows)
}

// The clock can move several times in a row (combat turns, clicks): one check at a time, one more after it
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
      await checkEffectExpiries().catch(e => SR5_SystemHelpers.srLog(1, `Effect expiries not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

async function postExpiryCard(rows){
  const fmt = (t) => game.time.calendar.format(t)
  const list = rows.map(r => `<li class="sr5-expiry-row" data-effect-uuid="${r.effect.uuid}">
      <span class="sr5-expiry-name"><strong>${escape(r.actor.name)}</strong> : ${escape(r.effect.name)}</span>
      <span class="sr5-expiry-end">${fmt(r.end)}</span>
      <button type="button" data-sr5-expiry="remove">${game.i18n.localize("SR5.CALENDAR_ExpiryRemove")}</button>
    </li>`).join("")
  const all = rows.length > 1 ? `<button type="button" data-sr5-expiry="removeAll">${game.i18n.localize("SR5.CALENDAR_ExpiryRemoveAll")}</button>` : ""
  await ChatMessage.create({
    content: `<div class="sr5-expiry-card"><h3>${game.i18n.localize("SR5.CALENDAR_ExpiryTitle")}</h3>
      <p>${game.i18n.format("SR5.CALENDAR_ExpiryIntro", {
    date: fmt(game.time.worldTime)
  })}</p><ul>${list}</ul>${all}</div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: {
      sr5: {
        effectExpiry: true
      }
    },
  })
}

// The effect goes, and the card says so in its own content: "Remove" does not come back at the next render
async function removeRow(row){
  const effect = await fromUuid(row.dataset.effectUuid)
  if (effect) await effect.delete()
  row.classList.add("sr5-expiry-done")
  row.querySelector("button")?.remove()
  await markRowDoneInMessage(row, "[data-sr5-expiry=remove]", game.i18n.localize("SR5.CALENDAR_RowRemoved"), "[data-sr5-expiry=removeAll]")
}

// The card's buttons: the GM only, on a card a GM posted, and an effect already gone is skipped
export function activateExpiryCardListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-expiry]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-expiry=remove]").forEach(button => button.addEventListener("click", (event) => {
    removeRow(event.currentTarget.closest(".sr5-expiry-row")).catch(e => SR5_SystemHelpers.srLog(1, `Expired effect not removed: ${e}`))
  }))
  html.querySelector("[data-sr5-expiry=removeAll]")?.addEventListener("click", async (event) => {
    event.currentTarget.remove()
    for (const row of html.querySelectorAll(".sr5-expiry-row:not(.sr5-expiry-done)")){
      await removeRow(row).catch(e => SR5_SystemHelpers.srLog(1, `Expired effect not removed: ${e}`))
    }
  })
}

// A timed effect starts at the world time it is put on an actor. An effect of the world (the Items tab) is a
// model and never starts; the date it may carry from an earlier copy is replaced, or it would be born expired
export function stampEffectStart(item, now){
  if (item.type !== "itemEffect" || !item.parent) return false
  const system = item.system
  if (!isTimedEffect(system) || system.startTime === now) return false
  item.updateSource({
    "system.startTime": now
  })
  return true
}

// Effects created before the calendar have no start: they start now, rather than expire all at once
async function backfillStarts(){
  for (const actor of allActors()){
    const updates = timedEffectsOf(actor).filter(i => i.system.startTime === null || i.system.startTime === undefined)
      .map(i => ({
        _id: i.id, "system.startTime": game.time.worldTime
      }))
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates)
  }
}

// The preCreateItem handler: it must return nothing, a false would cancel the creation of every other item
export function onPreCreateItem(item, now){
  stampEffectStart(item, now)
}

export function initEffectExpiry(){
  Hooks.on("preCreateItem", (item) => onPreCreateItem(item, game.time.worldTime))
  Hooks.on("updateWorldTime", () => queueCheck())
  if (isWriter()) backfillStarts().then(() => queueCheck())
    .catch(e => SR5_SystemHelpers.srLog(1, `Effect starts not set: ${e}`))
}
