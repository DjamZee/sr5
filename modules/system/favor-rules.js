// The favors between a character and a contact, without Foundry (lot 37a).
// Run Faster p. 170-172 (VF; p. 176-178 VO) and SR5 p. 391 « Faveurs ».
//
// One signed balance of chips, kept on the contact item (system.favors.chips):
//   > 0 the character holds chips on the contact (the contact owes),
//   < 0 the contact holds chips on the character (the character owes),
//   = 0 even.
// The book keeps the two sides apart but nets them as soon as a favor is asked: « le contact gagne un
// nombre de jetons égal à l'indice de la Faveur demandée moins les éventuels jetons que le personnage
// aurait encore avec le contact » (RF p. 170). A signed balance is that netting.

// RF p. 170: each chip spent adds one die to the Negotiation test for a favor, +4 at most
export const MAX_CHIP_DICE = 4

// SR5 p. 391: favors are rated 1 to 6
export const FAVOR_RATINGS = [1, 2, 3, 4, 5, 6]

// RF p. 172, the natures of the relationship that change the chips
export const RELATIONS = ["", "family", "blackmail"]

// How many history lines the contact keeps (« historique court », brief of DjamZ)
export const LOG_LENGTH = 12

const int = v => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : 0
}

/** The favors block of a contact, with its defaults. */
export function favorsOf(system) {
  const f = system?.favors ?? {
  }
  return {
    chips: int(f.chips),
    relation: RELATIONS.includes(f.relation) ? f.relation : "",
    intimidated: !!f.intimidated,
    log: Array.isArray(f.log) ? f.log : [],
  }
}

/** Who owes whom: "contactOwes", "characterOwes" or "even", and how many chips. */
export function balanceOf(chips) {
  const n = int(chips)
  if (n > 0) return {
    side: "contactOwes", count: n
  }
  if (n < 0) return {
    side: "characterOwes", count: -n
  }
  return {
    side: "even", count: 0
  }
}

/** Chips a favor of this rating costs, by the nature of the relationship (RF p. 170, 172). */
export function chipsForFavor(rating, relation = "") {
  const r = Math.max(0, int(rating))
  // « Avec ce genre de contact, les Faveurs ne coûtent rien au personnage » (Chantage, RF p. 172)
  if (relation === "blackmail") return 0
  // « Le personnage gagne un jeton de moins qu'il ne le devrait pour chaque faveur accordée » (Famille, RF p. 172).
  // The VO is plainer (« earns 1 less chip than a normal contact when asking favors », RF p. 178 VO):
  // the debt a favor writes is one chip lighter
  if (relation === "family") return Math.max(0, r - 1)
  return r
}

/**
 * Whether the contact grants a favor without being convinced (SR5 p. 391): « lorsque l'indice de celle-ci
 * est égal ou inférieur à leur Loyauté », otherwise an opposed Negotiation + Charisma [Social] test.
 */
export function favorNeedsTest(rating, loyalty) {
  return int(rating) > int(loyalty)
}

/** The chips a character may spend on the Negotiation for a favor: held ones, +4 at most (RF p. 170). */
export function spendableChips(chips) {
  return Math.max(0, Math.min(MAX_CHIP_DICE, int(chips)))
}

/**
 * A favor obtained: the chips spent for dice leave first, then the contact gains the rating's chips,
 * minus what the character still holds (RF p. 170). Returns the new balance.
 */
export function afterFavorObtained(chips, rating, {
  spent = 0, relation = ""
} = {
}) {
  const spend = Math.min(Math.max(0, int(spent)), spendableChips(chips))
  return int(chips) - spend - chipsForFavor(rating, relation)
}

/**
 * Paying back a debt (RF p. 170): the contact asks twice the value of the favor, so a favor of total
 * rating R given back clears R / 2 chips, rounded down; never more than the debt.
 */
export function chipsClearedByFavors(totalRating, chips) {
  const debt = Math.max(0, -int(chips))
  return Math.min(debt, Math.floor(Math.max(0, int(totalRating)) / 2))
}

/** A service done for the contact, asked or not: « ceci est considéré comme un jeton » (RF p. 170). */
export const CHIPS_FOR_SERVICE = 1

/**
 * Improving the relationship by one level (RF p. 170): chips and weeks equal to the Loyalty aimed at,
 * one chip less for a family contact (RF p. 172). Refused when the character intimidated the contact
 * (« enlève définitivement… la possibilité d'améliorer la relation », RF p. 172) or at Loyalty 6.
 */
export function loyaltyImprovement(loyalty, chips, {
  relation = "", intimidated = false
} = {
}) {
  const target = int(loyalty) + 1
  const cost = Math.max(0, relation === "family" ? target - 1 : target)
  let refused = null
  if (intimidated) refused = "intimidated"
  else if (relation === "blackmail") refused = "blackmail"
  else if (target > 6) refused = "max"
  else if (int(chips) < cost) refused = "chips"
  return {
    target, cost, weeks: target, refused
  }
}

/** A history line, newest first, the list kept to LOG_LENGTH. */
export function pushLog(log, entry) {
  return [entry, ...(Array.isArray(log) ? log : [])].slice(0, LOG_LENGTH)
}
