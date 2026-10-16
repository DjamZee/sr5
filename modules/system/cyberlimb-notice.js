// Cyberlimbs (SR5 p. 459-460): a Strength or Agility enhancement plugged into a limb raises the limb, not the body
// (75e38bd14). The weapons that were on the sheets before all have "Tenue par" empty: they fire with the body, and a
// character who counted on the enhancement loses it without a word. Decision of DjamZ (relayed by Élise, 2026-10-07):
// the active gamemaster is told once per world, at the load, which characters are concerned and what to set.
import {
  isCyberlimb, limbAccessories, enhancementBonuses
} from "./cyberlimb.js"
import {
  worldActors
} from "./world-actors.js"
import {
  updateLedger
} from "./gm-ledger.js"

export const CYBERLIMB_NOTICE = "sr5CyberlimbNotice"

/**
 * The characters with a Strength or Agility enhancement plugged into one of their cyberlimbs, and their weapons that
 * fire with the body.
 * @returns {{name: string, limbs: string[], weapons: string[]}[]}
 */
export function limbEnhancementHolders(actors){
  const found = []
  for (const actor of actors ?? []){
    const items = actor?.items
    const limbs = Array.from(items ?? []).filter(isCyberlimb)
      .filter(limb => limbAccessories(limb, items).some(a => enhancementBonuses(a.system).length))
    if (!limbs.length) continue
    const weapons = Array.from(items ?? []).filter(i => i.type === "itemWeapon" && !i.system?.heldByLimb && !i.system?.isAccessory)
      .map(i => i.name)
    found.push({
      name: actor.name, limbs: limbs.map(l => l.name), weapons
    })
  }
  return found
}

const escape = text => foundry.utils.escapeHTML?.(String(text)) ?? String(text)

export function noticeContent(holders){
  const rows = holders.map(h => `<li><strong>${escape(h.name)}</strong> : ${escape(h.limbs.join(", "))}${h.weapons.length ? ` — ${escape(game.i18n.format("SR5.CyberlimbNoticeWeapons", {
    weapons: h.weapons.join(", ")
  }))}` : ""}</li>`).join("")
  return `<p>${game.i18n.localize("SR5.CyberlimbNoticeIntro")}</p><ul>${rows}</ul><p>${game.i18n.localize("SR5.CyberlimbNoticeHowTo")}</p>`
}

// Shown once per world: the register is claimed before the message, so a second gamemaster or a reload says nothing
export async function showCyberlimbNotice(actors = worldActors()){
  if (!game.users?.activeGM?.isSelf) return false
  let first = false
  await updateLedger(CYBERLIMB_NOTICE, ledger => {
    if (ledger.shown) return null
    first = true
    return {
      ...ledger, shown: new Date().toISOString()
    }
  })
  if (!first) return false
  const holders = limbEnhancementHolders(actors)
  if (!holders.length) return false
  await ChatMessage.create({
    content: noticeContent(holders),
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
  })
  return true
}

export function registerCyberlimbNotice(){
  Hooks.once("init", () => game.settings.register("sr5", CYBERLIMB_NOTICE, {
    scope: "world", config: false, type: Object, default: {
    },
  }))
  Hooks.once("ready", () => showCyberlimbNotice().catch(e => console.error("SR5 | cyberlimb notice", e)))
}
