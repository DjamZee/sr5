// Spirit bonds and reputations (Street Grimoire p. 207, Forbidden Arcana p. 169-176): pure helpers, no Foundry
// dependency. The callers read the actors, these functions only do the arithmetic of the rules.
import {
  valueAfterUpdate
} from "../../system/reserved-fields.js"

// What only the gamemaster writes (DjamZ's ruling, 2026-10-06): the indexes, the reputation adjustment, and the
// spirit traits that change what a spirit is or owes. Many updates send the whole system back unchanged, so a player's
// update is only refused the paths whose value it would change.
export const GM_ONLY_ACTOR_PATHS = [
  "system.magic.spiritIndex", "system.magic.astralReputationAdjustment", "system.magic.wildIndex", "system.magic.hermeticElementalist",
  "system.isElemental", "system.isWild", "system.hasDomain", "system.wildBanishTotal",
]
export const GM_ONLY_ITEM_PATHS = ["system.isElemental"]

const readPath = (object, path) => path.split(".").reduce((o, key) => (o == null ? undefined : o[key]), object)

// Removes from `changes` (nested or dotted keys) every GM-only path whose value differs from `current`.
// Returns the paths refused, also those a replacement ("==system") or a deletion ("-=isWild") would change, which
// are not stripped: the caller refuses such an update whole. The value after the update is read the way Foundry
// merges it (reserved-fields.js, valueAfterUpdate), on the document's source when it has one.
export function stripGMOnlyChanges(changes, current, paths){
  const source = current?._source ?? current
  const refused = paths.filter(path => {
    const after = valueAfterUpdate(source, changes, path)
    const before = readPath(source, path)
    // A deletion brings back the field's default: a change whenever a value was set
    return typeof after === "symbol" ? before !== undefined : after !== before
  })
  for (const path of refused){
    if (path in changes){
      delete changes[path]
      continue
    }
    const keys = path.split(".")
    const last = keys.pop()
    const parent = readPath(changes, keys.join("."))
    if (parent && typeof parent === "object" && last in parent) delete parent[last]
  }
  return refused
}

// The hits of a card counted again by the gamemaster: on its first dice only, as many as the pool he works out allows
// (plus the Chance for a Push the Limit, SR5 p. 56), the rerolls of the Rule of Six kept, within the Limit.
// null when the card has no dice to count.
export function recountHits(rollJSON, pool, edge = 0, limit = 0){
  const results = rollJSON?.terms?.[0]?.results
  if (!Array.isArray(results)) return null
  const allowed = Math.max(0, (Number(pool) || 0) + Math.max(0, Number(edge) || 0))
  const kept = results.filter(d => !d.ruleOfSix).slice(0, allowed).concat(results.filter(d => d.ruleOfSix))
  const hits = kept.filter(d => d.active !== false && d.discarded !== true && Number(d.result) >= 5).length
  return Number(limit) > 0 ? Math.min(hits, Number(limit)) : hits
}

// Banishing a wild spirit from two cards (Forbidden Arcana p. 172): the banisher's card must be written by one who
// owns the banisher, the resistance card by the gamemaster or one who owns the spirit. Both are counted again.
export function wildBanishVerdict({
  banisherAuthorOwns, resistanceAuthorOwns, banisherRoll, banisherPool, banisherEdge, astralLimit, spiritRoll, force
}){
  if (!banisherAuthorOwns || !resistanceAuthorOwns) return {
    ok: false, reason: "owner"
  }
  const banisherHits = recountHits(banisherRoll, banisherPool, banisherEdge, astralLimit)
  const spiritHits = recountHits(spiritRoll, 2 * (Number(force) || 0), 0, 0)
  if (banisherHits === null || spiritHits === null) return {
    ok: false, reason: "dice"
  }
  return {
    ok: true, banisherHits, spiritHits, netHits: Math.max(0, banisherHits - spiritHits)
  }
}

// Testing the Leash from a card (Forbidden Arcana p. 176): the card's author owns the controller (or is the
// gamemaster), and the spirit is one the controller summoned (his own spirit item). Nothing else is read on the card.
export function leashCardVerdict({
  authorIsGM, authorOwnsController, spiritOfController
}){
  if (!spiritOfController) return {
    ok: false, reason: "spirit"
  }
  if (!authorIsGM && !authorOwnsController) return {
    ok: false, reason: "owner"
  }
  return {
    ok: true
  }
}

// Astral Reputation (Street Grimoire p. 207): "commence à 0. Tous les 25 points d'Index spirituel cumulés, sa
// réputation augmente de 1". The adjustment carries what the index does not: the hermetic elementalist's 6
// (Forbidden Arcana p. 175), each geas (-1), atonement.
export function astralReputation(spiritIndex, adjustment = 0){
  const fromIndex = Math.floor(Math.max(0, Number(spiritIndex) || 0) / 25)
  return Math.max(0, fromIndex + (Number(adjustment) || 0))
}

// Wild Reputation (Forbidden Arcana p. 170): "commence à 0. Pour chaque 25 points d'Indice Sauvage […] augmente
// de 1". The index can go below 0 (binding, toxicity), the reputation never does.
export function wildReputation(wildIndex){
  return Math.max(0, Math.floor((Number(wildIndex) || 0) / 25))
}

// Elemental trait (Forbidden Arcana p. 175): Logic, Intuition, Charisma and Willpower "réduits de la moitié de leur
// Puissance (arrondi à l'inférieur) […] jusqu'à un attribut minimum modifié de 1".
export const ELEMENTAL_MENTAL_ATTRIBUTES = ["logic", "intuition", "charisma", "willpower"]
export function elementalReduction(force, attributeValue){
  const wanted = Math.floor(Math.max(0, Number(force) || 0) / 2)
  return Math.min(wanted, Math.max(0, (Number(attributeValue) || 0) - 1))
}

// Elemental trait (p. 175): "tout test d'Invocation ou de Lien d'esprit qui génère au moins 1 service après avoir
// été entièrement résolu gagne un service supplémentaire".
// The four types a hermetic elementalist summons, and the only ones the trait can apply to (p. 175)
export const ELEMENTAL_SPIRIT_TYPES = ["air", "earth", "fire", "water"]
export function elementalServices(services, isElemental){
  const owed = Math.max(0, Number(services) || 0)
  return isElemental && owed >= 1 ? owed + 1 : owed
}

// Testing the Leash (Forbidden Arcana p. 176): "Chaque fois qu'un esprit obtient un nombre de succès égal ou
// supérieur à 6 - (Puissance/2)": Force 3 tests on 5 hits, Force 6 on 3, so the half is rounded down.
export function leashThreshold(force){
  return 6 - Math.floor(Math.max(0, Number(force) || 0) / 2)
}

// An elemental never tests the leash (p. 175 and 176); a spirit with no services left has nothing to break.
export function testsLeash({
  hits, force, isElemental, services
}){
  if (isElemental) return false
  if (!(Number(services) > 0)) return false
  return (Number(hits) || 0) >= leashThreshold(force)
}

// Testing the Leash, outcome (p. 176): Force x 2 against the controller's Drain resistance pool. Each net hit of the
// controller is 1 Stun on the spirit; each net hit of the spirit erases 1 service, or, on a tight leash, is 1 box of
// damage on the controller instead. "Si la Puissance de l'esprit est supérieure à la Magie du contrôleur, les
// dommages subis sont physiques" (read for the controller's damage).
export function resolveLeash({
  controllerHits, spiritHits, tight, force, magic, services
}){
  const net = (Number(controllerHits) || 0) - (Number(spiritHits) || 0)
  const result = {
    spiritStun: 0, servicesLost: 0, controllerDamage: 0, damageType: "stun", servicesLeft: Math.max(0, Number(services) || 0)
  }
  if (net > 0) result.spiritStun = net
  else if (net < 0) {
    if (tight) {
      result.controllerDamage = -net
      result.damageType = (Number(force) || 0) > (Number(magic) || 0) ? "physical" : "stun"
    } else {
      result.servicesLost = Math.min(-net, result.servicesLeft)
      result.servicesLeft -= result.servicesLost
    }
  }
  return result
}

// Banishing a wild spirit (p. 172): the banisher's net hits add up from 0; the spirit is dissipated once the total
// reaches Force x 2.
export function wildBanishProgress(previousTotal, netHits, force){
  const total = Math.max(0, Number(previousTotal) || 0) + Math.max(0, Number(netHits) || 0)
  return {
    total, dissipated: total >= 2 * (Number(force) || 0)
  }
}

// Drain of that attempt (p. 172): "égale au nombre de succès (pas les succès excédentaires) sur le dernier test de
// Défense de l'esprit, avec une valeur de drain minimum de 2", Physical when Force exceeds the banisher's Magic.
export function wildBanishDrain(spiritHits, force, magic){
  return {
    value: Math.max(2, Number(spiritHits) || 0),
    type: (Number(force) || 0) > (Number(magic) || 0) ? "physical" : "stun",
  }
}

// Domain trait (p. 172): "Lorsque vous utilisez les pouvoirs d'Accident, de Garde ou de Recherche, utilisez la
// Magie x 2 de l'esprit".
export const DOMAIN_POWERS = ["accident", "guard", "search"]
// Powers carry no key for these three, only their name: French and English names of SR5 p. 394-401
const DOMAIN_POWER_NAMES = {
  accident: "accident", garde: "guard", guard: "guard", recherche: "search", search: "search"
}
export function domainPowerKey(name){
  return DOMAIN_POWER_NAMES[String(name || "").trim().toLowerCase()] ?? null
}
export function domainMagicMultiplier(power, hasDomain){
  return hasDomain && DOMAIN_POWERS.includes(power) ? 2 : 1
}
