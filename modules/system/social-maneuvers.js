// Social Maneuvers, Cutting Aces p. 153-154 (VF), without Foundry.
// "Toutes les manœuvres sociales imposent un modificateur de –4 dés au test indiqué, sauf mention contraire,
// et coûtent une Action gratuite en plus de toute autre action listée." (p. 153)
// The roll dialog offers them (social-dialog.js), the card reads their outcome (test-Skill.js) and the
// gamemaster applies what they carry to a later test (social-pending.js).

export const MANEUVER_DICE = -4

// The skill social tests resisted with a card in the system (test-Skill.js): their outcome is read on the
// resistance card, from the net hits
export const OPPOSED_SOCIAL_SKILLS = ["con", "impersonation", "etiquette", "negotiation", "intimidation", "performance", "leadership"]

// The social tests a "social tests" malus reaches (Faux pas)
export const SOCIAL_SKILLS = ["con", "impersonation", "etiquette", "negotiation", "intimidation", "performance", "leadership"]

/**
 * Each maneuver: the tests it is rolled with (skill keys, "knowledge" for a Knowledge skill,
 * "judgeIntentions" for the derived test), its dice, what makes it succeed, and what it carries.
 *  - success: "net" (at least 1 net hit, read on the resistance card), "hit" (at least 1 hit),
 *    "fail" (Hustle: it works when the test fails), "gm" (opposed outside the system's cards: the gamemaster judges)
 *    or null (nothing to carry, the card only recalls the effect)
 *  - carry: what the gamemaster applies to a later test. to: "self" (the author) or "target";
 *    dice or limit ("hits" = the test's hits); tests: what it applies to; versus: only against the other party;
 *    persistent: until removed (the encounter), otherwise once
 */
export const SOCIAL_MANEUVERS = {
  charmingPerformance: {
    tests: ["performance"], success: "net"
  },
  drillSergeant: {
    tests: ["intimidation"], success: "net",
    carry: {
      to: "target", dice: -2, tests: ["leadership"], resistOnly: true
    }
  },
  fauxPas: {
    tests: ["etiquette"], success: "net",
    carry: {
      to: "target", dice: -2, tests: SOCIAL_SKILLS
    }
  },
  hustle: {
    tests: ["con"], dice: -6, success: "fail",
    carry: {
      to: "self", dice: 2, tests: ["con", "negotiation"], versus: true
    }
  },
  informedOpinion: {
    tests: ["knowledge"], success: "hit",
    carry: {
      to: "self", limit: "hits", tests: SOCIAL_SKILLS, persistent: true
    }
  },
  diversion: {
    tests: ["con"], success: "net",
    carry: {
      to: "target", dice: -4, tests: ["perception"]
    }
  },
  motivatingTeacher: {
    tests: ["leadership"], success: "hit",
    carry: {
      to: "self", dice: 2, tests: ["instruction"]
    }
  },
  peerTutoring: {
    tests: ["instruction"], success: null
  },
  physicalContact: {
    tests: ["etiquette"], success: "net",
    carry: {
      to: "self", dice: 2, tests: ["palming"], versus: true
    }
  },
  pushHome: {
    tests: ["negotiation"], success: null, doublesLeverage: true
  },
  saveFace: {
    tests: ["etiquette"], success: "net"
  },
  drawAttention: {
    tests: ["con"], success: null
  },
  fakeGun: {
    tests: ["palming"], success: "gm",
    carry: {
      to: "self", dice: 2, tests: ["con", "intimidation"], versus: true
    }
  },
  zanshin: {
    tests: ["judgeIntentions"], dice: -2, success: null
  },
}

/**
 * The dice a maneuver takes off its own test (p. 153: -4 unless stated otherwise).
 * Push Home (p. 154) doubles the +2 for leverage: the extra +2 comes on top of the -4.
 */
export function maneuverDice(key){
  const m = SOCIAL_MANEUVERS[key]
  if (!m) return 0
  return (m.dice ?? MANEUVER_DICE) + (m.doublesLeverage ? 2 : 0)
}

/**
 * The maneuvers offered on a test: a skill key, "knowledge" or "judgeIntentions".
 */
export function maneuversFor(test){
  return Object.keys(SOCIAL_MANEUVERS).filter(k => SOCIAL_MANEUVERS[k].tests.includes(test))
}

/**
 * Whether the maneuver worked, from the test's result.
 * @param {string} key
 * @param {{hits:number, net:number|null}} result - net: the net hits of an opposed test, null on the author's card
 * @returns {boolean|null} null when the card cannot tell (waiting for the resistance, or the gamemaster's call)
 */
export function maneuverSucceeded(key, result){
  const m = SOCIAL_MANEUVERS[key]
  if (!m || !m.success) return null
  const hits = Math.max(0, Number(result?.hits) || 0)
  const net = result?.net
  switch (m.success){
    case "hit":
      return hits > 0
    case "net":
      return net === null || net === undefined ? null : net > 0
    case "fail":
      if (net !== null && net !== undefined) return net <= 0
      return hits === 0 ? true : null
    default:
      return null
  }
}

/**
 * The effect the maneuver carries to a later test, ready to store (social-pending.js), or null.
 * @param {string} key
 * @param {{hits:number}} result
 * @param {{authorId:string, targetId:string|null}} parties
 */
export function carriedEffect(key, result, parties){
  const c = SOCIAL_MANEUVERS[key]?.carry
  if (!c) return null
  const hits = Math.max(0, Number(result?.hits) || 0)
  const value = c.limit === "hits" ? hits : c.dice
  if (!value) return null
  const holder = c.to === "self" ? parties?.authorId : parties?.targetId
  if (!holder) return null
  return {
    maneuver: key,
    holder,
    kind: c.limit ? "limit" : "dice",
    value,
    tests: c.tests,
    resistOnly: !!c.resistOnly,
    // The other party: the target for the author's bonus, the author for the target's malus
    versus: c.versus ? (c.to === "self" ? parties?.targetId ?? null : parties?.authorId ?? null) : null,
    persistent: !!c.persistent,
  }
}

/**
 * Zanshin (p. 154): what the net hits tell of the target's Close Combat skills.
 * @returns {number} 0 to 3, the tier reached
 */
export function zanshinTier(net){
  return Math.max(0, Math.min(3, Math.floor(Number(net) || 0)))
}
