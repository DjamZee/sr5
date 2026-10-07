/**
 * Hiding an object on oneself, and searching someone for it (SR5 p. 135, p. 422).
 *
 * SR5 p. 422, "Dissimuler activement de l'équipement": the one who hides rolls Palming + Agility [Physical],
 * the one who looks Perception + Intuition [Mental] with the object's concealability added to his pool; he may
 * use Palming instead of Perception. In a pat-down, he may use Agility and the Physical limit instead of
 * Intuition and the Mental limit, and the concealability is changed: a negative one is halved, a positive one
 * doubled. "Repérer les objets dissimulés" (same page): at least one hit is needed to notice anything.
 *
 * What the book leaves open was ruled by DjamZ (2026-10-07): the hidden object keeps its state, the hits of
 * the one who hid it, until it is taken out; Perception or a pat-down meets it later. The searcher, who
 * defends against the hiding, wins a tie, as in the pickpocket (pickpocket-rules.js).
 *
 * Kept free of Foundry globals so the rules can be read, and tested, alone.
 */
import {
  concealmentOf, PERCEPTION_SITUATIONS
} from "./pickpocket-rules.js"

export const CONCEALED_FLAG = "concealed"

export const SEARCH_MODES = ["spot", "patDown"]

//Who looks: Perception, or Palming instead (SR5 p. 422)
export const SEARCH_SKILLS = ["perception", "palming"]

//Intuition [Mental], or in a pat-down Agility [Physical] (SR5 p. 422)
export const SEARCH_ATTRIBUTES = {
  intuition: "mentalLimit",
  agility: "physicalLimit",
}

//Item types that can be hidden on oneself: those with a concealability (weapons, armors, gears, devices)
export function canBeConcealed(item) {
  return !!item?.system?.concealment && item.type !== "itemVehicle"
}

//The state an object keeps once hidden, or null: the hits of the one who hid it
export function concealedState(item) {
  const state = item?.flags?.sr5?.[CONCEALED_FLAG]
  if (!state || typeof state !== "object") return null
  const hits = Math.floor(Number(state.hits))
  return Number.isFinite(hits) && hits >= 0 ? {
    ...state, hits
  } : null
}

export function concealedItems(actor) {
  return Array.from(actor?.items ?? []).filter(i => concealedState(i))
}

//What a critical glitch leaves: the object is not hidden at all
export function concealResult({
  hits = 0, criticalGlitch = false
}) {
  if (criticalGlitch) return null
  return {
    hits: Math.max(0, Math.floor(Number(hits)) || 0)
  }
}

/**
 * The concealability as the searcher's pool takes it (SR5 p. 422): as is when he looks; in a pat-down, a
 * negative one halved (rounded towards zero, the searcher's way: -3 gives -1) and a positive one doubled.
 */
export function searchConcealment(concealment, mode) {
  const value = Number(concealment) || 0
  if (mode !== "patDown") return value
  if (value < 0) return Math.ceil(value / 2) || 0
  return value * 2
}

/**
 * The searcher's pool before the object's concealability: the skill's own pool, its linked attribute swapped
 * for the one chosen (Intuition, or Agility in a pat-down).
 * @param {Number} skillPool - the skill's dice pool as the sheet works it out
 * @param {Number} linkedValue - what the skill's own linked attribute gives in it
 * @param {Number} chosenValue - the attribute chosen
 */
export function searchBasePool(skillPool, linkedValue, chosenValue) {
  return (Number(skillPool) || 0) - (Number(linkedValue) || 0) + (Number(chosenValue) || 0)
}

//The modifiers of the searcher's pool for one object: its concealability, the situations the GM ticked, his own
export function searchModifiers(concealment, mode, situations = [], other = 0) {
  const list = []
  const value = searchConcealment(concealment, mode)
  if (value) list.push({
    type: "concealment", value
  })
  for (const key of situations) if (key in PERCEPTION_SITUATIONS) list.push({
    type: key, value: PERCEPTION_SITUATIONS[key]
  })
  const extra = Math.floor(Number(other)) || 0
  if (extra) list.push({
    type: "other", value: extra
  })
  return list
}

//A pool never goes below zero
export function searchPool(base, modifiers = []) {
  return Math.max(0, (Number(base) || 0) + modifiers.reduce((sum, m) => sum + (Number(m.value) || 0), 0))
}

/**
 * Whether the searcher finds the object: at least one hit (SR5 p. 422), and as many as the one who hid it,
 * the tie going to the searcher, who defends.
 */
export function isFound(searchHits, hiddenHits) {
  const hits = Number(searchHits) || 0
  return hits >= 1 && hits >= (Number(hiddenHits) || 0)
}

//Every hidden object of the target with the searcher's pool against it
export function searchPlan(items, {
  base = 0, mode = "spot", situations = [], other = 0
} = {
}) {
  return items.map(item => {
    const state = concealedState(item)
    if (!state) return null
    const modifiers = searchModifiers(concealmentOf(item), mode, situations, other)
    return {
      item, hiddenHits: state.hits, modifiers, pool: searchPool(base, modifiers)
    }
  }).filter(Boolean)
}

//Whether this update takes the object out: a weapon made ready (in hand) is no longer hidden
export function updateTakesOut(item, changes) {
  if (!concealedState(item) || item?.type !== "itemWeapon") return false
  const active = changes?.system?.isActive ?? changes?.["system.isActive"]
  return active === true
}
