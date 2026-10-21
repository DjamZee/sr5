import {
  SR5
} from "../../config.js"
import {
  callSubscribers
} from "../../system/house-rule-hooks.js"

/**
 * The hook through which a module names the attribute a technomancer resists Fading with, besides Resonance.
 * The book's is Willpower (SR5 p. 254); a world whose house rule changes it (the streams of a fan supplement,
 * Charisma or Logic) says so in a module, never in the system.
 * Called with `{actor, persona, attribute}`: `persona` "resonance" (a living persona) or "nanite" (a head case),
 * `attribute` "willpower". A subscriber sets `attribute` to a key of SR5.characterAttributes; any other value leaves
 * Willpower; a subscriber that throws has its answer thrown away (the others' kept). Without a module, no subscriber:
 * Willpower.
 */
export const FADING_RESISTANCE_HOOK = "sr5.fadingResistance"
export const DEFAULT_FADING_ATTRIBUTE = "willpower"

/** The attribute added to Resonance (or the Nanite Volume) to resist Fading, once the subscribers have had their say. */
export function fadingResistanceAttribute(actor, persona = "resonance", {
  hooks = globalThis.Hooks
} = {
}) {
  const data = {
    actor, persona, attribute: DEFAULT_FADING_ATTRIBUTE
  }
  // Each subscriber called here, not through Hooks.callAll, which keeps what a failing one wrote (house-rule-hooks.js)
  try {
    if (!callSubscribers(FADING_RESISTANCE_HOOK, data, ["attribute"], hooks)) return DEFAULT_FADING_ATTRIBUTE
  } catch (error) {
    console.error(`SR5 | ${FADING_RESISTANCE_HOOK}: the subscribers could not be called, Willpower kept`, error)
    return DEFAULT_FADING_ATTRIBUTE
  }
  const value = data.attribute
  return typeof value === "string" && Object.hasOwn(SR5.characterAttributes, value) && actor?.system?.attributes?.[value] ?
    value : DEFAULT_FADING_ATTRIBUTE
}
