// Magic of the supplements on the table: the box of Harmonie élémentaire at each Combat Turn (Better Than Bad p. 145),
// the implants Transmutation rejects (Aetherologie p. 39), the stone of Pétrification lifted with its spell (Street
// Grimoire p. 117). The active GM deals the cards and alone clicks them, as for the bleeding (bb-healing.js): nothing
// is written without his click. The pure rules are in magic-supplements-rules.js
import {
  elementalAttunementDue, isTransmutation, transmutationImplants, transmutationDamage
} from "./magic-supplements-rules.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
} from "./card-rows.js"
import {
  escape, isActiveGM, gmIds, playerOwners, allActors
} from "./card-helpers.js"

/* -------------------------------------------- */
// Harmonie élémentaire: a new Combat Turn, never a new initiative pass nor a step back

async function onUpdateCombat(combat, changes, options){
  if (!isActiveGM() || !("round" in (changes ?? {
  }))) return
  if ((options?.direction ?? 1) < 0) return
  const actors = new Map()
  for (const c of combat.combatants) if (c.actor?.uuid && elementalAttunementDue(c.actor)) actors.set(c.actor.uuid, c.actor)
  for (const actor of actors.values()) await postAttunementCard(actor)
}

async function postAttunementCard(actor){
  await ChatMessage.create({
    content: `<div class="sr5-bb-card"><h3>${game.i18n.localize("SR5.ElementalAttunementTitle")}</h3><ul>
      <li class="sr5-bb-row" data-actor-uuid="${actor.uuid}">
        <span><strong>${escape(actor.name)}</strong> ${game.i18n.localize("SR5.ElementalAttunementRow")}</span>
        <button type="button" data-sr5-attunement="physical">${game.i18n.localize("SR5.ElementalAttunementPhysical")}</button>
        <button type="button" data-sr5-attunement="stun">${game.i18n.localize("SR5.ElementalAttunementStun")}</button>
      </li></ul></div>`,
    whisper: [...new Set([...gmIds(), ...playerOwners(actor)])],
    flags: {
      sr5: {
        elementalAttunement: true
      }
    },
  })
}

// One box of Drain, not resisted, written as damage is (overflow, knockout)
async function applyAttunementBox(actor, type){
  const {
    SR5_PrepareRollTest
  } = await import("../rolls/roll-prepare.js")
  const damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
  damageInfo.damage.value = 1
  damageInfo.damage.type = type
  await actor.takeDamage(damageInfo)
  return true
}

export function activateAttunementCardListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-attunement]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-attunement]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-bb-row")
    row.querySelectorAll("[data-sr5-attunement]").forEach(b => b.disabled = true)
    const actor = await fromUuid(row.dataset.actorUuid)
    const done = actor ? await applyAttunementBox(actor, btn.dataset.sr5Attunement).catch(e => SR5_SystemHelpers.srLog(1, `Elemental Attunement box not applied: ${e}`)) : true
    if (done) await markRowDoneInMessage(row, "[data-sr5-attunement]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else row.querySelectorAll("[data-sr5-attunement]").forEach(b => b.disabled = false)
  }))
}

/* -------------------------------------------- */
// Transmutation: the power switched on, the GM sees the implants the new form rejects and the damage, and applies them.
// The sheet's switch writes the item through an update of the whole actor (baseSheet.js, _editItemValue), where no
// updateItem hook runs: the active GM keeps whether each actor's Transmutation was on, and deals the card when it goes on

const transmuted = new Map()
const transmutationOn = actor => listOf(actor?.items).some(i => isTransmutation(i) && i.system?.isActive)
const listOf = items => items ? [...(items.contents ?? items)] : []

function rememberTransmutation(actor){
  if (actor?.uuid && listOf(actor.items).some(isTransmutation)) transmuted.set(actor.uuid, transmutationOn(actor))
}

async function checkTransmutation(actor){
  if (!isActiveGM() || !actor?.uuid) return
  const before = transmuted.get(actor.uuid) ?? false
  const now = transmutationOn(actor)
  transmuted.set(actor.uuid, now)
  if (now && !before) await postTransmutationCard(actor)
}

async function postTransmutationCard(actor){
  const implants = transmutationImplants(actor.items)
  if (!implants.some(i => i.rejected)) return
  const rows = implants.map(i => `<li>${escape(i.name)} (${i.essence}) : ${game.i18n.localize(i.rejected ? "SR5.TransmutationRejected" : "SR5.TransmutationKept")}</li>`).join("")
  await ChatMessage.create({
    content: `<div class="sr5-bb-card"><h3>${game.i18n.localize("SR5.TransmutationTitle")}</h3>
      <p><strong>${escape(actor.name)}</strong> ${game.i18n.format("SR5.TransmutationDamage", {
  damage: transmutationDamage(implants)
})}</p><ul>${rows}</ul><p>${game.i18n.localize("SR5.TransmutationDeltaNote")}</p>
      <div class="sr5-bb-row" data-actor-uuid="${actor.uuid}"><button type="button" data-sr5-transmutation>${game.i18n.localize("SR5.TransmutationApply")}</button></div></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        transmutation: true
      }
    },
  })
}

// The rejected implants removed (their Essence stays lost: essence-hole.js keeps the hole) and the damage taken,
// worked out again from what the actor wears now
async function applyTransmutation(actor){
  const implants = transmutationImplants(actor.items)
  const rejected = implants.filter(i => i.rejected)
  if (!rejected.length) return true
  const damage = transmutationDamage(implants)
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "SR5.TransmutationTitle"
    },
    content: `<p>${game.i18n.format("SR5.TransmutationConfirm", {
      name: escape(actor.name), count: rejected.length, damage
    })}</p>`,
    rejectClose: false,
  })
  if (!ok) return false
  //One by one, each hole written before the next removal: essence-hole.js reads the actor's hole at each deleteItem,
  //and two removals at once kept only one of them (measured: 1.6 kept of 1.7)
  for (const implant of rejected) {
    const item = actor.items.get(implant.id)
    if (!item) continue
    const written = new Promise(resolve => {
      const hook = Hooks.on("updateActor", (a, changes) => {
        if (a.uuid === actor.uuid && foundry.utils.hasProperty(changes, "system.essence.holeAmount")) done()
      })
      const timer = setTimeout(() => done(), 2000)
      function done(){
        Hooks.off("updateActor", hook)
        clearTimeout(timer)
        resolve()
      }
    })
    await item.delete()
    await written
  }
  if (damage > 0){
    const {
      SR5_PrepareRollTest
    } = await import("../rolls/roll-prepare.js")
    const damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
    damageInfo.damage.value = damage
    damageInfo.damage.type = "physical"
    await actor.takeDamage(damageInfo)
  }
  return true
}

export function activateTransmutationCardListeners(html, message){
  if (!game.user.isGM || !cardFromGM(message)) return html.querySelectorAll("[data-sr5-transmutation]").forEach(b => b.remove())
  html.querySelectorAll("[data-sr5-transmutation]").forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    const row = btn.closest(".sr5-bb-row")
    btn.disabled = true
    const actor = await fromUuid(row.dataset.actorUuid)
    const done = actor ? await applyTransmutation(actor).catch(e => SR5_SystemHelpers.srLog(1, `Transmutation not applied: ${e}`)) : true
    if (done) await markRowDoneInMessage(row, "[data-sr5-transmutation]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}

/* -------------------------------------------- */
// Pétrification: the subject comes back when the spell's effect goes (dropped, dispelled, the caster out)

async function onDeleteItem(item){
  if (!isActiveGM() || item.type !== "itemEffect") return
  const actor = item.parent
  const stones = actor?.effects?.filter(e => e.flags?.sr5?.petrification?.effectIds?.includes(item.id)).map(e => e.id) ?? []
  if (stones.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stones)
}

/* -------------------------------------------- */

export function initMagicSupplements(){
  Hooks.on("updateCombat", (combat, changes, options) => {
    onUpdateCombat(combat, changes, options).catch(e => SR5_SystemHelpers.srLog(1, `Elemental Attunement not dealt: ${e}`))
  })
  if (isActiveGM()) for (const actor of allActors()) rememberTransmutation(actor)
  for (const hook of ["updateItem", "createItem"]) Hooks.on(hook, (item) => {
    checkTransmutation(item.parent).catch(e => SR5_SystemHelpers.srLog(1, `Transmutation not dealt: ${e}`))
  })
  Hooks.on("updateActor", (actor) => {
    checkTransmutation(actor).catch(e => SR5_SystemHelpers.srLog(1, `Transmutation not dealt: ${e}`))
  })
  Hooks.on("createToken", (token) => isActiveGM() && rememberTransmutation(token.actor))
  Hooks.on("deleteItem", (item) => {
    onDeleteItem(item).catch(e => SR5_SystemHelpers.srLog(1, `Petrification not lifted: ${e}`))
  })
}
