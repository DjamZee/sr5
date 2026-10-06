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

/** The deleteItem hook: an implant removed from a character. */
async function onImplantDeleted(item) {
  if (item?.type !== "itemAugmentation" || item.system?.isAccessory || !(item.parent instanceof Actor)) return
  if (!game.users.activeGM?.isSelf) return
  if (game.settings.get("sr5", "sr5ShopCreationMode") === true) return
  const actor = item.parent
  if (!actor.system?.essence) return
  const others = actor.items.filter(i => i.id !== item.id)
  const next = holeAfterRemoval(actor.system.essence, implantsEssenceLost([...others, item]), implantsEssenceLost(others),
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
