// Spirit bonds and reputations (Street Grimoire p. 207, Forbidden Arcana p. 169-176): pure helpers, no Foundry
// dependency. The callers read the actors, these functions only do the arithmetic of the rules.

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
// Returns the paths refused.
export function stripGMOnlyChanges(changes, current, paths){
  const refused = []
  for (const path of paths){
    if (path in changes){
      if (changes[path] !== readPath(current, path)) {
        refused.push(path)
        delete changes[path]
      }
      continue
    }
    const keys = path.split(".")
    const last = keys.pop()
    const parent = readPath(changes, keys.join("."))
    if (parent && typeof parent === "object" && last in parent && parent[last] !== readPath(current, path)){
      refused.push(path)
      delete parent[last]
    }
  }
  return refused
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

// Calling a wild spirit by Conjuring (Forbidden Arcana p. 170): "nombre de réussites égal à (1 + Réputation astrale
// de l'invocateur)".
export function wildCallThreshold(reputation){
  return 1 + Math.max(0, Number(reputation) || 0)
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
