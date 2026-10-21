// The Essence a removed implant took stays lost: "Quand de l'Essence est perdue, elle ne revient pas" (SR5 p. 53;
// arbitrage de DjamZ, H22). At each removal the actor keeps the hole (system.essence.holeAmount) and what the
// implants took right after it (holeBase). Nothing fills it by default; with the Faille d'Essence (Chrome Flesh p. 74,
// optional rule, world setting off by default, séance G, G20) what is installed beyond that base fills it
// (implant-essence.js, essenceHole). An implant made cheaper in place (a quality, a grade edited) opens no hole:
// only a removal does. An actor saved before this keeps its Essence: its hole starts at the next removal.
//
// Written by the active gamemaster alone, from the deleteItem hook every client runs: a player cannot touch it
// (entityActor.js strips it from a player's update). While the shop's creation mode is on, the build is not
// surgery yet and the book is silent on taking an implant back at creation: a removal leaves no hole.
import {
  implantsEssenceLost, essenceHole, essenceSettingOn, ESSENCE_HOLE_SETTING
} from "./implant-essence.js"
import {
  IMPLANT_REGISTER, PEAK_COST, vouchedMarks
} from "./implant-register.js"
import {
  SR5_UtilityItem
} from "../entities/items/utilityItem.js"
import {
  creationModeFor
} from "./creation-actor.js"

/**
 * The hole kept after an implant is removed.
 * @param {{holeAmount: number, holeBase: number}} essence the actor's, before the removal
 * @param {number} lostBefore the Essence the implants took with the removed one
 * @param {number} lostAfter the Essence they take without it
 * @param {boolean} [fills] the Faille d'Essence rule is on: the implants installed since filled part of the hole
 * @returns {{holeAmount: number, holeBase: number}}
 */
export function holeAfterRemoval(essence, lostBefore, lostAfter, fills = true) {
  const open = essenceHole(essence, lostBefore, fills)
  return {
    holeAmount: Math.round((open + Math.max(0, lostBefore - lostAfter)) * 100) / 100,
    holeBase: Math.max(0, lostAfter),
  }
}

/**
 * Whether removing `item` leaves Essence lost: an implant, not an accessory, and not one whose loss "est réversible dès
 * que le tatouage est retiré" (Better Than Bad p. 141).
 * @param {{isAccessory: boolean, reversibleEssence: boolean}} [marks] the marks the gamemaster vouches for (his
 *   register, implant-register.js vouchedMarks); without them, the item's own
 */
export function leavesHole(item, marks = item?.system) {
  return item?.type === "itemAugmentation" && !marks?.isAccessory && !marks?.reversibleEssence
}

/**
 * The Essence a removed implant took, at the base cost and multiplier the gamemaster's register holds: a player who
 * lowered them just before the removal would leave a smaller hole. Worked out by the sheet's own function.
 * @param {object} [entry] the implant's register entry
 * @param {Function} [compute] how an implant's data is priced (SR5_UtilityItem._handleAugmentation)
 */
export function registeredCost(item, entry, actor, compute = (data, body) => SR5_UtilityItem._handleAugmentation(data, body, item)) {
  const value = Number(item?.system?.essenceCost?.value) || 0
  if (!entry || !("essenceCost.base" in entry)) return value
  const now = item.system?.essenceCost ?? {
  }
  if (Number(now.base) === Number(entry["essenceCost.base"]) && (now.multiplier ?? "") === (entry["essenceCost.multiplier"] ?? "")) return value
  const data = foundry.utils.deepClone(item._source?.system ?? item.system)
  data.essenceCost = {
    ...data.essenceCost, base: entry["essenceCost.base"], multiplier: entry["essenceCost.multiplier"] ?? "", modifiers: []
  }
  for (const key of ["price", "availability", "capacity", "capacityTaken"]) if (data[key]) data[key].modifiers = []
  compute(data, actor)
  return Number(data.essenceCost?.value) || 0
}

/**
 * The Essence a removed implant leaves lost: the highest cost the active GM ever saw it take (PEAK_COST: a rating or a
 * grade lowered just before the removal gives nothing back, SR5 p. 53; an implant replaced or improved leaves its
 * hole, Chrome Flesh p. 74), and never less than its cost at the registered base.
 */
export function removedCost(item, entry, actor, compute) {
  return Math.max(Number(entry?.[PEAK_COST]) || 0, registeredCost(item, entry, actor, compute))
}

/**
 * Removals of one actor gathered into one batch: a single deleteEmbeddedDocuments that takes several implants fires
 * one deleteItem per implant before the actor's update lands, and each one alone would read the hole the others had
 * not written yet (two implants, one hole: 1.6 instead of 1.7, Ambre's measure). The batch closes once the hooks of
 * that deletion have run; it waits for the actor's previous batch, so it reads the hole that one wrote.
 * @param {string} key the actor's uuid
 * @param {*} entry what the hook read of the removed item
 * @param {(entries: Array) => Promise} process works the batch out, once
 * @param {Function} [defer] when the batch closes (a promise executor)
 * @returns {Promise} settled once the batch holding `entry` is worked out
 */
export function batchRemoval(key, entry, process, defer = resolve => setTimeout(resolve, 0)) {
  let batch = OPEN_BATCHES.get(key)
  if (!batch) {
    batch = {
      entries: []
    }
    OPEN_BATCHES.set(key, batch)
    const collected = new Promise(defer).then(() => {
      OPEN_BATCHES.delete(key)
      return batch.entries
    })
    const previous = QUEUES.get(key) ?? Promise.resolve()
    batch.done = Promise.all([collected, previous]).then(([entries]) => process(entries))
    const settled = batch.done.catch(() => {})
    QUEUES.set(key, settled)
    settled.then(() => {
      if (QUEUES.get(key) === settled) QUEUES.delete(key)
    })
  }
  batch.entries.push(entry)
  return batch.done
}
const OPEN_BATCHES = new Map()
const QUEUES = new Map()

/** The deleteItem hook: an implant removed from a character. */
async function onImplantDeleted(item) {
  if (item?.type !== "itemAugmentation" || !(item.parent instanceof Actor)) return
  if (!game.users.activeGM?.isSelf) return
  // Read before anything waits: the register still holds the entry the deletion is about to remove
  const register = game.settings.get("sr5", IMPLANT_REGISTER) ?? {
  }
  const actor = item.parent
  // At creation, the world's or the character's own (lot C0), an implant taken off leaves no hole
  if (creationModeFor(actor)) return
  if (!actor.system?.essence) return
  return batchRemoval(actor.uuid, {
    item, register
  }, entries => applyRemovals(actor, entries))
}

/** The hole every implant of one batch leaves, each one counted (SR5 p. 53, Chrome Flesh p. 74). */
async function applyRemovals(actor, entries) {
  const removed = []
  for (const {
    item, register
  } of entries) {
    // Never the deleted document's marks: a player's write the GM has not put back yet would open no hole
    // (Apollinaire's review)
    const marks = await vouchedMarks(item, register)
    if (!leavesHole(item, marks)) continue
    removed.push({
      type: item.type, system: {
        type: item.system?.type, isAccessory: false, transhumanGift: item.system?.transhumanGift,
        essenceCost: {
          value: removedCost(item, register[item.uuid], actor)
        }
      }
    })
  }
  if (!removed.length || !actor.system?.essence) return
  const gone = new Set(entries.map(e => e.item.id))
  const others = actor.items.filter(i => !gone.has(i.id))
  const next = holeAfterRemoval(actor.system.essence, implantsEssenceLost([...others, ...removed]), implantsEssenceLost(others),
    essenceSettingOn(ESSENCE_HOLE_SETTING))
  await actor.update({
    "system.essence.holeAmount": next.holeAmount, "system.essence.holeBase": next.holeBase
  })
}

/** The gamemaster's correction: the hole is closed. */
export async function clearEssenceHole(actor) {
  if (!game.user.isGM || !actor?.system?.essence) return
  await actor.update({
    "system.essence.holeAmount": 0, "system.essence.holeBase": 0
  })
}

export function registerEssenceHoleHooks() {
  Hooks.on("deleteItem", item => onImplantDeleted(item).catch(e => console.error("SR5 | Essence hole", e)))
}
