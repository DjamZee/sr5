// Diseases (Run Faster p. 111-112; pathogens of Bullets & Bandages p. 20-21): a toxin that comes back.
// The Speed is the incubation and the time between two resistance tests; the number in brackets is the least
// number of tests to make, even once the Power is down to 0. The Power left after a test is added to the next
// one. The disease is beaten when that number of tests is made and the Power is 0.
// Everything that counts lives in a hidden world setting written by the active GM alone, never on the actor or on
// a chat card: a player owns both and could write anything in them. Nothing moves without a click of the GM.
import {
  calendarStartYear, addCalendarMonths
} from "./calendar.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"
import {
  updateLedger
} from "./gm-ledger.js"
import {
  SR5_Toxins
} from "../entities/items/toxins.js"
import {
  recountHits
} from "../rolls/roll-helpers/socket-guard.js"

export const DISEASE_LEDGER = "sr5DiseaseLedger"
export const REVEAL_DISEASES_SETTING = "sr5RevealDiseases"

export const DISEASE_UNITS = {
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
}

// The world time one interval after "time": months are calendar months (DjamZ's ruling, 2026-10-06)
export function afterInterval(time, interval, startYear){
  const n = Math.max(1, Number(interval?.value) || 1)
  if (interval?.unit === "month") return addCalendarMonths(time, n, startYear)
  return time + n * (DISEASE_UNITS[interval?.unit] ?? DISEASE_UNITS.day)
}

// The pathogen part of a toxin item, as the ledger keeps it: a copy, so editing the item changes no infection
export function profileFromToxin(item){
  const s = item?.system ?? {
  }
  const p = s.pathogen ?? {
  }
  const on = (obj) => Object.keys(obj ?? {
  }).filter(k => obj[k] === true)
  return {
    name: item?.name ?? "",
    itemUuid: item?.uuid ?? "",
    vectors: on(s.vector),
    power: Number(s.power) || 0,
    //A protection system loses this much (Run Faster p. 112), written as a negative value as for toxins
    penetration: -Math.abs(Number(s.penetration) || 0),
    effects: on(s.effect),
    pathogenEffects: on(p.effect),
    damageType: s.damageType || "",
    interval: {
      value: Number(p.interval?.value) || 1, unit: p.interval?.unit || "day"
    },
    minTests: Math.max(1, Number(p.minTests) || 1),
    volunteerPenalty: Number(p.volunteerPenalty) || 0,
    nature: p.nature ?? "",
    finalEffect: p.finalEffect ?? "",
    special: s.special ?? "",
  }
}

// A new infection: no test before the end of the incubation, which is one interval (Run Faster p. 111)
export function newInfection(profile, {
  id, actorUuid, actorName, vector, now, startYear, doses = 1, volunteer = false
}){
  return {
    id, actorUuid, actorName,
    profile,
    vector: vector || profile.vectors[0] || "contact",
    //Several doses at once: +1 Power per extra dose (SR5 p. 410)
    basePower: profile.power + Math.max(0, (Number(doses) || 1) - 1),
    exposedAt: now,
    nextTest: afterInterval(now, profile.interval, startYear),
    testsDone: 0,
    carry: 0,
    residual: 0,
    treatment: 0,
    volunteer: !!volunteer,
    state: "incubating",
    notified: false,
    request: null,
    recovery: 0,
    history: [],
  }
}

// Exposed again while infected: the doses add up, +1 Power each (SR5 p. 410; DjamZ's ruling, 2026-10-06)
export function reexpose(entry, doses = 1){
  return {
    ...entry, basePower: entry.basePower + Math.max(1, Number(doses) || 1)
  }
}

export function isOpen(entry){
  return entry?.state === "incubating" || entry?.state === "active" || entry?.state === "recovering"
}

// The Power of the next test: the disease, what the last test left (Run Faster p. 112), and +2 for an
// Immunodeficient character (SR5 p. 83)
export function testPower(entry, immunodeficient = false){
  return entry.basePower + (Number(entry.carry) || 0) + (immunodeficient ? 2 : 0)
}

// The dice pool modifiers of the test, besides the character's own resistance: the treatment (Heal Disease,
// SR5 p. 291) and, on the first test only, the penalty of a willing subject (Cypher, Bullets & Bandages p. 21)
export function testModifiers(entry){
  const mods = []
  if (Number(entry.treatment) > 0) mods.push({
    type: "diseaseTreatment", value: Number(entry.treatment)
  })
  if (entry.volunteer && entry.testsDone === 0 && entry.profile.volunteerPenalty) mods.push({
    type: "diseaseVolunteer", value: -Math.abs(entry.profile.volunteerPenalty)
  })
  return mods
}

// The penetration takes off only what protection systems give (Run Faster p. 112), never more than they give
export function penetrationModifier(penetration, protection){
  const p = Math.abs(Number(penetration) || 0)
  return 0 - Math.min(p, Math.max(0, Number(protection) || 0))
}

// The modifier types that are protection systems: the gear and implants the penetration reduces (Run Faster
// p. 112), not Body, Willpower, the dwarves' resistance or the Pathogen Resistance quality (DjamZ, 2026-10-06)
export const PROTECTION_TYPES = ["itemAugmentation", "itemArmor", "itemGear", "itemDrug"]

export function protectionOf(modifiers){
  return (modifiers ?? []).filter(m => PROTECTION_TYPES.includes(m.type)).reduce((sum, m) => sum + (Number(m.value) || 0), 0)
}

// The ledger once the GM applied a test: the hits are the GM's, read on the card and confirmed by him
export function applyResult(entry, hits, power, startYear){
  const residual = Math.max(0, (Number(power) || 0) - Math.max(0, Number(hits) || 0))
  const testsDone = entry.testsDone + 1
  const history = [...(entry.history ?? []), {
    power, hits: Number(hits) || 0, residual
  }]
  const base = {
    ...entry, testsDone, history, request: null, notified: false
  }
  if (testsDone >= entry.profile.minTests && residual === 0){
    //Treated, Cryptococcus gives back 1 Essence every 24 hours (Bullets & Bandages p. 21)
    const lost = entry.profile.pathogenEffects.includes("essenceLoss") ? entry.residual : 0
    if (lost > 0) return {
      ...base, carry: 0, residual: 0, recovery: lost, state: "recovering", nextTest: entry.nextTest + DISEASE_UNITS.day
    }
    return {
      ...base, carry: 0, residual: 0, state: "cured", nextTest: null
    }
  }
  //The Power left is added to the next test only up to the least number of tests; past it, each test starts
  //again from the base Power until one brings it to 0 (lecture d'Élise, RF p. 112)
  return {
    ...base, carry: testsDone < entry.profile.minTests ? residual : 0, residual, state: "active",
    nextTest: afterInterval(entry.nextTest, entry.profile.interval, startYear),
  }
}

// The least number of tests made and some Power left: the final effect falls due (RF p. 112), written, never applied
export function finalEffectDue(entry){
  return entry?.state === "active" && entry.testsDone >= entry.profile.minTests && entry.residual > 0
}

// What this disease lowers, down to 0 on the prepared actor: Strength, Logic and Willpower for a disease that reduces
// them, the Essence for one that takes it, and only while it does (Red Mask, Bullets & Bandages p. 21: "if one of
// these attributes is reduced to zero"). An attribute the disease leaves alone is not its zero (Yolande, 06/10)
export function reachedZero(actor, entry){
  const s = actor?.system
  if (!s) return false
  const effects = currentEffects(entry)
  const values = effects.attributes ? ["strength", "logic", "willpower"].map(k => s.attributes?.[k]?.augmented?.value) : []
  if (effects.essence && s.essence) values.push(s.essence.value)
  return values.some(v => typeof v === "number" && v <= 0)
}

// The pool of the test, worked out again by the GM from the character and the ledger: the card's own pool is the
// player's, and a card raising hits and pool together kept the alert silent (security, 06/10)
export function diseasePool(actorData, entry){
  const own = actorData?.resistances?.disease?.[entry.vector]?.modifiers ?? []
  const sum = (mods) => mods.reduce((total, m) => total + (Number(m.value) || 0), 0)
  return Math.max(0, sum(own) + sum(testModifiers(entry)) + penetrationModifier(entry.profile?.penetration, protectionOf(own)))
}

// The most hits the GM believes: the pool he worked out, plus the Edge of the sheet when the roll pushed the limit
// (SR5 p. 56 VO, p. 58 VF « Repousser les limites »). Only whether it pushed is read on the card, and claiming it never
// gives more than the sheet's Edge. Past this figure the GM is warned
export function hitsCeiling(pool, actorData, card){
  const edge = card?.edge?.hasUsedPushTheLimit ? Math.max(0, Number(actorData?.specialAttributes?.edge?.augmented?.value) || 0) : 0
  return Math.max(0, Number(pool) || 0) + edge
}

// The most hits the GM may keep: the pool, unless the roll pushed the limit, whose sixes explode (SR5 p. 56 VO, p. 58
// VF), so a true roll can pass pool + Edge: the GM is warned, and his figure is kept (Élise, 06/10)
export function hitsCap(pool, card){
  return card?.edge?.hasUsedPushTheLimit ? Infinity : Math.max(0, Number(pool) || 0)
}

// A card claiming more hits than it rolled dice was written by hand
export function hitsAboveDice(hits, pool){
  return (Number(hits) || 0) > Math.max(0, Number(pool) || 0)
}

// A disease roll the GM may apply: written by a GM, or by an owner of the infected character. A chat card is its
// author's to write, flags included: anyone else names the infection only by forging a card (security 06/10)
export function diseaseCardTrusted(author, actor){
  if (!author) return false
  return !!author.isGM || !!actor?.testUserPermission?.(author, "OWNER")
}

// The hits the GM's window starts from: a GM's card as written; a player's counted again on its dice, the first `pool`
// of them and the rerolls of the Rule of Six after (SR5 p. 44, 58), never what the card says. null: no dice shown
export function diseaseCardHits(card, fromGM, pool){
  if (fromGM) return Math.max(0, Number(card?.roll?.hits) || 0)
  return recountHits(card?.roll?.r, pool)
}

// One day of recovery more (Bullets & Bandages p. 21)
export function applyRecovery(entry){
  const recovery = Math.max(0, (Number(entry.recovery) || 0) - 1)
  if (!recovery) return {
    ...entry, recovery: 0, state: "cured", nextTest: null, notified: false
  }
  return {
    ...entry, recovery, nextTest: entry.nextTest + DISEASE_UNITS.day, notified: false
  }
}

// What the disease does to the character now: the Power left by the last test drives the effects (SR5 p. 410,
// Bullets & Bandages p. 21). Nothing during the incubation, nothing once the Power is 0
export function currentEffects(entry){
  if (entry?.state === "recovering") return {
    essence: entry.recovery
  }
  if (entry?.state !== "active" || !(entry.residual > 0)) return {
  }
  const r = entry.residual
  const p = entry.profile
  const out = {
  }
  if (p.effects.includes("disorientation")) out.disorientation = true
  if (p.effects.includes("nausea")) out.nausea = true
  if (p.pathogenEffects.includes("reducedAttributes")) out.attributes = r
  if (p.pathogenEffects.includes("essenceLoss")) out.essence = r
  return out
}

// The effects of all the open infections of one actor, summed
export function effectsFor(ledger, actorUuid){
  const sum = {
    disorientation: false, nausea: false, attributes: 0, essence: 0, names: []
  }
  for (const entry of Object.values(ledger?.infections ?? {
  })){
    if (entry.actorUuid !== actorUuid) continue
    const e = currentEffects(entry)
    if (!Object.keys(e).length) continue
    sum.names.push(entry.profile.name)
    if (e.disorientation) sum.disorientation = true
    if (e.nausea) sum.nausea = true
    sum.attributes += e.attributes ?? 0
    sum.essence += e.essence ?? 0
  }
  return sum
}

// The infections whose deadline the clock has passed and of which the GM was not told yet
export function dueEntries(ledger, now){
  return Object.values(ledger?.infections ?? {
  }).filter(e => isOpen(e) && Number.isFinite(e.nextTest) && now >= e.nextTest && !e.notified)
}

// The open infection of this pathogen on this actor, if any
export function openInfectionOf(ledger, actorUuid, name){
  return Object.values(ledger?.infections ?? {
  }).find(e => e.actorUuid === actorUuid && e.profile.name === name && isOpen(e)) ?? null
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function diseaseLedger(){
  try {
    return game.settings.get("sr5", DISEASE_LEDGER) ?? {
      infections: {
      }
    }
  } catch {
    return {
      infections: {
      }
    }
  }
}

async function writeEntry(entry){
  if (!isActiveGM()) return false
  await updateLedger(DISEASE_LEDGER, ledger => {
    ledger.infections ??= {
    }
    ledger.infections[entry.id] = entry
    return ledger
  })
  refreshActor(entry.actorUuid)
  return true
}

// Applies a test to the infection of a request only while the register still holds that request's token, read in the
// register's turn: the entry written, or null when the request was gone
async function writeRequested(ref, change){
  if (!isActiveGM()) return null
  let written = null
  await updateLedger(DISEASE_LEDGER, ledger => {
    const entry = ledger.infections?.[ref?.infectionId]
    if (!entry?.request || entry.request.token !== ref.token) return null
    written = change(entry)
    ledger.infections[entry.id] = written
    return ledger
  })
  if (written) refreshActor(written.actorUuid)
  return written
}

// The actor reads the ledger while it prepares: drawn again once the ledger moved
function refreshActor(uuid){
  const actor = fromUuidSync(uuid)
  if (!actor) return
  actor.reset()
  actor.sheet?.rendered && actor.sheet.render(false)
}

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

const fmt = (t) => game.time.calendar.format(t)
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)

function playerOwners(actor){
  return game.users.filter(u => !u.isGM && actor?.testUserPermission(u, "OWNER")).map(u => u.id)
}

function isImmunodeficient(actor){
  return !!actor?.system?.specialProperties?.immunodeficiency
}

/* Infecting ---------------------------------- */

// The GM infects the tokens he selected or targeted with a pathogen item; with none, he ticks characters in a list
// (a character off the scene can fall ill too)
export async function infectWith(item){
  if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_ActiveGMOnly"))
  const picked = [...new Set([...game.user.targets, ...(canvas?.tokens?.controlled ?? [])].map(t => t.actor).filter(Boolean))]
  const candidates = picked.length ? picked : game.actors.filter(a => a.type === "actorPc" || a.type === "actorGrunt")
  if (!candidates.length) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_NoTarget"))
  const profile = profileFromToxin(item)
  const vectors = profile.vectors.length ? profile.vectors : ["contact"]
  const vectorOptions = vectors.map(v => `<option value="${v}">${escape(game.i18n.localize(CONFIG.SR5.propagationVectors?.[v] ?? v))}</option>`).join("")
  const volunteer = profile.volunteerPenalty ? `<div class="form-group"><label>${game.i18n.format("SR5.DISEASE_Volunteer", {
    n: profile.volunteerPenalty
  })}</label><input type="checkbox" name="volunteer"></div>` : ""
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.format("SR5.DISEASE_InfectTitle", {
        name: item.name
      })
    },
    content: `<div class="sr5-disease-actors">${candidates.map(a => `<label><input type="checkbox" name="actor" value="${a.uuid}" ${picked.length ? "checked" : ""}> ${escape(a.name)}</label>`).join("<br>")}</div>
      <div class="form-group"><label>${game.i18n.localize("SR5.ToxinVector")}</label><select name="vector">${vectorOptions}</select></div>
      <div class="form-group"><label>${game.i18n.localize("SR5.DISEASE_Doses")}</label><input type="number" name="doses" value="1" min="1"></div>
      ${volunteer}`,
    ok: {
      callback: (event, button) => ({
        vector: button.form.elements.vector.value,
        doses: Number(button.form.elements.doses.value) || 1,
        volunteer: !!button.form.elements.volunteer?.checked,
        actors: [...button.form.querySelectorAll("input[name=actor]:checked")].map(i => i.value),
      })
    },
    rejectClose: false,
  })
  if (!data) return
  const now = game.time.worldTime
  const startYear = calendarStartYear()
  const actors = candidates.filter(a => data.actors.includes(a.uuid))
  if (!actors.length) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_NoTarget"))
  const immune = []
  for (const actor of actors){
    //A gas mask or a chemical seal also keeps a pathogen out by its vector (SR5 p. 410)
    const sources = SR5_Toxins.immunitySources(actor.system, data.vector)
    if (sources.length) {
      immune.push(`${actor.name} (${sources.join(", ")})`)
      continue
    }
    const open = openInfectionOf(diseaseLedger(), actor.uuid, profile.name)
    if (open) await writeEntry(reexpose(open, data.doses))
    else await writeEntry(newInfection(profile, {
      id: foundry.utils.randomID(), actorUuid: actor.uuid, actorName: actor.name, now, startYear,
      vector: data.vector, doses: data.doses, volunteer: data.volunteer,
    }))
  }
  if (immune.length) ui.notifications.info(game.i18n.format("SR5.DISEASE_Immune", {
    names: immune.join(" ; ")
  }))
  ui.notifications.info(game.i18n.format("SR5.DISEASE_Infected", {
    name: item.name, count: actors.length - immune.length
  }))
}

/* The clock ---------------------------------- */

export async function checkDiseases(){
  if (!isActiveGM()) return
  let due = []
  // In the ledger's turn: an infection entered meanwhile is not erased by the clock (gm-ledger.js)
  await updateLedger(DISEASE_LEDGER, next => {
    due = dueEntries(next, game.time.worldTime)
    if (!due.length) return null
    for (const e of due) next.infections[e.id].notified = true
    return next
  })
  if (!due.length) return
  await postDueCard(due)
}

function dueText(e){
  const key = e.state === "recovering" ? "SR5.DISEASE_DueRecovery" : (e.state === "incubating" ? "SR5.DISEASE_DueFirst" : "SR5.DISEASE_DueTest")
  return game.i18n.format(key, {
    actor: escape(e.actorName), name: escape(e.profile.name), n: e.testsDone + 1, min: e.profile.minTests
  })
}

async function postDueCard(entries){
  const list = entries.map(e => `<li class="sr5-disease-row" data-infection-id="${e.id}">
      <span>${dueText(e)}</span>
      <span>${fmt(e.nextTest)}</span>
      <span class="sr5-disease-buttons">${e.state === "recovering" ?
    `<button type="button" data-sr5-disease="recover">${game.i18n.localize("SR5.DISEASE_Recover")}</button>` :
    `<button type="button" data-sr5-disease="request">${game.i18n.localize("SR5.DISEASE_Request")}</button>`}
      <button type="button" data-sr5-disease="treat">${game.i18n.localize("SR5.DISEASE_Treat")}</button></span>
    </li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-disease-card"><h3>${game.i18n.localize("SR5.DISEASE_Title")}</h3><ul>${list}</ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        diseaseDue: true
      }
    },
  })
}

// The GM asks for the test: a card to the player of the character, with the roll button. The ledger keeps a
// token of that request; only a roll carrying it can be applied, and only once
async function requestTest(entryId){
  if (!isActiveGM()) return false
  const entry = diseaseLedger().infections?.[entryId]
  if (!entry || !isOpen(entry)) return true
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return false
  const token = foundry.utils.randomID()
  const power = testPower(entry, isImmunodeficient(actor))
  await writeEntry({
    ...entry, request: {
      token, power
    }
  })
  const reveal = game.settings.get("sr5", REVEAL_DISEASES_SETTING)
  const detail = reveal ? ` — ${game.i18n.format("SR5.DISEASE_Detail", {
    power, n: entry.testsDone + 1, min: entry.profile.minTests
  })}` : ""
  await ChatMessage.create({
    content: `<div class="sr5-disease-card"><h3>${game.i18n.localize("SR5.DISEASE_RequestTitle")}</h3>
      <p>${game.i18n.format("SR5.DISEASE_RequestText", {
    actor: escape(actor.name), name: escape(entry.profile.name)
  })}${detail}</p>
      <button type="button" data-sr5-disease-roll>${game.i18n.localize("SR5.DISEASE_Roll")}</button></div>`,
    whisper: [...playerOwners(actor), ...gmIds()],
    flags: {
      sr5: {
        diseaseRequest: {
          infectionId: entry.id, token
        }
      }
    },
  })
  return true
}

async function recover(entryId){
  const entry = diseaseLedger().infections?.[entryId]
  if (!entry || entry.state !== "recovering") return true
  return writeEntry(applyRecovery(entry))
}

// Heal Disease (SR5 p. 291): its net hits, typed by the GM, are a bonus to every test until the end
async function treat(entryId){
  const entry = diseaseLedger().infections?.[entryId]
  if (!entry) return true
  const value = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.DISEASE_Treat"
    },
    content: `<div class="form-group"><label>${game.i18n.localize("SR5.DISEASE_TreatHint")}</label><input type="number" name="treatment" value="${entry.treatment}" min="0"></div>`,
    ok: {
      callback: (event, button) => Number(button.form.elements.treatment.value) || 0
    },
    rejectClose: false,
  })
  if (value === null || value === undefined) return false
  await writeEntry({
    ...entry, treatment: Math.max(0, value)
  })
  return false
}

const DUE_ACTIONS = {
  request: requestTest, recover, treat,
}

export function activateDiseaseDueListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-disease]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-disease]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-disease-row")
    //The ledger is the active GM's: another GM's request carried a token the ledger never kept, and the player's
    //roll was "already applied" (Inès)
    if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_ActiveGMOnly"))
    btn.disabled = true
    const done = await DUE_ACTIONS[btn.dataset.sr5Disease](row.dataset.infectionId).catch(e => SR5_SystemHelpers.srLog(1, `Disease action failed: ${e}`))
    if (done && btn.dataset.sr5Disease !== "treat") await markRowDoneInMessage(row, "[data-sr5-disease=request],[data-sr5-disease=recover]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}

/* The roll ------------------------------------ */

// The request card: believed only from a GM; the player of the character, or a GM, rolls
export function activateDiseaseRequestListeners(html, message){
  const req = message.flags?.sr5?.diseaseRequest
  const button = html.querySelector("[data-sr5-disease-roll]")
  if (!button) return
  if (!cardFromGM(message)) return button.remove()
  button.addEventListener("click", async () => {
    const entry = diseaseLedger().infections?.[req.infectionId]
    if (!entry?.request || entry.request.token !== req.token) return ui.notifications.warn(game.i18n.localize("SR5.DISEASE_RequestGone"))
    const actor = await fromUuid(entry.actorUuid)
    if (!actor?.isOwner) return
    actor.rollTest("resistanceDisease", entry.vector, {
      disease: {
        infectionId: entry.id, token: req.token, name: entry.profile.name, power: entry.request.power,
        penetration: entry.profile.penetration, modifiers: testModifiers(entry),
      }
    })
  })
}

// The active GM's "Apply" button on a disease roll: the card is the player's, so it only suggests the hits;
// the request token and the Power come from the ledger, and the GM confirms the hits before anything moves
export function addDiseaseApplyButton(message, html){
  if (!isActiveGM()) return
  const data = message.flags?.sr5data
  const ref = data?.disease
  const entry = diseaseLedger().infections?.[ref?.infectionId]
  if (!entry?.request || entry.request.token !== ref.token) return
  if (!diseaseCardTrusted(message.author, fromUuidSync(entry.actorUuid))) return
  const button = document.createElement("button")
  button.type = "button"
  button.classList.add("sr5-disease-apply")
  button.innerHTML = `<i class="fa-solid fa-virus"></i> ${game.i18n.localize("SR5.DISEASE_Apply")}`
  button.addEventListener("click", () => applyFromCard(message, button).catch(e => SR5_SystemHelpers.srLog(1, `Disease test not applied: ${e}`)))
  const anchor = html.querySelector("#srButtonTest") ?? html.querySelector(".message-content")
  anchor?.after?.(button)
}

// Where the GM's window on a test card starts (diseases, radiation): the alerts, and the hits in the field. Past the
// pool, or no dice to count: the field stays empty and the GM types the hits (Inès, 05/10). Otherwise it starts from the
// hits counted on the dice, not from those the card claims (security 06/10). The sixes of a pushed limit explode without
// end, so dice a player writes can say anything: it never starts above the pool plus Chance the GM works out; past it
// the field is empty and the GM types his figure (Bodo, 06/10)
export function cardWindowStart(message, pool, cap){
  const claimed = Math.max(0, Number(message.flags?.sr5data?.roll?.hits) || 0)
  const counted = diseaseCardHits(message.flags?.sr5data, cardFromGM(message), pool)
  const warn = (text) => `<p class="sr5-disease-alert" style="color: #c00; font-weight: bold;">${text}</p>`
  const above = hitsAboveDice(claimed, pool)
  let alert = above ? warn(game.i18n.localize("SR5.DISEASE_HitsAbovePool")) : ""
  if (counted === null) alert += warn(game.i18n.localize("SR5.DISEASE_NoDice"))
  else if (counted !== claimed) alert += warn(game.i18n.format("SR5.DISEASE_HitsOnDice", {
    hits: counted
  }))
  const overCeiling = counted !== null && counted > pool
  if (overCeiling) alert += warn(game.i18n.format("SR5.DISEASE_HitsAboveCeiling", {
    hits: counted, pool
  }))
  return {
    claimed, alert, prefill: above || counted === null || overCeiling ? "" : Math.min(counted, cap)
  }
}

// The requests whose window is open in this browser: a double click opened two windows, and so did two renders of
// one card (the chat log and a popped out card), each with its own button
const APPLYING = new Set()

async function applyFromCard(message, button){
  const ref = message.flags?.sr5data?.disease
  const entry = diseaseLedger().infections?.[ref?.infectionId]
  if (!entry?.request || entry.request.token !== ref.token) return button.remove()
  const key = `${ref.infectionId}|${ref.token}`
  if (APPLYING.has(key)) return
  APPLYING.add(key)
  try {
    await confirmAndApply(message, button, ref, entry)
  } finally {
    APPLYING.delete(key)
  }
}

async function confirmAndApply(message, button, ref, entry){
  const claimed = Math.max(0, Number(message.flags?.sr5data?.roll?.hits) || 0)
  const power = entry.request.power
  //The card is the player's: the pool beside the hits is the one the GM works out from the character
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return
  //Pushing the limit rolled the Edge of the sheet besides the pool (SR5 p. 56 VO, p. 58 VF)
  const base = diseasePool(actor.system, entry)
  const pool = hitsCeiling(base, actor.system, message.flags?.sr5data)
  const cap = hitsCap(base, message.flags?.sr5data)
  const {
    alert, prefill
  } = cardWindowStart(message, pool, cap)
  const hits = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.DISEASE_Apply"
    },
    content: `<p>${game.i18n.format("SR5.DISEASE_ApplyText", {
      actor: escape(entry.actorName), name: escape(entry.profile.name), power
    })}</p>
      <p>${game.i18n.format("SR5.DISEASE_CardPool", {
    pool, hits: claimed
  })}</p>${alert}
      <div class="form-group"><label>${game.i18n.localize("SR5.DISEASE_Hits")}</label><input type="number" name="hits" value="${prefill}" min="0"${cap === Infinity ? "" : ` max="${cap}"`}></div>`,
    ok: {
      callback: (event, b) => Number(b.form.elements.hits.value) || 0
    },
    rejectClose: false,
  })
  if (hits === null || hits === undefined) return
  //Read again after the window: a second click, or another card, may have applied it meanwhile
  const fresh = diseaseLedger().infections?.[ref.infectionId]
  if (!fresh?.request || fresh.request.token !== ref.token || button.disabled) return button.remove()
  button.disabled = true
  const applied = Math.min(Math.max(0, hits), cap)
  const startYear = calendarStartYear()
  //The token is read again in the register's turn, just before the write: another card of the same request,
  //confirmed meanwhile, found it valid too outside the queue and applied the test twice (Frank's queue, Lena's lead)
  let testedPower
  const next = await writeRequested(ref, entry => {
    testedPower = entry.request.power
    return applyResult(entry, applied, testedPower, startYear)
  })
  button.remove()
  if (!next) return
  await postOutcome(next, applied, testedPower)
}

// The GM reads the outcome; the player of the character reads what he feels, the numbers only if revealed
async function postOutcome(entry, hits, power){
  const actor = await fromUuid(entry.actorUuid)
  const p = entry.profile
  const lines = [game.i18n.format("SR5.DISEASE_Outcome", {
    actor: escape(entry.actorName), name: escape(p.name), power, hits, residual: entry.residual, n: entry.testsDone, min: p.minTests
  })]
  if (entry.state === "cured") lines.push(game.i18n.localize("SR5.DISEASE_Cured"))
  if (entry.state === "recovering") lines.push(game.i18n.format("SR5.DISEASE_Recovering", {
    n: entry.recovery
  }))
  if (entry.state === "active" && p.damageType && entry.residual > 0) lines.push(game.i18n.format("SR5.DISEASE_Damage", {
    value: entry.residual, type: game.i18n.localize(CONFIG.SR5.damageTypes?.[p.damageType] ?? p.damageType)
  }))
  if (entry.state === "active" && p.pathogenEffects.includes("memoryLoss") && entry.residual > (actor?.system?.attributes?.logic?.augmented?.value ?? 0)) lines.push(game.i18n.format("SR5.DISEASE_MemoryLoss", {
    threshold: entry.residual - (actor?.system?.attributes?.logic?.augmented?.value ?? 0)
  }))
  if (finalEffectDue(entry) && p.finalEffect) lines.push(`${game.i18n.localize("SR5.DISEASE_FinalEffect")} ${escape(p.finalEffect)}`)
  //An attribute or the Essence down to 0, at any test: death or incapacity (B&P p. 21), for the GM to rule
  if (entry.state === "active" && reachedZero(actor, entry)) lines.push(`<strong>${game.i18n.localize("SR5.DISEASE_ZeroReached")}</strong>${p.finalEffect && !finalEffectDue(entry) ? ` ${escape(p.finalEffect)}` : ""}`)
  if (p.special) lines.push(escape(p.special))
  await ChatMessage.create({
    content: `<div class="sr5-disease-card"><h3>${game.i18n.localize("SR5.DISEASE_Title")}</h3>${lines.map(l => `<p>${l}</p>`).join("")}</div>`,
    whisper: gmIds(),
  })
  const owners = playerOwners(actor)
  if (!owners.length) return
  const reveal = game.settings.get("sr5", REVEAL_DISEASES_SETTING)
  const felt = entry.state === "cured" ? game.i18n.format("SR5.DISEASE_PlayerCured", {
    name: escape(p.name)
  }) : game.i18n.format("SR5.DISEASE_PlayerFeels", {
    name: escape(p.name), effects: feltEffects(entry)
  })
  await ChatMessage.create({
    content: `<div class="sr5-disease-card"><h3>${game.i18n.localize("SR5.DISEASE_Title")}</h3><p>${felt}</p>${reveal ? `<p>${lines[0]}</p>` : ""}</div>`,
    whisper: [...owners, ...gmIds()],
  })
}

function feltEffects(entry){
  const e = currentEffects(entry)
  const out = []
  if (e.disorientation) out.push(game.i18n.localize("SR5.ToxinEffectDisorientation"))
  if (e.nausea) out.push(game.i18n.localize("SR5.ToxinEffectNausea"))
  if (e.attributes) out.push(game.i18n.localize("SR5.DISEASE_EffectAttributes"))
  if (e.essence) out.push(game.i18n.localize("SR5.DISEASE_EffectEssence"))
  return out.length ? out.join(", ") : game.i18n.localize("SR5.DISEASE_NothingFelt")
}

/* The actor ----------------------------------- */

// Applied while the actor prepares, from the ledger: Disorientation -2 to all actions, Nausea doubles the wound
// modifiers (SR5 p. 410); Strength, Logic and Willpower lowered (Red Mask), Essence and Magic lowered
// (Cryptococcus), by the Power left (Bullets & Bandages p. 21)
export function applyDiseaseEffects(actor, updateModifier, label){
  if (!actor?.uuid || !game?.settings) return
  const sum = effectsFor(diseaseLedger(), actor.uuid)
  if (!sum.names.length) return
  const data = actor.system
  const name = `${label} (${sum.names.join(", ")})`
  if (sum.disorientation && data.penalties?.special?.actual) updateModifier(data.penalties.special.actual, name, "disease", -2)
  if (sum.nausea && data.specialProperties) data.specialProperties.doublePenalties = true
  if (sum.attributes){
    for (const key of ["strength", "logic", "willpower"]) if (data.attributes?.[key]?.augmented) updateModifier(data.attributes[key].augmented, name, "disease", -sum.attributes)
  }
  if (sum.essence){
    if (data.essence) updateModifier(data.essence, name, "disease", -sum.essence)
    if (data.specialAttributes?.magic?.augmented && data.specialAttributes.magic.natural?.base > 0) updateModifier(data.specialAttributes.magic.augmented, name, "disease", -sum.essence)
  }
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
      await checkDiseases().catch(e => SR5_SystemHelpers.srLog(1, `Diseases not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

export function initDiseases(){
  Hooks.on("updateWorldTime", () => queueCheck())
  //The ledger moved on another client: the actors it names are prepared again
  Hooks.on("updateSetting", (setting) => {
    if (setting.key !== `sr5.${DISEASE_LEDGER}`) return
    for (const entry of Object.values(diseaseLedger().infections ?? {
    })) refreshActor(entry.actorUuid)
  })
}

export function registerDiseaseSettings(){
  game.settings.register("sr5", DISEASE_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      infections: {
      }
    },
  })
  game.settings.register("sr5", REVEAL_DISEASES_SETTING, {
    name: "SR5.SETTINGS_RevealDiseases_T",
    hint: "SR5.SETTINGS_RevealDiseases_D",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  })
}
