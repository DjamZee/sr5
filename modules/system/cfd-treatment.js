// Treating CFD (Dark Terrors p. 86-87): the "hardware" cures that destroy the nanites of a head case.
// - Overwriters: at the end of each Combat Turn, Rating x 2 [Rating] against Nanite Volume x 2; net hits lower the
//   other side by 1 each until one of them is 0. Volume 0 ends the infection. An aerosol halves the Rating.
// - NanoScrub: an hour after the injection, then every full hour, the Volume and every other nanoware lose 1; the
//   NanoScrub loses 1 Rating every hour after the first. Side effects: Rating dice at the start, a glitch destroys
//   the small cranial, eye and ear cyberware, a critical glitch fails the treatment and the monad goes psychotic.
// The treatments live in a hidden world setting written by the active GM alone, never on the actor or on a chat
// card: a player owns both. The GM starts a treatment from the sheet; every roll is made by the GM's client.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

export const CFD_LEDGER = "sr5CfdLedger"

export const HOUR = 3600
export const DAY = 86400
// Overwriters left alone outside a combat: as many Combat Turns as needed, but never an endless loop on ties
export const MAX_ROUNDS = 100

/* -------------------------------------------- */
/* Rules                                        */
/* -------------------------------------------- */

// One dose is Rating 1, several doses given before it acts add up; an aerosol halves it, rounded down (DTER p. 87)
export function overwriterRating(doses, vector){
  const d = Math.max(0, Math.floor(Number(doses) || 0))
  return vector === "aerosol" ? Math.floor(d / 2) : d
}

export function overwriterPools(rating, nanite){
  return {
    own: rating * 2, limit: rating, nanite: nanite * 2
  }
}

// One Combat Turn: the net hits of either side lower the other one by 1 each
export function resolveOverwriterRound({
  rating, nanite
}, ownHits, naniteHits){
  const net = (Number(ownHits) || 0) - (Number(naniteHits) || 0)
  const next = {
    rating, nanite, net, ownHits, naniteHits
  }
  if (net > 0) next.nanite = Math.max(0, nanite - net)
  else if (net < 0) next.rating = Math.max(0, rating + net)
  next.cured = next.nanite === 0
  next.spent = !next.cured && next.rating === 0
  return next
}

// Combat Turns one after the other until one side is at 0 (or the cap). roll(pools) gives the hits of each side
export async function runOverwriters(state, roll, cap = MAX_ROUNDS){
  const rounds = []
  let current = {
    rating: state.rating, nanite: state.nanite
  }
  while (rounds.length < cap && current.rating > 0 && current.nanite > 0){
    const hits = await roll(overwriterPools(current.rating, current.nanite))
    const r = resolveOverwriterRound(current, hits.own, hits.nanite)
    rounds.push(r)
    current = {
      rating: r.rating, nanite: r.nanite
    }
  }
  return rounds
}

// Overwriters left once the infection is gone lose 1 Rating a day (DTER p. 87)
export function overwriterDecayDue(entry, now){
  const days = Math.max(0, Math.floor((now - entry.curedAt) / DAY))
  return {
    days, rating: Math.max(0, entry.rating - days)
  }
}

// The hours of NanoScrub gone by since the last check. At hour h (h >= 1) the Volume loses 1 if the NanoScrub is
// still above 0; from the second hour, it first loses 1 Rating itself. A dose of Rating R thus works R hours.
// Our reading of "loses 1 Rating each hour after the first": the book does not say which comes first
export function nanoscrubDue(entry, now){
  const hours = Math.max(0, Math.floor((now - entry.injectedAt) / HOUR))
  let rating = entry.rating
  let hoursDone = entry.hoursDone ?? 0
  let ticks = 0
  while (hoursDone < hours && rating > 0){
    hoursDone++
    if (hoursDone >= 2) rating--
    if (rating > 0) ticks++
  }
  return {
    ticks, hoursDone, rating, finished: rating <= 0
  }
}

// The world time of the NanoScrub hour that brought the Volume to 0: the hours of a check follow the ones already
// done, so the curedHour-th of them is hour (hoursDone + curedHour) after the injection
export function scrubCuredAt(entry, curedHour){
  return entry.injectedAt + ((entry.hoursDone ?? 0) + curedHour) * HOUR
}

export function sideEffectOf(roll){
  if (roll?.criticalGlitchRoll) return "critical"
  if (roll?.glitchRoll) return "glitch"
  return "none"
}

// After a critical glitch the CFD personality overwrites the host in (10 - Volume) days, at least 1 (DTER p. 87)
export function overwriteDeadline(now, nanite){
  return now + Math.max(1, 10 - (Number(nanite) || 0)) * DAY
}

// The Essence cost before grade and qualities: the base, times the Rating or the capacity when it scales
export function baseEssence(system){
  const base = Number(system?.essenceCost?.base) || 0
  switch (system?.essenceCost?.multiplier){
    case "rating": return base * (Number(system.itemRating) || 0)
    case "capacity": return base * (Number(system.capacity?.value) || 0)
    default: return base
  }
}

const CRANIAL = ["headware", "eyeware", "earware"]
// Nanoware is the hard and soft nanites; nanocybernetic implants are cyberware, each built around its own nanohive
// (Chrome Flesh p. 150, 155), and a nanohive is out of the reach of these treatments (DTER p. 87)
const NANOWARE = ["hardNanoware", "softNanoware"]

// A glitch destroys every cranial, eye or ear cyberware whose base Essence is below Rating / 10
export function cyberwareAtRisk(items, rating){
  return [...items].filter(i => i.type === "itemAugmentation" && i.system?.type === "cyberware" &&
    CRANIAL.includes(i.system?.category) && baseEssence(i.system) < rating / 10)
}

// Every other nanoware loses 1 Rating per hour of NanoScrub
export function nanowareToDecay(items, ticks){
  return [...items].filter(i => i.type === "itemAugmentation" && NANOWARE.includes(i.system?.type) &&
    (Number(i.system?.itemRating) || 0) > 0)
    .map(i => ({
      id: i.id, rating: Math.max(0, i.system.itemRating - ticks)
    }))
}

// The hours of NanoScrub played one after the other: each lowers the Volume, every other nanoware and the
// Overwriters still at work by 1, never below 0. The book does not stop the NanoScrub at Volume 0, so the hours
// go on: a jump of the clock and the same time hour by hour give the same result.
// state: { nanite, nanoware: { id: rating }, overwriters: rating or null }
export function scrubHours(state, ticks){
  let nanite = Number(state.nanite) || 0
  const nanoware = {
    ...state.nanoware
  }
  let overwriters = state.overwriters ?? null
  let cured = false
  let curedHour = 0
  for (let h = 0; h < ticks; h++){
    if (nanite > 0 && nanite - 1 === 0){
      cured = true
      curedHour = h + 1
    }
    nanite = Math.max(0, nanite - 1)
    for (const id of Object.keys(nanoware)) nanoware[id] = Math.max(0, nanoware[id] - 1)
    if (overwriters !== null) overwriters = overwriters > 1 ? overwriters - 1 : null
  }
  return {
    nanite, nanoware, overwriters, cured, curedHour
  }
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function warnNotActiveGM(){
  ui.notifications.warn(game.i18n.localize("SR5.CFD_ActiveGMOnly"))
}

export function cfdLedger(){
  try {
    return game.settings.get("sr5", CFD_LEDGER) ?? {
      patients: {
      }
    }
  } catch {
    return {
      patients: {
      }
    }
  }
}

export function patientOf(actorUuid){
  return cfdLedger().patients?.[actorUuid] ?? null
}

async function writeLedger(mutate){
  if (!isActiveGM()) return false
  const ledger = foundry.utils.duplicate(cfdLedger())
  ledger.patients ??= {
  }
  mutate(ledger.patients)
  // A patient with nothing left to follow leaves the ledger
  for (const [uuid, p] of Object.entries(ledger.patients)){
    if (!p.overwriters && !p.nanoscrub && !p.psychotic && !p.atRisk?.length) delete ledger.patients[uuid]
  }
  await game.settings.set("sr5", CFD_LEDGER, ledger)
  return true
}

const fmt = (t) => game.time.calendar.format(t)
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)
const naniteOf = (actor) => Number(actor?.system?.specialAttributes?.nanite?.augmented?.value) || 0

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

async function rollPool(dicePool, limit){
  if (dicePool <= 0) return {
    hits: 0, glitchRoll: false, criticalGlitchRoll: false
  }
  //Dynamic import: the roll pipeline loads the whole system, which this module must not need to be tested
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  return SR5_RollTest.rollDice({
    dicePool, limit
  })
}

// The Volume moves on the actor by the difference, so that a modifier on the augmented value stays where it is
async function lowerNanite(actor, by){
  if (by <= 0) return
  const base = Number(actor.system.specialAttributes?.nanite?.natural?.base) || 0
  await actor.update({
    "system.specialAttributes.nanite.natural.base": Math.max(0, base - by)
  })
}

/* The sheet ----------------------------------- */

// What the Nanite Volume block shows to the GM: offered to any character with a Volume, or already treated
export function cfdStatus(actor){
  if (!game.user.isGM || !["actorPc", "actorGrunt"].includes(actor?.type)) return null
  const p = actor.uuid ? patientOf(actor.uuid) : null
  if (!p && naniteOf(actor) <= 0) return null
  return {
    overwriters: p?.overwriters ? {
      rating: p.overwriters.curedAt ? overwriterDecayDue(p.overwriters, game.time.worldTime).rating : p.overwriters.rating,
      cured: !!p.overwriters.curedAt || naniteOf(actor) <= 0
    } : null,
    nanoscrub: p?.nanoscrub ? {
      rating: p.nanoscrub.rating, next: fmt(p.nanoscrub.injectedAt + ((p.nanoscrub.hoursDone ?? 0) + 1) * HOUR)
    } : null,
    psychotic: p?.psychotic ? fmt(p.psychotic.deadline) : null,
    inCombat: inCombat(actor),
    canResolve: canResolve(p?.overwriters, naniteOf(actor)) && !inCombat(actor),
  }
}

// "Resolve" is offered only when there is something to fight: Overwriters still active and a Volume above 0
export function canResolve(overwriters, nanite){
  return !!overwriters && !overwriters.curedAt && overwriters.rating > 0 && (Number(nanite) || 0) > 0
}

// In a started combat the Overwriters roll at the end of each Combat Turn: "Resolve" is for outside a combat
function inCombat(actor){
  return !!game.combats?.some(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid))
}

export async function startTreatmentDialog(actor){
  if (!isActiveGM()) return warnNotActiveGM()
  const content = `<div class="sr5-cfd-dialog">
    <p>${game.i18n.localize("SR5.CFD_DialogIntro")}</p>
    <div class="form-group"><label>${game.i18n.localize("SR5.CFD_Product")}</label>
      <select name="product">
        <option value="overwriters">${game.i18n.localize("SR5.CFD_Overwriters")}</option>
        <option value="nanoscrub">${game.i18n.localize("SR5.CFD_NanoScrub")}</option>
      </select></div>
    <div class="form-group"><label>${game.i18n.localize("SR5.CFD_Doses")}</label>
      <input type="number" name="doses" value="1" min="1" step="1"></div>
    <div class="form-group"><label>${game.i18n.localize("SR5.CFD_Vector")}</label>
      <select name="vector">
        <option value="injection">${game.i18n.localize("SR5.CFD_VectorInjection")}</option>
        <option value="aerosol">${game.i18n.localize("SR5.CFD_VectorAerosol")}</option>
      </select></div>
  </div>`
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.localize("SR5.CFD_Title")
    },
    content,
    ok: {
      label: game.i18n.localize("SR5.CFD_Start"),
      callback: (event, button) => ({
        product: button.form.elements.product.value,
        doses: Number(button.form.elements.doses.value),
        vector: button.form.elements.vector.value,
      })
    },
    rejectClose: false,
  })
  if (!data) return
  return startTreatment(actor, data)
}

// The GM gives a treatment. NanoScrub only goes in through a vein (DTER p. 87): an aerosol of it is refused
export async function startTreatment(actor, {
  product, doses, vector
}){
  if (!isActiveGM()) return warnNotActiveGM()
  const now = game.time.worldTime
  if (product === "nanoscrub"){
    if (vector === "aerosol") return ui.notifications.warn(game.i18n.localize("SR5.CFD_NanoScrubIVOnly"))
    const rating = overwriterRating(doses, "injection")
    if (rating <= 0) return
    const roll = await rollPool(rating)
    const effect = sideEffectOf(roll)
    // The roll of the side effects shows on the card, so that the GM can check it
    const rows = [{
      text: game.i18n.format("SR5.CFD_SideEffectRoll", {
        n: rating,
        dice: (roll.dices ?? []).map(d => d.result).join(", "),
        hits: roll.hits ?? 0,
        result: game.i18n.localize(`SR5.CFD_SideEffect_${effect}`)
      })
    }]
    let atRisk = []
    if (effect === "critical"){
      rows.push({
        text: game.i18n.format("SR5.CFD_ScrubCritical", {
          actor: escape(actor.name), date: fmt(overwriteDeadline(now, naniteOf(actor)))
        })
      })
    } else {
      if (effect === "glitch"){
        atRisk = cyberwareAtRisk(actor.items, rating)
        rows.push({
          text: game.i18n.format(atRisk.length ? "SR5.CFD_ScrubGlitch" : "SR5.CFD_ScrubGlitchNothing", {
            actor: escape(actor.name), n: (rating / 10).toLocaleString()
          })
        })
        for (const item of atRisk) rows.push({
          text: escape(item.name), itemId: item.id, uuid: actor.uuid, button: "destroy"
        })
      }
      rows.splice(1, 0, {
        text: game.i18n.format("SR5.CFD_ScrubStarted", {
          actor: escape(actor.name), rating, date: fmt(now + HOUR)
        })
      })
    }
    await writeLedger(patients => {
      const p = patients[actor.uuid] ??= {
        actorUuid: actor.uuid, actorName: actor.name
      }
      if (effect === "critical"){
        // The treatment fails; the overwrite date is kept if one is already running
        p.psychotic ??= {
          deadline: overwriteDeadline(now, naniteOf(actor)), notified: false
        }
      } else {
        p.nanoscrub = {
          rating, injectedAt: now, hoursDone: 0
        }
        p.atRisk = [...new Set([...(p.atRisk ?? []), ...atRisk.map(i => i.id)])]
      }
    })
    return postCard(rows)
  }
  const rating = overwriterRating(doses, vector)
  if (rating <= 0) return ui.notifications.warn(game.i18n.localize("SR5.CFD_AerosolTooWeak"))
  await writeLedger(patients => {
    const p = patients[actor.uuid] ??= {
      actorUuid: actor.uuid, actorName: actor.name
    }
    p.overwriters = {
      rating, curedAt: null
    }
  })
  return postCard([{
    text: game.i18n.format("SR5.CFD_OverwritersStarted", {
      actor: escape(actor.name), rating
    })
  }])
}

// Outside a combat the GM lets the Overwriters run to the end at once
export async function resolveOverwritersNow(actor){
  if (!isActiveGM()) return warnNotActiveGM()
  if (inCombat(actor)) return ui.notifications.warn(game.i18n.localize("SR5.CFD_ResolveInCombat"))
  return overwriterRounds(actor, MAX_ROUNDS)
}

export async function stopTreatment(actor){
  if (!isActiveGM()) return warnNotActiveGM()
  await writeLedger(patients => {
    delete patients[actor.uuid]
  })
}

/* The Overwriters ----------------------------- */

// combatTurn: { combatId, round } of the Combat Turn that ended, kept so that the same turn never plays twice
async function overwriterRounds(actor, cap, combatTurn = null){
  const p = patientOf(actor.uuid)
  if (!p?.overwriters || p.overwriters.curedAt || p.overwriters.rating <= 0) return
  if (combatTurn && !turnNotPlayed(p.overwriters.turns, combatTurn)) return
  const startNanite = naniteOf(actor)
  // Nothing left to fight: the infection is already gone, the Overwriters only lose their Rating day by day
  if (startNanite <= 0){
    const now = game.time.worldTime
    await writeLedger(patients => {
      if (patients[actor.uuid]?.overwriters) patients[actor.uuid].overwriters.curedAt = now
    })
    return postCard([{
      text: game.i18n.format("SR5.CFD_Cured", {
        actor: escape(actor.name)
      })
    }])
  }
  const rounds = await runOverwriters({
    rating: p.overwriters.rating, nanite: startNanite
  }, async (pools) => ({
    own: (await rollPool(pools.own, pools.limit)).hits,
    nanite: (await rollPool(pools.nanite)).hits,
  }), cap)
  if (!rounds.length) return
  const last = rounds.at(-1)
  await lowerNanite(actor, startNanite - last.nanite)
  const now = game.time.worldTime
  await writeLedger(patients => {
    const e = patients[actor.uuid]
    if (!e?.overwriters) return
    e.overwriters.rating = last.rating
    if (combatTurn) e.overwriters.turns = {
      ...e.overwriters.turns, [combatTurn.combatId]: combatTurn.round
    }
    if (last.cured) e.overwriters.curedAt = now
    if (last.spent || (last.cured && last.rating <= 0)) e.overwriters = null
  })
  const lines = rounds.map((r, i) => game.i18n.format("SR5.CFD_Round", {
    n: combatTurn ? combatTurn.round : i + 1, own: r.ownHits, nanite: r.naniteHits, rating: r.rating, volume: r.nanite
  }))
  const end = last.cured ? "SR5.CFD_Cured" : (last.spent ? "SR5.CFD_OverwritersSpent" : null)
  await postCard([{
    text: `${game.i18n.format("SR5.CFD_OverwritersRounds", {
      actor: escape(actor.name)
    })}<br>${lines.join("<br>")}${end ? `<br><strong>${game.i18n.format(end, {
      actor: escape(actor.name)
    })}</strong>` : ""}`
  }])
}

// A Combat Turn ends when the round moves forward from a round actually played: starting the combat (0 -> 1)
// ends nothing, and going back a round neither
export function endsCombatTurn(previousRound, newRound){
  const prev = Number(previousRound) || 0
  return prev >= 1 && Number(newRound) > prev
}

// A turn of a combat is played once: going back a round and forward again does not replay it
export function turnNotPlayed(turns, {
  combatId, round
}){
  return round > (Number(turns?.[combatId]) || 0)
}

// The end of a Combat Turn: one round for every treated character fighting in it
async function onCombatRound(combat, changed){
  if (!isActiveGM() || !("round" in changed)) return
  if (!endsCombatTurn(combat.previous?.round, changed.round)) return
  const patients = cfdLedger().patients ?? {
  }
  const seen = new Set()
  for (const combatant of combat.combatants){
    const actor = combatant.actor
    if (!actor || seen.has(actor.uuid)) continue
    seen.add(actor.uuid)
    const p = patients[actor.uuid]
    if (p?.overwriters && !p.overwriters.curedAt) await overwriterRounds(actor, 1, {
      combatId: combat.id, round: Number(combat.previous.round)
    })
  }
}

/* The clock ----------------------------------- */

export async function checkCfd(){
  if (!isActiveGM()) return
  const now = game.time.worldTime
  const next = foundry.utils.duplicate(cfdLedger())
  const rows = []
  for (const [uuid, p] of Object.entries(next.patients ?? {
  })){
    const actor = await fromUuid(uuid)
    if (p.nanoscrub){
      const due = nanoscrubDue(p.nanoscrub, now)
      if (due.ticks && actor){
        const before = naniteOf(actor)
        // Overwriters in the body are nanoware too (DTER p. 87), before and after the cure: the NanoScrub hours lower
        // their stored Rating, and the daily loss after the cure comes on top. Taken whether cured or not, so that a
        // jump of the clock and hour-by-hour checks agree
        const ow = p.overwriters ? p.overwriters.rating : null
        const wasCured = !!p.overwriters?.curedAt
        const nanoware = Object.fromEntries(nanowareToDecay(actor.items, 0).map(n => [n.id, n.rating]))
        const after = scrubHours({
          nanite: before, nanoware, overwriters: ow
        }, due.ticks)
        await lowerNanite(actor, before - after.nanite)
        const updates = Object.entries(after.nanoware).filter(([id, r]) => r !== nanoware[id]).map(([id, r]) => ({
          _id: id, "system.itemRating": r
        }))
        if (updates.length) await actor.updateEmbeddedDocuments("Item", updates)
        if (ow !== null){
          if (after.overwriters === null) p.overwriters = null
          else p.overwriters.rating = after.overwriters
          // The infection is gone at the hour the Volume fell to 0: from then on the Overwriters left lose 1 a day
          if (p.overwriters && !wasCured && after.curedHour) p.overwriters.curedAt = scrubCuredAt(p.nanoscrub, after.curedHour)
        }
        // Only the nanoware that actually lost Rating is told about
        const nanowareText = updates.length ? ` ${game.i18n.format("SR5.CFD_ScrubNanoware", {
          count: updates.length
        })}` : ""
        rows.push({
          text: game.i18n.format("SR5.CFD_ScrubTick", {
            actor: escape(p.actorName), n: due.ticks, lost: before - after.nanite, volume: after.nanite
          }) + nanowareText
        })
        if (after.cured) rows.push({
          text: game.i18n.format("SR5.CFD_ScrubCured", {
            actor: escape(p.actorName)
          })
        })
      }
      p.nanoscrub.hoursDone = due.hoursDone
      p.nanoscrub.rating = due.rating
      if (due.finished){
        p.nanoscrub = null
        // Spent without curing: the GM is told that the infection remains
        const left = actor ? naniteOf(actor) : 0
        if (left > 0) rows.push({
          text: game.i18n.format("SR5.CFD_ScrubSpent", {
            actor: escape(p.actorName), volume: left
          })
        })
      }
    }
    // Overwriters still active while the Volume is already at 0 (cured by other means, or set by hand): the infection
    // is gone, they start their daily loss now
    if (p.overwriters && !p.overwriters.curedAt && actor && naniteOf(actor) === 0) p.overwriters.curedAt = now
    if (p.overwriters?.curedAt){
      const decay = overwriterDecayDue(p.overwriters, now)
      if (decay.rating <= 0) p.overwriters = null
    }
    if (p.psychotic && !p.psychotic.notified && p.psychotic.deadline <= now){
      p.psychotic.notified = true
      rows.push({
        text: game.i18n.format("SR5.CFD_Overwritten", {
          actor: escape(p.actorName)
        })
      })
    }
    if (!p.overwriters && !p.nanoscrub && !p.psychotic && !p.atRisk?.length) delete next.patients[uuid]
  }
  if (!rows.length && JSON.stringify(next) === JSON.stringify(cfdLedger())) return
  await game.settings.set("sr5", CFD_LEDGER, next)
  if (rows.length) await postCard(rows)
}

/* The card ------------------------------------ */

async function postCard(rows){
  const list = rows.map(r => `<li class="sr5-cfd-row"${r.itemId ? ` data-actor-uuid="${escape(r.uuid)}" data-item-id="${escape(r.itemId)}"` : ""}>
      <span>${r.text}</span>
      ${r.button === "destroy" ? `<button type="button" data-sr5-cfd-apply="destroy">${game.i18n.localize("SR5.CFD_Destroy")}</button>` : ""}
    </li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-cfd-card"><h3>${game.i18n.localize("SR5.CFD_Title")}</h3><ul>${list}</ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        cfdTreatment: true
      }
    },
  })
}

// The GM destroys an implant the glitch reached. Only an implant the ledger holds for that actor can go:
// the card says which one, the ledger says whether it may
async function destroyImplant(uuid, itemId){
  if (!isActiveGM()) return false
  const p = patientOf(uuid)
  if (!p?.atRisk?.includes(itemId)) return true
  const actor = await fromUuid(uuid)
  if (actor?.items.get(itemId)) await actor.deleteEmbeddedDocuments("Item", [itemId])
  await writeLedger(patients => {
    const e = patients[uuid]
    if (e) e.atRisk = (e.atRisk ?? []).filter(id => id !== itemId)
  })
  return true
}

export function activateCfdListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-cfd-apply]")
  if (!game.user.isGM || !cardFromGM(message)) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-cfd-row")
    if (!isActiveGM()) return warnNotActiveGM()
    btn.disabled = true
    const done = await destroyImplant(row.dataset.actorUuid, row.dataset.itemId).catch(e => SR5_SystemHelpers.srLog(1, `CFD implant not destroyed: ${e}`))
    if (done) await markRowDoneInMessage(row, "[data-sr5-cfd-apply]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
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
      await checkCfd().catch(e => SR5_SystemHelpers.srLog(1, `CFD treatment not checked: ${e}`))
    } while (again)
    checking = null
  })()
  return checking
}

export function initCfdTreatment(){
  Hooks.on("updateWorldTime", () => {
    queueCheck()
    //The daily loss of leftover Overwriters and the next NanoScrub hour are read from the clock: an open sheet of
    //a treated character is drawn again, the ledger itself may not have changed
    if (!game.user.isGM) return
    const patients = cfdLedger().patients ?? {
    }
    for (const app of foundry.applications.instances.values()){
      if (app.actor && patients[app.actor.uuid] && app.rendered) app.render(false)
    }
  })
  Hooks.on("updateCombat", (combat, changed) => onCombatRound(combat, changed).catch(e => SR5_SystemHelpers.srLog(1, `CFD round failed: ${e}`)))
  //The sheets of the treated characters show where the treatment stands
  const redraw = (setting) => {
    if (setting.key !== `sr5.${CFD_LEDGER}`) return
    for (const actor of Object.values(ui.windows ?? {
    }).concat([...foundry.applications.instances.values()]).map(app => app.actor).filter(Boolean)) {
      actor.sheet?.rendered && actor.sheet.render(false)
    }
  }
  Hooks.on("updateSetting", redraw)
  Hooks.on("createSetting", redraw)
}

export function registerCfdSettings(){
  game.settings.register("sr5", CFD_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      patients: {
      }
    },
  })
}
