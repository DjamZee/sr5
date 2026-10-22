// Addiction tests (SR5 p. 415-416). The test stands alone: a button on the sheet, or any caller (a
// future calendar of drug intakes) runs actor.rollTest("addictionTest", "<pool>_<index>"). Nothing here
// keeps track of the weeks.

// Levels of the Addiction negative quality (SR5 p. 79-80), from none to burnout
export const ADDICTION_LEVELS = ["", "mild", "moderate", "severe", "burnout"]

// The craving after a failed withdrawal test (SR5 p. 79): dice pool modifier to the tests on mental attributes
// (psychological) or physical ones (physiological), until the next fix
export const WITHDRAWAL_PENALTIES = {
  mild: -2, moderate: -4, severe: -4, burnout: -6
}

// The modifier of the withdrawal test itself (SR5 p. 417: "the appropriate modifiers for the level of addiction",
// a number the book never gives). Arbitrage de DjamZ (05/10): a world setting, none by default; "craving" takes
// the craving penalty of p. 79 as the modifier of the test
export function withdrawalModifier(level, setting){
  if (setting !== "craving") return 0
  return WITHDRAWAL_PENALTIES[level] ?? 0
}

// The outcome of a withdrawal test: resisted, or the craving with its penalty and the attributes it weighs on
export function withdrawalOutcome(hits, threshold, level, addictionType){
  if (hits >= threshold) return {
    resisted: true
  }
  const attributes = addictionType === "psychological" ? "mental" : addictionType === "both" ? "both" : "physical"
  return {
    resisted: false, penalty: WITHDRAWAL_PENALTIES[level] ?? 0, attributes
  }
}

// The pools an addiction is tested with: both pools for an addiction both physiological and
// psychological, a failure at either one is enough (SR5 p. 415)
export function addictionPools(type){
  if (type === "physiological" || type === "psychological") return [type]
  if (type === "both") return ["physiological", "psychological"]
  return []
}

// The weeks of use after which an addiction test is due: 11 − Addiction Rating (SR5 p. 415), never below 1
export function addictionWeeks(rating){
  return Math.max(1, 11 - (Number(rating) || 0))
}

// The addiction rating of foci (SR5 p. 416): the total Force of the active foci
export function focusAddictionRating(items){
  return (items || []).filter(i => i?.type === "itemFocus" && i.system?.isActive)
    .reduce((total, i) => total + (Number(i.system.itemRating) || 0), 0)
}

// An addiction to a drug: so marked when the drug is taken, or, for the older entries, named after a drug the
// character carries. Foci, blood magic and the Addiction quality are not drugs (Chrome Flesh p. 58: "drogues
// naturelles et de synthèse")
export function isDrugAddiction(entry, drugNames){
  if (entry?.kind) return entry.kind === "drug"
  return (drugNames || []).includes(entry?.name)
}

// The one addiction to foci (SR5 p. 416, "Focus : Puissance totale de tous les focus actifs"), once a focus is
// activated. Each focus used to get an entry of its own, rated by the total when it was activated: two foci, two
// addictions and two tests (lot 17c). The entries of the older data, named after a focus, are merged into it: the
// furthest level of addiction is kept. `name` is the shared entry's name, `rating` the total Force now active
export function focusAddictionEntries(addictions, focusNames, name, rating){
  const list = [...(addictions || [])]
  const legacy = list.filter(d => d?.kind !== "focus" && (focusNames || []).includes(d?.name))
  let shared = list.find(d => d?.kind === "focus")
  const kept = shared ?? [...legacy].sort((a, b) => addictionLevelIndex(b.level) - addictionLevelIndex(a.level))[0]
  const others = new Set(legacy.filter(d => d !== kept))
  const result = list.filter(d => !others.has(d))
  const weeks = addictionWeeks(rating)
  if (kept) {
    const index = result.indexOf(kept)
    result[index] = {
      ...kept, name, kind: "focus",
      shot: {
        ...(kept.shot ?? {
          base: 1, modifiers: []
        }), value: (Number(kept.shot?.value) || 0) + 1
      },
      addiction: {
        ...(kept.addiction ?? {
        }), type: "psychological", rating, threshold: 2
      },
      weekAddiction: {
        ...(kept.weekAddiction ?? {
          modifiers: []
        }), base: weeks, value: weeks
      },
    }
  } else result.push({
    name, kind: "focus",
    shot: {
      value: 1, base: 1, modifiers: []
    },
    addiction: {
      type: "psychological", rating, threshold: 2
    },
    weekAddiction: {
      value: weeks, base: weeks, modifiers: []
    },
  })
  return result
}

// Index of a level, 0 when there is no addiction yet
export function addictionLevelIndex(level){
  return Math.max(0, ADDICTION_LEVELS.indexOf(level || ""))
}

// A failed test: the quality is gained, or goes up one level. At burnout it can go no higher, a point of
// Body or Willpower is lost instead (SR5 p. 416) : left to the gamemaster
export function worsenAddiction(level){
  let index = addictionLevelIndex(level)
  if (index >= ADDICTION_LEVELS.length - 1) return {
    level: ADDICTION_LEVELS[index], attributeLoss: true
  }
  return {
    level: ADDICTION_LEVELS[index + 1], attributeLoss: false
  }
}

// A failed test worsens the addiction from the level it was rolled at (`rolledLevel`, kept on the card), never
// lower than it stands now. An addiction both physiological and psychological is tested with both pools, and a
// failure at either one is the step of p. 416: the second failure of the same test finds the step taken (`already`)
export function worsenAfterTest(rolledLevel, currentLevel){
  const next = worsenAddiction(rolledLevel ?? currentLevel)
  if (!next.attributeLoss && addictionLevelIndex(currentLevel) >= addictionLevelIndex(next.level)) return {
    level: currentLevel || "", attributeLoss: false, already: true
  }
  return {
    ...next, already: false
  }
}

// The attribute a burnout failure takes a point from: the higher of Body and Willpower; on a tie, Body
// for a physiological addiction, Willpower for a psychological one, the gamemaster's pick for both (SR5 p. 416)
export function burnoutAttribute(body, willpower, type){
  if (body > willpower) return "body"
  if (willpower > body) return "willpower"
  if (type === "physiological") return "body"
  if (type === "psychological") return "willpower"
  return "either"
}
