// Drugs on the world clock: the effect lasts its rolled Duration after its Speed (SR5 p. 411-412), then the
// crash lasts its own duration (Chrome Flesh p. 194). The world time a drug enters each phase is noted on it;
// when the clock passes the end of a phase, the GM gets one card with the button that moves the drug on.
// Nothing changes without that click. The phase itself belongs to entities/items/drug-crash.js
import {
  endDrugRise, resetDrugPhase
} from "../entities/items/drug-crash.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"

// Seconds of each unit a drug duration is given in (keys of SR5.extendedIntervals); a Combat Turn is 3 s (SR5 p. 51)
export const DRUG_UNITS = {
  combatTurn: 3,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
}

// The Speed is shown with a label key ("SR5.CombatTurns"): read back to seconds, 0 when it is not a time
export function speedSeconds(shot){
  const n = Number(shot?.speed)
  if (!Number.isFinite(n) || n <= 0) return 0
  const type = String(shot?.speedType ?? "").toLowerCase()
  if (type.includes("combatturn")) return n * DRUG_UNITS.combatTurn
  if (type.includes("minute")) return n * DRUG_UNITS.minute
  if (type.includes("hour")) return n * DRUG_UNITS.hour
  return 0
}

export function durationSeconds(value, unit){
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || !DRUG_UNITS[unit]) return null
  return n * DRUG_UNITS[unit]
}

// The end of the phase a drug is in, null when it cannot be counted (no start, no numeric duration)
export function phaseEnd(system, flags){
  const shot = system?.handleShot ?? {
  }
  if (system?.phase === "rise"){
    const start = flags?.riseStart
    const d = durationSeconds(shot.duration, shot.durationType)
    if (!Number.isFinite(start) || d === null) return null
    return start + speedSeconds(shot) + d
  }
  if (system?.phase === "crash"){
    const start = flags?.crashStart
    const d = durationSeconds(shot.durationContrecoup, shot.durationContrecoupType)
    if (!Number.isFinite(start) || d === null) return null
    return start + d
  }
  return null
}

// The flags to write with a change of phase: the start of the new phase, the alert of the old one forgotten
export function phaseStartFlags(oldPhase, newPhase, now){
  if (newPhase === oldPhase) return null
  if (newPhase === "rise") return {
    riseStart: now, crashStart: null, drugNotified: false
  }
  if (newPhase === "crash") return {
    crashStart: now, drugNotified: false
  }
  return {
    riseStart: null, crashStart: null, drugNotified: false
  }
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

export async function checkDrugs(){
  if (!isWriter()) return
  const now = game.time.worldTime
  const rows = []
  for (const actor of allActors()){
    for (const item of actor.items.filter(i => i.type === "itemDrug" && i.system.phase)){
      const flags = item.flags?.sr5 ?? {
      }
      const end = phaseEnd(item.system, flags)
      if (end === null) continue
      if (now >= end && !flags.drugNotified){
        await item.setFlag("sr5", "drugNotified", true)
        rows.push({
          actor, item, end, phase: item.system.phase
        })
      }
      else if (now < end && flags.drugNotified) await item.setFlag("sr5", "drugNotified", false)
    }
  }
  if (rows.length) await postDrugCard(rows)
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
      await checkDrugs().catch(e => SR5_SystemHelpers.srLog(1, `Drugs not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

async function postDrugCard(rows){
  const fmt = (t) => game.time.calendar.format(t)
  const list = rows.map(r => `<li class="sr5-drug-row" data-item-uuid="${r.item.uuid}" data-phase="${r.phase}">
      <span><strong>${escape(r.actor.name)}</strong> : ${escape(r.item.name)} — ${game.i18n.localize(r.phase === "rise" ? "SR5.CALENDAR_DrugRiseOver" : "SR5.CALENDAR_DrugCrashOver")}</span>
      <span>${fmt(r.end)}</span>
      <button type="button" data-sr5-drug>${game.i18n.localize(r.phase === "rise" ? "SR5.CALENDAR_DrugStartCrash" : "SR5.CALENDAR_DrugEndCrash")}</button>
    </li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-drug-card"><h3>${game.i18n.localize("SR5.CALENDAR_DrugTitle")}</h3>
      <p>${game.i18n.format("SR5.CALENDAR_DrugIntro", {
    date: fmt(game.time.worldTime)
  })}</p><ul>${list}</ul></div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: {
      sr5: {
        drugClock: true
      }
    },
  })
}

// The button: the phase must still be the one the card was dealt for, a drug already moved on is left alone
async function act(row){
  const item = await fromUuid(row.dataset.itemUuid)
  if (!item || item.system.phase !== row.dataset.phase) return true
  if (row.dataset.phase === "rise") return endDrugRise(item)
  return resetDrugPhase(item)
}

export function activateDrugCardListeners(html){
  if (!game.user.isGM) return html.querySelectorAll("[data-sr5-drug]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-drug]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    btn.disabled = true
    const done = await act(btn.closest(".sr5-drug-row")).catch(e => SR5_SystemHelpers.srLog(1, `Drug phase not moved: ${e}`))
    if (done) btn.remove()
    else btn.disabled = false
  }))
}

// Returns nothing: a false from a pre-hook would cancel the update
export function onPreUpdateDrug(item, changes, now){
  if (item.type !== "itemDrug") return
  const newPhase = changes?.system?.phase
  if (newPhase === undefined) return
  const flags = phaseStartFlags(item.system.phase ?? "", newPhase, now)
  if (!flags) return
  foundry.utils.setProperty(changes, "flags.sr5", {
    ...(changes.flags?.sr5 ?? {
    }), ...flags
  })
}

// The sheet writes a drug taken through its actor, the whole item list at once (baseSheet, "items": itemList)
export function onPreUpdateActorDrugs(actor, changes, now){
  if (!Array.isArray(changes?.items)) return
  for (const data of changes.items){
    const item = actor.items?.get?.(data?._id)
    if (item) onPreUpdateDrug(item, data, now)
  }
}

export function initDrugClock(){
  Hooks.on("preUpdateItem", (item, changes) => {
    onPreUpdateDrug(item, changes, game.time.worldTime)
  })
  Hooks.on("preUpdateActor", (actor, changes) => {
    onPreUpdateActorDrugs(actor, changes, game.time.worldTime)
  })
  Hooks.on("updateWorldTime", () => queueCheck())
}
