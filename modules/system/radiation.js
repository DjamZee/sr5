// Radiation zones (Run & Gun p. 164-165): a pollution whose harm grows with the time spent in it.
// Light and Moderate: Nausea as a toxin whose Power rises with time (R&G p. 164-165). Severe, Extreme and Deadly
// give no figures: they follow the Environment fatigue of SR5 p. 174 (1S, 2S, 3S… every interval), plus the
// Nausea (arbitrage de DjamZ, 2026-10-05). The test is Body + Willpower + radiation shielding dice (R&G p. 100)
// + Radiation tolerance (Chrome Flesh p. 170). Antirad (Chrome Flesh p. 151) takes one level off per rating, and
// Radiation tolerance one more; the two add up, and below Light nothing happens (arbitrage de DjamZ, 2026-10-05).
// As for diseases, everything that counts lives in a hidden world setting written by the active GM alone, and
// nothing moves without a click of the GM.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  cardFromGM
} from "./card-rows.js"
import {
  hitsAboveDice
} from "./diseases.js"

export const RADIATION_LEDGER = "sr5RadiationLedger"

export const RADIATION_LEVELS = ["light", "moderate", "severe", "extreme", "deadly"]

const HOUR = 3600

// first: time before the first test; every: time between two tests; power: the Power of the first test,
// +1 at each following test; fatigue: the remaining Power is also Stun damage
export const RADIATION_SCHEDULE = {
  light: {
    first: 20 * HOUR, every: 12 * HOUR, power: 2, fatigue: false 
  },
  moderate: {
    first: 18 * HOUR, every: 6 * HOUR, power: 3, fatigue: false 
  },
  severe: {
    first: HOUR, every: HOUR, power: 1, fatigue: true 
  },
  extreme: {
    first: 60, every: 60, power: 1, fatigue: true 
  },
  deadly: {
    first: 6, every: 6, power: 1, fatigue: true 
  },
}

/* -------------------------------------------- */
/* Rules, without Foundry                       */
/* -------------------------------------------- */

// The levels Antirad and Radiation tolerance take off (Chrome Flesh p. 151 and 170), added up
export function radiationReduction(actorData){
  const modifiers = actorData?.specialProperties?.antirad?.modifiers ?? []
  return modifiers.reduce((sum, m) => sum + Math.max(0, Number(m.value) || 0), 0)
}

// The level the character feels, or null below Light
export function effectiveLevel(level, reduction = 0){
  const index = RADIATION_LEVELS.indexOf(level)
  if (index < 0) return null
  const felt = index - Math.max(0, Number(reduction) || 0)
  return felt < 0 ? null : RADIATION_LEVELS[felt]
}

export function nextTestAt(entry){
  const s = RADIATION_SCHEDULE[entry.level]
  return entry.since + s.first + entry.testsDone * s.every
}

export function testPower(entry){
  return RADIATION_SCHEDULE[entry.level].power + entry.testsDone
}

// What a test leaves: each hit takes 1 off the Power; what is left is the Nausea's Power, and the Stun damage
// at Severe and above
export function testOutcome(level, power, hits){
  const remaining = Math.max(0, power - Math.max(0, Number(hits) || 0))
  return {
    remaining, nausea: remaining > 0, stun: RADIATION_SCHEDULE[level].fatigue ? remaining : 0
  }
}

// The test's dice, as the GM works them out: Body + Willpower, and every bonus on radiation resistance
// that is neither the Body nor the armor (armor gives nothing against radiation unless shielded, GRI p. 105)
export function radiationModifiers(actorData){
  return (actorData?.resistances?.specialDamage?.radiation?.modifiers ?? [])
    .filter(m => !["linkedAttribute", "armor", "armorAccessory"].includes(m.type))
}

export function radiationPool(actorData){
  const a = actorData?.attributes ?? {
  }
  const base = (a.body?.augmented?.value ?? 0) + (a.willpower?.augmented?.value ?? 0)
  return Math.max(0, base + radiationModifiers(actorData).reduce((sum, m) => sum + (Number(m.value) || 0), 0))
}

export function newExposure({
  id, actorUuid, actorName, sceneLevel, reduction, now 
}){
  const level = effectiveLevel(sceneLevel, reduction)
  if (!level) return null
  return {
    id, actorUuid, actorName, sceneLevel, level, reduction, since: now, testsDone: 0, notified: false, request: null, state: "open"
  }
}

export function dueExposures(ledger, now){
  return Object.values(ledger?.exposures ?? {
  }).filter(e => e.state === "open" && !e.notified && now >= nextTestAt(e))
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function radiationLedger(){
  try {
    return game.settings.get("sr5", RADIATION_LEDGER) ?? {
      exposures: {
      }
    }
  } catch {
    return {
      exposures: {
      }
    }
  }
}

async function writeEntry(entry){
  if (!isActiveGM()) return false
  const ledger = foundry.utils.duplicate(radiationLedger())
  ledger.exposures ??= {
  }
  ledger.exposures[entry.id] = entry
  await game.settings.set("sr5", RADIATION_LEDGER, ledger)
  return true
}

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)
const levelName = (level) => game.i18n.localize(CONFIG.SR5.radiationLevels?.[level] ?? level)

function playerOwners(actor){
  return game.users.filter(u => !u.isGM && actor?.testUserPermission(u, "OWNER")).map(u => u.id)
}

function reminders(){
  return `<p class="notes">${game.i18n.localize("SR5.RADIATION_Reminders")}</p>`
}

function row(e, text, buttons){
  return `<li class="sr5-radiation-row" data-exposure-id="${e.id}"><span>${text}</span>
    <span class="sr5-radiation-buttons">${buttons}</span></li>`
}

const endButton = () => `<button type="button" data-sr5-radiation="end">${game.i18n.localize("SR5.RADIATION_End")}</button>`

/* Exposing ----------------------------------- */

// The GM exposes characters of a scene; the level comes from the scene, he can change it in the window
export async function exposeToRadiation(scene){
  if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_ActiveGMOnly"))
  const sceneActors = (scene?.tokens ?? []).map(t => t.actor).filter(a => a && (a.type === "actorPc" || a.type === "actorGrunt"))
  const candidates = [...new Map(sceneActors.map(a => [a.uuid, a])).values()]
  if (!candidates.length) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_NoTarget"))
  const selected = new Set((canvas?.tokens?.controlled ?? []).map(t => t.actor?.uuid))
  const preset = scene.getFlag?.("sr5", "environRadiation") || "light"
  const options = RADIATION_LEVELS.map(l => `<option value="${l}" ${l === preset ? "selected" : ""}>${escape(levelName(l))}</option>`).join("")
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.RADIATION_Title"
    },
    content: `<div class="sr5-radiation-actors">${candidates.map(a => `<label><input type="checkbox" name="actor" value="${a.uuid}" ${!selected.size || selected.has(a.uuid) ? "checked" : ""}> ${escape(a.name)}</label>`).join("<br>")}</div>
      <div class="form-group"><label>${game.i18n.localize("SR5.RADIATION_Level")}</label><select name="level">${options}</select></div>`,
    ok: {
      callback: (event, button) => ({
        level: button.form.elements.level.value,
        actors: [...button.form.querySelectorAll("input[name=actor]:checked")].map(i => i.value),
      })
    },
    rejectClose: false,
  })
  if (!data) return
  const now = game.time.worldTime
  const rows = []
  for (const actor of candidates.filter(a => data.actors.includes(a.uuid))){
    const reduction = radiationReduction(actor.system)
    const entry = newExposure({
      id: foundry.utils.randomID(), actorUuid: actor.uuid, actorName: actor.name, sceneLevel: data.level, reduction, now
    })
    if (!entry) {
      rows.push(`<li>${game.i18n.format("SR5.RADIATION_Shielded", {
        actor: escape(actor.name) 
      })}</li>`)
      continue
    }
    await writeEntry(entry)
    rows.push(row(entry, game.i18n.format("SR5.RADIATION_Exposed", {
      actor: escape(actor.name), level: escape(levelName(entry.level)), time: game.time.calendar.format(nextTestAt(entry))
    }), endButton()))
  }
  await ChatMessage.create({
    content: `<div class="sr5-radiation-card"><h3>${game.i18n.localize("SR5.RADIATION_Title")} — ${escape(levelName(data.level))}</h3><ul>${rows.join("")}</ul>${reminders()}</div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        radiationDue: true
      }
    },
  })
}

/* The clock ---------------------------------- */

export async function checkRadiation(){
  if (!isActiveGM()) return
  const ledger = radiationLedger()
  const due = dueExposures(ledger, game.time.worldTime)
  if (!due.length) return
  const next = foundry.utils.duplicate(ledger)
  for (const e of due) next.exposures[e.id].notified = true
  await game.settings.set("sr5", RADIATION_LEDGER, next)
  const rows = due.map(e => row(e, game.i18n.format("SR5.RADIATION_Due", {
    actor: escape(e.actorName), level: escape(levelName(e.level)), power: testPower(e)
  }), `<button type="button" data-sr5-radiation="request">${game.i18n.localize("SR5.DISEASE_Request")}</button>${endButton()}`))
  await ChatMessage.create({
    content: `<div class="sr5-radiation-card"><h3>${game.i18n.localize("SR5.RADIATION_Title")}</h3><ul>${rows.join("")}</ul>${reminders()}</div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        radiationDue: true
      }
    },
  })
}

// The GM asks for the test: a card to the player, with the roll button. The ledger keeps a token of the request;
// only a roll carrying it can be applied, and only once
async function requestTest(entryId){
  const entry = radiationLedger().exposures?.[entryId]
  if (!entry || entry.state !== "open") return
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return
  const token = foundry.utils.randomID()
  const power = testPower(entry)
  await writeEntry({
    ...entry, request: {
      token, power 
    }
  })
  await ChatMessage.create({
    content: `<div class="sr5-radiation-card"><h3>${game.i18n.localize("SR5.RADIATION_Title")}</h3>
      <p>${game.i18n.format("SR5.RADIATION_RequestText", {
    actor: escape(actor.name), power 
  })}</p>
      <button type="button" data-sr5-radiation-roll>${game.i18n.localize("SR5.DISEASE_Roll")}</button></div>`,
    whisper: [...playerOwners(actor), ...gmIds()],
    flags: {
      sr5: {
        radiationRequest: {
          exposureId: entry.id, token 
        }
      }
    },
  })
}

async function endExposure(entryId){
  const entry = radiationLedger().exposures?.[entryId]
  if (!entry || entry.state !== "open") return
  await writeEntry({
    ...entry, state: "ended", request: null
  })
  ui.notifications.info(game.i18n.format("SR5.RADIATION_Ended", {
    actor: entry.actorName 
  }))
}

export function activateRadiationDueListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-radiation]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-radiation]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const id = btn.closest(".sr5-radiation-row")?.dataset.exposureId
    if (!id) return
    btn.disabled = true
    if (btn.dataset.sr5Radiation === "end") await endExposure(id)
    else await requestTest(id)
  }))
}

// The request card: believed only from a GM; the player of the character, or a GM, rolls
export function activateRadiationRequestListeners(html, message){
  const req = message.flags?.sr5?.radiationRequest
  const button = html.querySelector("[data-sr5-radiation-roll]")
  if (!button) return
  if (!cardFromGM(message)) return button.remove()
  button.addEventListener("click", async () => {
    const entry = radiationLedger().exposures?.[req.exposureId]
    if (!entry?.request || entry.request.token !== req.token) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_RequestGone"))
    const actor = await fromUuid(entry.actorUuid)
    if (!actor?.isOwner) return
    actor.rollTest("resistanceRadiation", null, {
      radiation: {
        exposureId: entry.id, token: req.token, power: entry.request.power 
      }
    })
  })
}

// The active GM's "Apply" button on the roll: the card is the player's, so it only suggests the hits. The GM works
// the pool out again from the character, the hits are capped by it, and he confirms before anything moves
export function addRadiationApplyButton(message, html){
  if (!isActiveGM()) return
  const ref = message.flags?.sr5data?.radiation
  const entry = radiationLedger().exposures?.[ref?.exposureId]
  if (!entry?.request || entry.request.token !== ref.token) return
  const button = document.createElement("button")
  button.type = "button"
  button.classList.add("sr5-radiation-apply")
  button.innerHTML = `<i class="fa-solid fa-radiation"></i> ${game.i18n.localize("SR5.RADIATION_Apply")}`
  button.addEventListener("click", () => applyFromCard(message, button).catch(e => SR5_SystemHelpers.srLog(1, `Radiation test not applied: ${e}`)))
  const anchor = html.querySelector("#srButtonTest") ?? html.querySelector(".message-content")
  anchor?.after?.(button)
}

async function applyFromCard(message, button){
  const ref = message.flags?.sr5data?.radiation
  const entry = radiationLedger().exposures?.[ref?.exposureId]
  if (!entry?.request || entry.request.token !== ref.token) return button.remove()
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return
  const pool = radiationPool(actor.system)
  const suggested = Math.max(0, Number(message.flags?.sr5data?.roll?.hits) || 0)
  const alert = hitsAboveDice(suggested, pool) ? `<p class="sr5-disease-alert" style="color: #c00; font-weight: bold;">${game.i18n.localize("SR5.DISEASE_HitsAbovePool")}</p>` : ""
  const power = entry.request.power
  const hits = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.RADIATION_Apply"
    },
    content: `<p>${game.i18n.format("SR5.RADIATION_ApplyText", {
      actor: escape(entry.actorName), power 
    })}</p>
      <p>${game.i18n.format("SR5.DISEASE_CardPool", {
    pool, hits: suggested 
  })}</p>${alert}
      <div class="form-group"><label>${game.i18n.localize("SR5.DISEASE_Hits")}</label><input type="number" name="hits" value="${Math.min(suggested, pool)}" min="0" max="${pool}"></div>`,
    ok: {
      callback: (event, b) => Number(b.form.elements.hits.value) || 0
    },
    rejectClose: false,
  })
  if (hits === null || hits === undefined) return
  //Read again after the window: a second click may have applied it meanwhile
  const fresh = radiationLedger().exposures?.[ref.exposureId]
  if (!fresh?.request || fresh.request.token !== ref.token || button.disabled) return button.remove()
  button.disabled = true
  const outcome = testOutcome(fresh.level, fresh.request.power, Math.min(Math.max(0, hits), pool))
  await writeEntry({
    ...fresh, testsDone: fresh.testsDone + 1, notified: false, request: null
  })
  button.remove()
  if (outcome.remaining > 0) await applyOutcome(actor, outcome)
  await ChatMessage.create({
    content: `<div class="sr5-radiation-card"><h3>${game.i18n.localize("SR5.RADIATION_Title")}</h3><p>${game.i18n.format(outcome.remaining > 0 ? (outcome.stun ? "SR5.RADIATION_OutcomeStun" : "SR5.RADIATION_OutcomeNausea") : "SR5.RADIATION_OutcomeNone", {
      actor: escape(fresh.actorName), power: fresh.request.power, hits: Math.min(Math.max(0, hits), pool), remaining: outcome.remaining
    })}</p></div>`,
    whisper: [...playerOwners(actor), ...gmIds()],
  })
}

// Nausea as a toxin's (SR5 p. 410, with "cannot act" when the Power left is over the Willpower), and the Stun
async function applyOutcome(actor, outcome){
  const {
    SR5_PrepareRollTest 
  } = await import("../rolls/roll-prepare.js")
  const data = SR5_PrepareRollTest.getBaseRollData(null, actor)
  data.damage.value = outcome.remaining
  data.damage.type = outcome.stun ? "stun" : ""
  data.damage.toxin = {
    type: "custom", custom: {
      name: game.i18n.localize("SR5.RADIATION_Title") 
    }, effect: {
      nausea: true 
    }
  }
  await actor.applyToxinEffect(data)
}

/* -------------------------------------------- */

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
      await checkRadiation().catch(e => SR5_SystemHelpers.srLog(1, `Radiation not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

export function initRadiation(){
  Hooks.on("updateWorldTime", () => queueCheck())
}

export function registerRadiationSettings(){
  game.settings.register("sr5", RADIATION_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      exposures: {
      }
    },
  })
}
