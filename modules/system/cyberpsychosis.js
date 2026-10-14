// Cyberpsychosis (Chrome Flesh p. 59): on a glitch at a social test, the character acts inappropriately or
// overreacts violently; on a critical glitch, a psychotic break makes him a NPC until the gamemaster decides he
// has recovered. The card of the roll only reminds it: the system never takes the sheet from its owner, the
// gamemaster rules the break and its end (options B accepted by DjamZ on 14/10).
// The quality is known by its name, FR or VO, whatever compendium it comes from: none carries a key for it.
import {
  SR5
} from "../config.js"

const NAME = /^cyber-?psychos(e|is)$/i

export function isCyberpsychosis(item){
  return item?.type === "itemQuality" && item.system?.isActive !== false && NAME.test((item.name ?? "").trim())
}

// The localization key of the reminder, or null: a social skill test, a glitch, an active Cyberpsychosis
export function cyberpsychosisReminder(actor, skillKey, roll){
  if (!roll?.glitchRoll && !roll?.criticalGlitchRoll) return null
  if (!(skillKey in SR5.socialSkills)) return null
  if (!Array.from(actor?.items ?? []).some(isCyberpsychosis)) return null
  return roll.criticalGlitchRoll ? "SR5.CyberpsychosisCriticalGlitch" : "SR5.CyberpsychosisGlitch"
}
