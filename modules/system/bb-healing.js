// "Soins sous le feu ennemi" (Bullets & Bandages p. 14-16), on the table: the bleeding of wounds of 5+ boxes counted
// by Combat Turn, stabilization and diagnosis applied from the roll card. The GM's to believe, so the active GM alone
// writes the ledger (a hidden world setting), and no box is ever added nor anything stabilized without his click.
// The pure rules are in bb-healing-rules.js
import {
  BB_UNDER_FIRE, BB_ADVANCED_MEDKITS, BB_LEDGER, BB_WOUND_THRESHOLD, refreshPatients,
  physicalTotal, canBleed, ledgerAfterWound, ledgerAfterBleedBox, isStabilizeSpell, stabilizeSpellDrain, ledgerAfterRound, ledgerAfterStabilization,
  spellStabilizes, believedStabilizationReduction,
  ledgerWithDiagnosis, ledgerWithoutDiagnosis, diagnosisBonus, woundDiagnosisThreshold, DIAGNOSIS_THRESHOLDS, ledgerCleaned, penaltyReduction, stabilizationThreshold,
} from "./bb-healing-rules.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  updateLedger
} from "./gm-ledger.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"

export function underFireRules(){
  try {
    return !!game.settings.get("sr5", BB_UNDER_FIRE)
  } catch {
    return false
  }
}

export function advancedMedkitRules(){
  try {
    return !!game.settings.get("sr5", BB_ADVANCED_MEDKITS)
  } catch {
    return false
  }
}

function isWriter(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function bbLedger(){
  try {
    return game.settings.get("sr5", BB_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

// `change` makes the next ledger from its latest state, in its turn (gm-ledger.js); null leaves it as it is
async function writeLedger(change){
  if (!isWriter()) return false
  return updateLedger(BB_LEDGER, ledger => {
    const next = change(ledger)
    return next ? ledgerCleaned(next, game.time.worldTime) : null
  })
}

// Read by the actor preparation (utilityActor.updatePenalties): the wound modifiers lowered by a stabilization
export function bbPenaltyReduction(actor){
  if (!underFireRules() || !actor?.uuid) return 0
  return penaltyReduction(bbLedger()[actor.uuid], game.time.worldTime)
}

export function bbPatientEntry(actor){
  if (!underFireRules() || !actor?.uuid) return {
  }
  return bbLedger()[actor.uuid] ?? {
  }
}

export function bbThreshold(actor){
  return stabilizationThreshold(actor?.system, !!bbPatientEntry(actor).bleeding)
}

// BB p. 15: the Drain of the Stabilize spell cast on a targeted patient, null when the rule does not apply
export function bbStabilizeDrain(spellName, patient, floor){
  if (!underFireRules() || !patient || !isStabilizeSpell(spellName)) return null
  const bleedBoxes = bbPatientEntry(patient).bleeding?.boxes
  return stabilizeSpellDrain(bleedBoxes, patient.system?.conditionMonitors?.overflow?.actual?.value, floor)
}

/* -------------------------------------------- */
// The bleeding. Each client of the active GM keeps the Physical total it last saw of each actor: a rise of 5+ in one
// update is one attack (takeDamage writes the damage at once). Nothing to trust from a player, the GM sees the change

const seen = new Map()

function remember(actor){
  if (actor?.uuid && canBleed(actor.system)) seen.set(actor.uuid, physicalTotal(actor.system))
}

async function onUpdateActor(actor){
  if (!isWriter() || !canBleed(actor?.system)) return
  const before = seen.get(actor.uuid)
  const now = physicalTotal(actor.system)
  seen.set(actor.uuid, now)
  if (before === undefined || now - before < BB_WOUND_THRESHOLD) return
  if (bbLedger()[actor.uuid]?.bleeding) return
  const written = await writeLedger(ledger => (ledger[actor.uuid]?.bleeding ? null : ledgerAfterWound(ledger, actor.uuid, actor.system.attributes?.body?.augmented?.value)))
  if (written) ui.notifications.info(game.i18n.format("SR5.BB_BleedingStarts", {
    name: actor.name
  }))
}

// A new Combat Turn, never a new initiative pass nor a step back
async function onUpdateCombat(combat, changes, options){
  if (!isWriter() || !("round" in (changes ?? {
  }))) return
  if ((options?.direction ?? 1) < 0) return
  const actors = new Map()
  for (const c of combat.combatants) if (c.actor?.uuid) actors.set(c.actor.uuid, c.actor)
  let due = []
  await writeLedger(current => {
    const after = ledgerAfterRound(current, [...actors.keys()])
    due = after.due
    return after.ledger
  })
  if (due.length) await postBleedCard(due.map(uuid => actors.get(uuid)))
}

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

async function postBleedCard(actors){
  const list = actors.map(a => `<li class="sr5-bb-row" data-actor-uuid="${a.uuid}">
      <span><strong>${escape(a.name)}</strong> ${game.i18n.localize("SR5.BB_BleedRow")}</span>
      <button type="button" data-sr5-bleed>${game.i18n.localize("SR5.BB_BleedApply")}</button>
    </li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-bb-card"><h3>${game.i18n.localize("SR5.BB_BleedTitle")}</h3><ul>${list}</ul></div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: {
      sr5: {
        bbBleed: true
      }
    },
  })
}

// One Physical box, carried to the overflow once the monitor is full, as damage does (SR5 p. 171)
async function applyBleedBox(actor){
  const {
    SR5_ActorHelper
  } = await import("../entities/actors/entityActor-helpers.js")
  const {
    SR5_EntityHelpers
  } = await import("../entities/helpers.js")
  const monitors = actor.toObject(false).system.conditionMonitors
  monitors.physical.actual.base += 1
  SR5_EntityHelpers.updateValue(monitors.physical.actual, 0)
  const {
    isDead
  } = SR5_ActorHelper.carryMonitorOverflow(monitors, actor.type)
  seen.set(actor.uuid, physicalTotal({
    conditionMonitors: monitors
  }))
  await actor.update({
    "system.conditionMonitors.physical.actual.base": Math.min(monitors.physical.actual.base, monitors.physical.value),
    "system.conditionMonitors.overflow.actual.base": Math.min(monitors.overflow.actual.base, monitors.overflow.value),
  })
  await writeLedger(ledger => ledgerAfterBleedBox(ledger, actor.uuid))
  const id = actor.isToken ? actor.token.id : actor.id
  if (isDead) await SR5_ActorHelper.createDeadEffect(id)
  else if (monitors.physical.actual.value >= monitors.physical.value) await SR5_ActorHelper.createKoEffect(id)
  return true
}

export function activateBleedCardListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-bleed]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-bleed]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-bb-row")
    btn.disabled = true
    const actor = await fromUuid(row.dataset.actorUuid)
    //Stabilized since the card was dealt: no box
    const done = actor && bbLedger()[actor.uuid]?.bleeding ?
      await applyBleedBox(actor).catch(e => SR5_SystemHelpers.srLog(1, `Bleeding box not applied: ${e}`)) :
      true
    if (done) await markRowDoneInMessage(row, "[data-sr5-bleed]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}

/* -------------------------------------------- */
// The roll card buttons, for the GM (chat-button-gm). The card is the player's: the GM sees what is applied first

async function confirm(text){
  return foundry.applications.api.DialogV2.confirm({
    window: {
      title: "SR5.BB_Title"
    },
    content: `<p>${text}</p>`,
    rejectClose: false,
  })
}

// False for anyone but the active GM, who alone writes the ledger: the card button then stays as it is
function writerOrWarn(){
  if (isWriter()) return true
  ui.notifications.warn(game.i18n.localize("SR5.BB_ActiveGMOnly"))
  return false
}

// The reduction of the wound modifiers a stabilization card is worth, as the GM counts it: never read from the card
// (its author wrote it), but from its hits bounded by the dice rolled and the patient's threshold now. The card's
// button shows the same count (test-Skill.js). A spell or a treatment stabilizes without reduction
export function stabilizationCardReduction(messageData, patient){
  if (messageData?.test?.bbMode !== "stabilization" || messageData?.test?.type === "spell") return 0
  return believedStabilizationReduction(messageData.roll, messageData.dicePool?.value, messageData.test?.extended?.roll, bbThreshold(patient))
}

// BB p. 15-16: does the spell of the card stabilize the patient? The spell's name is read from the item, the Force
// is capped at twice the caster's Magic (SR5 p. 281), the patient is read now
export async function spellCardStabilizes(messageData, patient, caster){
  if (messageData?.test?.type !== "spell" || !messageData.owner?.itemUuid) return false
  const spell = await fromUuid(messageData.owner.itemUuid)
  const magic = Number(caster?.system?.specialAttributes?.magic?.augmented?.value) || 0
  const force = Math.min(Number(messageData.magic?.force) || 0, 2 * magic)
  return spellStabilizes(spell?.name, force, bbPatientEntry(patient), patient?.system?.conditionMonitors?.overflow?.actual?.value)
}

// Returns the reduction applied (0 or more), false when nothing was written
export async function applyStabilization(messageData, patient, medic){
  if (!writerOrWarn()) return false
  if (messageData?.test?.type === "spell" && !(await spellCardStabilizes(messageData, patient, medic))) {
    ui.notifications.warn(game.i18n.format("SR5.BB_SpellDoesNotStabilize", {
      name: patient.name
    }))
    return false
  }
  const reduction = stabilizationCardReduction(messageData, patient)
  const hours = Number(medic?.system?.skills?.firstAid?.rating?.value) || 0
  const ok = await confirm(game.i18n.format("SR5.BB_StabilizeConfirm", {
    name: escape(patient.name), reduction, hours
  }))
  if (!ok) return false
  await writeLedger(ledger => ledgerAfterStabilization(ledger, patient.uuid, reduction, game.time.worldTime + hours * 3600))
  return reduction
}

export async function applyDiagnosis(messageData, patient){
  if (!writerOrWarn()) return false
  const offered = woundDiagnosisThreshold(stabilizationThreshold(patient.system, false))
  const options = DIAGNOSIS_THRESHOLDS.map(t => `<option value="${t}" ${t === offered ? "selected" : ""}>${t}</option>`).join("")
  const threshold = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: "SR5.BB_Title"
    },
    content: `<p>${game.i18n.format("SR5.BB_DiagnoseConfirm", {
      name: escape(patient.name), hits: Number(messageData.roll.hits) || 0
    })}</p><div class="form-group"><label>${game.i18n.localize("SR5.BB_DiagnoseThreshold")}</label><select name="bbThreshold">${options}</select></div>`,
    ok: {
      callback: (event, button) => Number(button.form.elements.bbThreshold.value)
    },
    rejectClose: false,
  })
  if (!threshold) return false
  const bonus = diagnosisBonus(messageData.roll, threshold)
  ui.notifications.info(game.i18n.format("SR5.BB_DiagnoseResult", {
    name: patient.name, bonus: bonus > 0 ? `+${bonus}` : `${bonus}`
  }))
  //A diagnosis without result leaves no bonus: nothing to write
  if (bonus) await writeLedger(ledger => ledgerWithDiagnosis(ledger, patient.uuid, bonus))
  return bonus
}

// BB p. 15: the diagnosis counts for one test. A card that used it, the active GM takes it out of the ledger
async function onCreateChatMessage(message){
  if (!isWriter()) return
  const uuid = message.flags?.sr5data?.test?.bbDiagnosisPatient
  if (!uuid || bbLedger()[uuid]?.diagnosis === undefined) return
  await writeLedger(ledger => ledgerWithoutDiagnosis(ledger, uuid))
}

// BB p. 18-19: one use of the medkit supplies per patient stabilized or treated (arbitrage de DjamZ, 2026-10-05).
// The GM can correct the charge on the item
export async function useMedkitSupplies(itemUuid){
  if (!advancedMedkitRules() || !itemUuid) return
  const item = await fromUuid(itemUuid)
  if (!item?.system?.isMedkit || !item.isOwner) return
  const charge = Number(item.system.charge) || 0
  if (charge > 0) await item.update({
    "system.charge": charge - 1
  })
}

/* -------------------------------------------- */

export function initBBHealing(){
  if (!underFireRules()) return
  if (isWriter()){
    for (const actor of game.actors) remember(actor)
    for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) remember(token.actor)
  }
  Hooks.on("updateActor", (actor) => {
    onUpdateActor(actor).catch(e => SR5_SystemHelpers.srLog(1, `Bleeding not checked: ${e}`))
  })
  Hooks.on("createActor", (actor) => isWriter() && remember(actor))
  Hooks.on("createToken", (token) => isWriter() && remember(token.actor))
  Hooks.on("updateCombat", (combat, changes, options) => {
    onUpdateCombat(combat, changes, options).catch(e => SR5_SystemHelpers.srLog(1, `Bleeding not counted: ${e}`))
  })
  Hooks.on("createChatMessage", (message) => {
    onCreateChatMessage(message).catch(e => SR5_SystemHelpers.srLog(1, `Diagnosis not used: ${e}`))
  })
  //The reduction of a stabilization ends on the clock
  Hooks.on("updateWorldTime", () => refreshPatients(bbLedger()))
}
