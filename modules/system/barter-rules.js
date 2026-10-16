// Advanced Social Skill rules, Cutting Aces p. 160-162 and 164 (VF): the negotiated value and the
// Bartering table, and what Intimidation obtains, without Foundry. The window is barter-app.js.

// "Chaque succès excédentaire obtenu par les joueurs modifie la valeur finale de l'offre de 10 %" (p. 161)
export const NET_HIT_STEP = 0.10
// "Chaque point d'Influence vaut 1 000 nuyens dans la valeur négociée" (p. 161)
export const INFLUENCE_VALUE = 1000
// Service, active skill: (dice pool ÷ 4, rounded up) × 150 ¥ per hour (p. 162)
export const SERVICE_HOURLY_BASE = 150
// Service, information: Knowledge dice pool × 100 ¥ (p. 162)
export const INFORMATION_VALUE = 100
// Intimidation without an offer: 250 ¥ (or one true detail) per net hit (p. 164)
export const INTIMIDATION_VALUE = 250

const n = v => Math.max(0, Number(v) || 0)

/**
 * The negotiated value (p. 160-161): the NPC's starting offer moved by 10 % per net hit of the characters,
 * in their favour: down when they pay, up when they are paid. Never below 0.
 * @param {number} offer - the NPC's starting offer, in nuyen
 * @param {number} net - the characters' net hits (negative when the NPC won)
 * @param {"pay"|"receive"} side - whether the characters pay or receive the value
 */
export function negotiatedValue(offer, net, side){
  const o = n(offer)
  const shift = Math.floor(Number(net) || 0) * NET_HIT_STEP * o
  return Math.max(0, Math.round(side === "receive" ? o + shift : o - shift))
}

/**
 * Equipment offered in a negotiation (p. 161): [Cost + (Cost × Availability × 10 %)] ÷ 2, per unit.
 * Only for a piece offered unexpectedly, not for an item a character wants to buy.
 */
export function equipmentValue(cost, availability, quantity = 1){
  const c = n(cost)
  const unit = (c + c * n(availability) * 10 / 100) / 2
  return Math.round(unit * Math.max(1, Math.floor(Number(quantity) || 1)))
}

/**
 * A contact offered (p. 161): Influence × 1,000 ¥.
 */
export function contactValue(influence){
  return Math.floor(n(influence)) * INFLUENCE_VALUE
}

/**
 * A service, active skill (p. 162): ceil(dice pool ÷ 4) × 150 ¥ per hour, times the hours.
 * The book's example: 12 dice for half an hour = 450 ¥, so a shorter task still counts one hour.
 */
export function serviceValue(dicePool, hours){
  const rate = Math.ceil(n(dicePool) / 4) * SERVICE_HOURLY_BASE
  return Math.round(rate * Math.max(1, n(hours)))
}

/**
 * Information (p. 162): the Knowledge skill's dice pool × 100 ¥. Without the skill, the gamemaster
 * estimates it as a pool of 5 to 12.
 */
export function informationValue(dicePool){
  return Math.floor(n(dicePool)) * INFORMATION_VALUE
}

/**
 * The value of a bartering line, by its kind (the Bartering table, p. 162).
 * @param {{kind:"cash"|"equipment"|"contact"|"service"|"information", amount?:number, cost?:number,
 *   availability?:number, quantity?:number, influence?:number, dicePool?:number, hours?:number}} line
 */
export function lineValue(line){
  switch (line?.kind){
    case "cash":
      return Math.round(n(line.amount))
    case "equipment":
      return equipmentValue(line.cost, line.availability, line.quantity)
    case "contact":
      return contactValue(line.influence)
    case "service":
      return serviceValue(line.dicePool, line.hours)
    case "information":
      return informationValue(line.dicePool)
    default:
      return 0
  }
}

/**
 * What remains to settle once the lines are counted: positive = still owed in cash.
 */
export function remainder(value, lines){
  return Math.round(n(value) - (lines ?? []).reduce((s, l) => s + lineValue(l), 0))
}

/**
 * What Intimidation obtains (p. 164): with an offer, each net hit is 10 % of it obtained for nothing
 * (the example p. 165: 3 net hits = 3 × 10 % of 2,000 ¥); without one, 250 ¥ (or a true detail) per net hit.
 * No net hit: the Intimidation fails.
 */
export function intimidationValue(net, offer){
  const hits = Math.max(0, Math.floor(Number(net) || 0))
  if (n(offer) > 0) return Math.round(hits * NET_HIT_STEP * n(offer))
  return hits * INTIMIDATION_VALUE
}

/**
 * What follows a failed Intimidation (p. 164), from the intimidator's roll: a glitch makes a grudge,
 * a critical glitch a lasting enemy.
 * @returns {"enemy"|"grudge"|null}
 */
export function intimidationFallout(roll){
  if (roll?.criticalGlitchRoll) return "enemy"
  if (roll?.glitchRoll) return "grudge"
  return null
}
