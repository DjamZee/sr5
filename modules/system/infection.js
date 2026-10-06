// Infection power (SR5 p. 401): when a creature with this power brings the Essence of its victim to 0 with Essence
// Drain (SR5 p. 399, an extended test the GM applies by hand: no card carries it), it tries to pass on the HMHVV. Opposed
// test, Magic + Charisma of the creature against Body + Willpower of the victim; a tie goes to the victim (SR5 p. 174).
// If the creature wins, the victim falls into a coma and wakes up 24 hours later as an Infected with 1 point of Essence.
// What kind of Infected it becomes is left to the GM.
// Both dice pools are worked out from the actors by the active GM's client, which rolls both tests itself: nothing is read
// from a card or a flag a player could write. The comas live in a hidden world setting written by the active GM alone.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

export const INFECTION_LEDGER = "sr5InfectionLedger"
export const COMA = 86400

// The states of a victim in the ledger: offered (the GM was asked once), resisted, coma, woken (the card is posted)
export const OFFERED = "offered"
export const RESISTED = "resisted"
export const IN_COMA = "coma"
export const WOKEN = "woken"

const num = (v) => Number(v) || 0

// Magic + Charisma of the creature (SR5 p. 401)
export function infectorPool(actor){
  const s = actor?.system
  return Math.max(0, num(s?.specialAttributes?.magic?.augmented?.value) + num(s?.attributes?.charisma?.augmented?.value))
}

// Body + Willpower of the victim (SR5 p. 401)
export function victimPool(actor){
  const a = actor?.system?.attributes
  return Math.max(0, num(a?.body?.augmented?.value) + num(a?.willpower?.augmented?.value))
}

// "If the creature wins": more hits than the victim, a tie goes to the defender (SR5 p. 174)
export function infectionWins(creatureHits, victimHits){
  return num(creatureHits) > num(victimHits)
}

// A victim the power can be tried on: a character or a grunt whose Essence is down to 0
export function canBeInfected(actor){
  if (!["actorPc", "actorGrunt"].includes(actor?.type)) return false
  return num(actor.system?.essence?.value) <= 0
}

// A creature that can infect: it drains Essence (the Infection power works through Essence Drain, SR5 p. 401)
export function canInfect(actor){
  return !!actor?.system?.specialProperties?.essenceDrain
}

export function newComa({
  victimName, creatureName, now
}){
  return {
    state: IN_COMA, victimName, creatureName, wakeAt: now + COMA
  }
}

// The comas the clock went past, not told to the GM yet
export function comasDue(victims, now){
  return Object.entries(victims ?? {
  }).filter(([, e]) => e?.state === IN_COMA && e.wakeAt <= now).map(([uuid]) => uuid)
}

// Essence base that brings the value to 1, whatever the modifiers
export function essenceBaseForOne(essence){
  return num(essence?.base) + 1 - num(essence?.value)
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function activeGMOrWarn(){
  if (isActiveGM()) return true
  ui.notifications.warn(game.i18n.localize("SR5.INFECTION_ActiveGMOnly"))
  return false
}

export function infectionLedger(){
  try {
    return game.settings.get("sr5", INFECTION_LEDGER) ?? {
      victims: {
      }
    }
  } catch {
    return {
      victims: {
      }
    }
  }
}

export function infectionOf(uuid){
  return infectionLedger().victims?.[uuid] ?? null
}

async function writeLedger(mutate){
  if (!isActiveGM()) return false
  const ledger = foundry.utils.duplicate(infectionLedger())
  ledger.victims ??= {
  }
  mutate(ledger.victims)
  await game.settings.set("sr5", INFECTION_LEDGER, ledger)
  return true
}

const fmt = (t) => game.time.calendar.format(t)
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

/* The sheet ----------------------------------- */

// What the essence block of the victim's sheet shows to the GM: the button, or the coma
export function infectionStatus(actor){
  if (!game.user.isGM || !actor?.uuid) return null
  const entry = infectionOf(actor.uuid)
  if (entry?.state === IN_COMA) return {
    coma: true, wakeAt: fmt(entry.wakeAt), creature: entry.creatureName
  }
  if (entry?.state === WOKEN) return {
    woken: true
  }
  return canBeInfected(actor) ? {
    canTry: true
  } : null
}

// The actors of the tokens of the scene the GM looks at, read from the scene and not from the canvas, which a GM may
// have turned off
function sceneActors(){
  const scene = game.scenes?.viewed ?? game.scenes?.active
  return (scene?.tokens?.contents ?? []).map(t => t.actor).filter(Boolean)
}

// The creatures offered in the dialog: those of the scene first (the controlled one ticked), then the world's
function infectors(victim){
  const scene = sceneActors().filter(a => canInfect(a) && a.uuid !== victim.uuid)
  const world = game.actors.filter(a => canInfect(a) && a.uuid !== victim.uuid)
  const list = []
  for (const a of [...scene, ...world]) if (!list.some(b => b.uuid === a.uuid)) list.push(a)
  return list
}

// The dice of a roll, for the GM to read on the card
const diceOf = (roll) => `[${(roll?.dices ?? []).map(d => d.result).join(" ")}]`

// The GM's button: pick the creature, read both pools, confirm, roll
export async function tryInfection(victim){
  if (!activeGMOrWarn()) return
  if (!canBeInfected(victim)) return ui.notifications.warn(game.i18n.localize("SR5.INFECTION_NotZero"))
  if (infectionOf(victim.uuid)?.state === IN_COMA) return ui.notifications.warn(game.i18n.localize("SR5.INFECTION_AlreadyComa"))
  const creatures = infectors(victim)
  if (!creatures.length) return ui.notifications.warn(game.i18n.localize("SR5.INFECTION_NoCreature"))
  const controlled = (canvas?.tokens?.controlled ?? []).map(t => t.actor?.uuid)
  const picked = creatures.find(a => controlled.includes(a.uuid)) ?? creatures[0]
  const options = creatures.map(a => `<option value="${escape(a.uuid)}" ${a === picked ? "selected" : ""}>${escape(a.name)} (${infectorPool(a)})</option>`).join("")
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.format("SR5.INFECTION_Title", {
        name: victim.name
      })
    },
    content: `<p>${game.i18n.localize("SR5.INFECTION_Rule")}</p>
      <div class="form-group"><label>${game.i18n.localize("SR5.INFECTION_Creature")}</label><select name="creature">${options}</select></div>
      <div class="form-group"><label>${game.i18n.localize("SR5.INFECTION_CreatureModifier")}</label><input type="number" name="creatureMod" value="0"></div>
      <div class="form-group"><label>${game.i18n.format("SR5.INFECTION_VictimPool", {
    name: escape(victim.name), n: victimPool(victim)
  })}</label><input type="number" name="victimMod" value="0"></div>`,
    ok: {
      label: game.i18n.localize("SR5.INFECTION_Roll"),
      callback: (event, button) => ({
        creature: button.form.elements.creature.value,
        creatureMod: num(button.form.elements.creatureMod.value),
        victimMod: num(button.form.elements.victimMod.value),
      })
    },
    rejectClose: false,
  })
  if (!data) return
  if (!activeGMOrWarn()) return
  const creature = creatures.find(a => a.uuid === data.creature)
  if (!creature) return
  // Read again once the dialog is closed: the pools are the actors', never the dialog's
  const attack = Math.max(0, infectorPool(creature) + data.creatureMod)
  const defense = Math.max(0, victimPool(victim) + data.victimMod)
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  const a = await SR5_RollTest.rollDice({
    dicePool: attack
  })
  const d = await SR5_RollTest.rollDice({
    dicePool: defense
  })
  const wins = infectionWins(a.hits, d.hits)
  const now = game.time.worldTime
  await writeLedger(v => {
    v[victim.uuid] = wins ? newComa({
      victimName: victim.name, creatureName: creature.name, now
    }) : {
      state: RESISTED, victimName: victim.name, creatureName: creature.name
    }
  })
  const result = game.i18n.format(wins ? "SR5.INFECTION_Infected" : "SR5.INFECTION_Resisted", {
    victim: escape(victim.name), creature: escape(creature.name), date: fmt(now + COMA)
  })
  await ChatMessage.create({
    content: `<div class="sr5-infection-card"><h3>${game.i18n.localize("SR5.INFECTION_CardTitle")}</h3>
      <p>${game.i18n.format("SR5.INFECTION_Dice", {
    creature: escape(creature.name), a: attack, ah: a.hits, victim: escape(victim.name), d: defense, dh: d.hits
  })}</p><p class="sr5-infection-dice">${diceOf(a)} / ${diceOf(d)}</p><p>${result}</p></div>`,
    whisper: gmIds(),
  })
}

/* The cards ----------------------------------- */

// A row that names a victim, with a button the active GM alone can use. The button carries no number: what it does is
// read from the ledger and from the actor
async function postCard(uuid, text, action){
  await ChatMessage.create({
    content: `<div class="sr5-infection-card"><h3>${game.i18n.localize("SR5.INFECTION_CardTitle")}</h3><ul>
      <li class="sr5-infection-row" data-actor-uuid="${escape(uuid)}"><span>${text}</span>
      <button type="button" data-sr5-infection="${action}">${game.i18n.localize(action === "wake" ? "SR5.INFECTION_EssenceOne" : "SR5.INFECTION_Try")}</button></li></ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        infectionCard: true
      }
    },
  })
}

// The Essence of a character falls to 0 while a creature that drains Essence is in the scene: the GM is asked once
async function offerOnZero(actor, changes){
  if (!isActiveGM() || !foundry.utils.hasProperty(changes, "system.essence")) return
  const entry = infectionOf(actor.uuid)
  if (!canBeInfected(actor)){
    // Essence given back: the victim can be offered again the next time
    if (entry && entry.state !== IN_COMA && entry.state !== WOKEN) await writeLedger(v => {
      delete v[actor.uuid]
    })
    return
  }
  if (entry) return
  const scene = sceneActors().some(a => a.uuid !== actor.uuid && canInfect(a))
  if (!scene) return
  await writeLedger(v => {
    v[actor.uuid] = {
      state: OFFERED, victimName: actor.name
    }
  })
  await postCard(actor.uuid, game.i18n.format("SR5.INFECTION_Offer", {
    victim: escape(actor.name)
  }), "try")
}

export async function checkInfection(){
  if (!isActiveGM()) return
  const due = comasDue(infectionLedger().victims, game.time.worldTime)
  if (!due.length) return
  const ledger = infectionLedger()
  await writeLedger(v => {
    for (const uuid of due) if (v[uuid]) v[uuid].state = WOKEN
  })
  for (const uuid of due) await postCard(uuid, game.i18n.format("SR5.INFECTION_Wake", {
    victim: escape(ledger.victims[uuid].victimName), creature: escape(ledger.victims[uuid].creatureName)
  }), "wake")
}

// "Essence at 1": only for a victim the ledger says has woken; the entry goes once applied
async function wake(uuid){
  if (!isActiveGM()) return false
  if (infectionOf(uuid)?.state !== WOKEN) return true
  const actor = await fromUuid(uuid)
  if (!actor) return false
  await actor.update({
    "system.essence.base": essenceBaseForOne(actor.system.essence)
  })
  await writeLedger(v => {
    delete v[uuid]
  })
  return true
}

export function activateInfectionListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-infection]")
  if (!game.user.isGM || !cardFromGM(message)) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-infection-row")
    if (!activeGMOrWarn()) return
    const uuid = row.dataset.actorUuid
    if (btn.dataset.sr5Infection === "try"){
      const actor = await fromUuid(uuid)
      if (actor) await tryInfection(actor)
      if (infectionOf(uuid)?.state !== OFFERED) await markRowDoneInMessage(row, "[data-sr5-infection]", game.i18n.localize("SR5.CALENDAR_RowDone"))
      return
    }
    btn.disabled = true
    const done = await wake(uuid).catch(e => SR5_SystemHelpers.srLog(1, `Infection not applied: ${e}`))
    if (done) await markRowDoneInMessage(row, "[data-sr5-infection]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}

/* -------------------------------------------- */

let checking = null
function queueCheck(){
  checking ??= checkInfection().catch(e => SR5_SystemHelpers.srLog(1, `Infection not checked: ${e}`)).finally(() => {
    checking = null
  })
  return checking
}

export function initInfection(){
  Hooks.on("updateWorldTime", () => queueCheck())
  //A coma that ended while no GM was connected
  queueCheck()
  Hooks.on("updateActor", (actor, changes) => offerOnZero(actor, changes).catch(e => SR5_SystemHelpers.srLog(1, `Infection offer failed: ${e}`)))
  const redraw = (setting) => {
    if (setting.key !== `sr5.${INFECTION_LEDGER}`) return
    for (const app of foundry.applications.instances.values()) if (app.actor && app.rendered) app.render(false)
  }
  Hooks.on("updateSetting", redraw)
  Hooks.on("createSetting", redraw)
}

export function registerInfectionSettings(){
  game.settings.register("sr5", INFECTION_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      victims: {
      }
    },
  })
}
