// Drugs on the world clock: the effect lasts its rolled Duration after its Speed (SR5 p. 411-412), then the
// crash lasts its own duration (Chrome Flesh p. 194). The world time a drug enters each phase is noted on it;
// when the clock passes the end of a phase, the GM gets one card with the button that moves the drug on.
// Nothing changes without that click. The phase itself belongs to entities/items/drug-crash.js
import {
  endDrugRise, resetDrugPhase
} from "../entities/items/drug-crash.js"
import {
  drugCrashIsInstant
} from "../entities/items/drug-stat.js"
import {
  drugKeyOf
} from "../entities/items/drug-damage.js"
import {
  _getSRStatusEffect
} from "./effectsList.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"
import {
  escape, isActiveGM as isWriter, fmt, allActors, queuedCheck
} from "./card-helpers.js"

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
    //A crash that is only damage ends as it starts: a drug left in it before (Liesel's D3) gets its card at once
    const d = drugCrashIsInstant(system) ? 0 : durationSeconds(shot.durationContrecoup, shot.durationContrecoupType)
    if (!Number.isFinite(start) || d === null) return null
    //A tail longer than the crash keeps the drug in it until the tail is over
    const parts = crashParts(system, flags)
    return parts ? Math.max(parts.mainEnd, parts.tailEnd) : start + d
  }
  return null
}

// The tail of a crash: a part of it with its own duration, counted from the start of the crash. eX and galak (Chrome
// Flesh p. 186): disorientation "pendant une période similaire à celle de l'effet", and "-2 à sa Limite sociale pendant
// (Constitution) heures", longer or shorter. The effects of the crash marked "tail" follow it, the others the crash.
// { mainEnd, tailEnd }, or null when the drug has no tail
export function crashParts(system, flags){
  const shot = system?.handleShot ?? {
  }
  const start = flags?.crashStart
  const main = durationSeconds(shot.durationContrecoup, shot.durationContrecoupType)
  const tail = durationSeconds(shot.socialLimitContrecoup, shot.socialLimitContrecoupType ?? "hour")
  if (!Number.isFinite(start) || main === null || tail === null) return null
  return {
    mainEnd: start + main, tailEnd: start + tail
  }
}

// The part of a crash over at `now`, before the crash itself: "main" or "tail", or null
export function crashPartOver(system, flags, now){
  const parts = crashParts(system, flags)
  if (!parts || parts.mainEnd === parts.tailEnd) return null
  const part = parts.mainEnd < parts.tailEnd ? "main" : "tail"
  return now >= Math.min(parts.mainEnd, parts.tailEnd) ? part : null
}

// The flags to write with a change of phase: the start of the new phase, the alert of the old one forgotten.
// The crash follows the effect (SR5 p. 411): it starts when the effect ended, even if the GM clicks later.
// Ended early (an interaction, the sheet before the end), it starts now
export function phaseStartFlags(oldPhase, newPhase, now, riseEnd = null){
  if (newPhase === oldPhase) return null
  const part = {
    crashPartOver: null, crashPartNotified: false
  }
  if (newPhase === "rise") return {
    riseStart: now, crashStart: null, drugNotified: false, ...part
  }
  if (newPhase === "crash") return {
    crashStart: (oldPhase === "rise" && Number.isFinite(riseEnd) && riseEnd <= now) ? riseEnd : now, drugNotified: false, ...part
  }
  return {
    riseStart: null, crashStart: null, drugNotified: false, ...part
  }
}

/* -------------------------------------------- */

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
      //The shorter part of a crash with a tail ends first: its own row, its effects removed by the click
      const part = item.system.phase === "crash" ? crashPartOver(item.system, flags, now) : null
      if (part && !flags.crashPartNotified && !flags.crashPartOver && now < end){
        await item.setFlag("sr5", "crashPartNotified", true)
        const parts = crashParts(item.system, flags)
        rows.push({
          actor, item, end: Math.min(parts.mainEnd, parts.tailEnd), phase: "crash", part
        })
      }
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

const queueCheck = queuedCheck(() => checkDrugs(), "Drugs not checked")

async function postDrugCard(rows){
  const over = r => r.part ? `SR5.CALENDAR_DrugCrashPartOver_${r.part}` : (r.phase === "rise" ? "SR5.CALENDAR_DrugRiseOver" : "SR5.CALENDAR_DrugCrashOver")
  const button = r => r.part ? "SR5.CALENDAR_DrugEndCrashPart" : (r.phase === "rise" ? "SR5.CALENDAR_DrugStartCrash" : "SR5.CALENDAR_DrugEndCrash")
  const list = rows.map(r => `<li class="sr5-drug-row" data-item-uuid="${r.item.uuid}" data-phase="${r.phase}"${r.part ? ` data-part="${r.part}"` : ""}>
      <span><strong>${escape(r.actor.name)}</strong> : ${escape(r.item.name)} — ${game.i18n.localize(over(r))}</span>
      <span>${fmt(r.end)}</span>
      <button type="button" data-sr5-drug>${game.i18n.localize(button(r))}</button>
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
  const part = row.dataset.part
  if (part === "main" || part === "tail"){
    if (!item.getFlag("sr5", "crashPartOver")) await item.setFlag("sr5", "crashPartOver", part)
    return true
  }
  if (row.dataset.phase === "rise") return endDrugRise(item)
  return resetDrugPhase(item)
}

// The GM only, on a card a GM posted; a row done is written in the card, so its button does not come back
export function activateDrugCardListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-drug]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-drug]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-drug-row")
    btn.disabled = true
    const done = await act(row).catch(e => SR5_SystemHelpers.srLog(1, `Drug phase not moved: ${e}`))
    if (done) await markRowDoneInMessage(row, "[data-sr5-drug]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}

// Returns nothing: a false from a pre-hook would cancel the update
export function onPreUpdateDrug(item, changes, now){
  if (item.type !== "itemDrug") return
  const newPhase = changes?.system?.phase
  if (newPhase === undefined) return
  const oldPhase = item.system.phase ?? ""
  const riseEnd = oldPhase === "rise" ? phaseEnd(item.system, item.flags?.sr5) : null
  const flags = phaseStartFlags(oldPhase, newPhase, now, riseEnd)
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

/* -------------------------------------------- */

// A crash that puts a status on the actor, by drug key. Trance (Chrome Flesh p. 192): "l'utilisateur reste paralysé
// (voir Paralysie, p. 410, SR5) pour une durée équivalente à celle de l'effet de la drogue", the paralysis that keeps
// from acting (SR5 p. 410: a damage above the Reaction), the status a toxin gives (entityActor-helpers.js)
export const DRUG_CRASH_STATUS = {
  trance: "noAction"
}

// The statuses to create and remove so that the actor bears one for each drug in such a crash, and no other:
// { create: [drug items], remove: [effect ids] }. A status of a drug is told by its flag sr5.drugStatus (the item id)
export function drugStatusChanges(items, effects){
  const drugs = [...(items ?? [])].filter(i => i?.type === "itemDrug" && i.system?.phase === "crash" && DRUG_CRASH_STATUS[drugKeyOf(i.system)])
  const owned = [...(effects ?? [])].filter(e => e?.flags?.sr5?.drugStatus)
  return {
    create: drugs.filter(d => !owned.some(e => e.flags.sr5.drugStatus === d.id)),
    remove: owned.filter(e => !drugs.some(d => d.id === e.flags.sr5.drugStatus)).map(e => e.id)
  }
}

//One sync at a time per actor: the sheet's update may fire both updateActor and updateItem, two syncs would create two statuses
const syncing = new Map()
export function syncDrugStatuses(actor){
  if (!isWriter() || !actor?.items) return
  const key = actor.uuid
  const next = (syncing.get(key) ?? Promise.resolve()).then(() => syncNow(actor)).catch(e => SR5_SystemHelpers.srLog(1, `Drug status not synced: ${e}`))
  syncing.set(key, next)
  return next
}

async function syncNow(actor){
  const {
    create, remove 
  } = drugStatusChanges(actor.items, actor.effects)
  if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove)
  if (!create.length) return
  const statuses = []
  for (const drug of create){
    const status = await _getSRStatusEffect(DRUG_CRASH_STATUS[drugKeyOf(drug.system)])
    status.name = game.i18n.format("SR5.DrugParalysisStatus", {
      drug: drug.name
    })
    status.flags = {
      ...status.flags, sr5: {
        drugStatus: drug.id
      }
    }
    statuses.push(status)
  }
  await actor.createEmbeddedDocuments("ActiveEffect", statuses)
}

export function initDrugClock(){
  Hooks.on("preUpdateItem", (item, changes) => {
    onPreUpdateDrug(item, changes, game.time.worldTime)
  })
  Hooks.on("preUpdateActor", (actor, changes) => {
    onPreUpdateActorDrugs(actor, changes, game.time.worldTime)
  })
  Hooks.on("updateWorldTime", () => queueCheck())
  //A drug enters or leaves its crash by the sheet (the actor's item list), the card or a macro (the item itself)
  Hooks.on("updateItem", (item) => {
    if (item.type === "itemDrug" && item.parent) syncDrugStatuses(item.parent)
  })
  Hooks.on("deleteItem", (item) => {
    if (item.type === "itemDrug" && item.parent) syncDrugStatuses(item.parent)
  })
  Hooks.on("updateActor", (actor, changes) => {
    if (Array.isArray(changes?.items)) syncDrugStatuses(actor)
  })
}
