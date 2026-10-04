// Addiction tests (SR5 p. 415-416). The test stands alone: a button on the sheet, or any caller (a
// future calendar of drug intakes) runs actor.rollTest("addictionTest", "<pool>_<index>"). Nothing here
// keeps track of the weeks.

// Levels of the Addiction negative quality (SR5 p. 79-80), from none to burnout
export const ADDICTION_LEVELS = ["", "mild", "moderate", "severe", "burnout"]

// The pools an addiction is tested with: both pools for an addiction both physiological and
// psychological, a failure at either one is enough (SR5 p. 415)
export function addictionPools(type){
  if (type === "physiological" || type === "psychological") return [type]
  if (type === "both") return ["physiological", "psychological"]
  return []
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

// The attribute a burnout failure takes a point from: the higher of Body and Willpower; on a tie, Body
// for a physiological addiction, Willpower for a psychological one, the gamemaster's pick for both (SR5 p. 416)
export function burnoutAttribute(body, willpower, type){
  if (body > willpower) return "body"
  if (willpower > body) return "willpower"
  if (type === "physiological") return "body"
  if (type === "psychological") return "willpower"
  return "either"
}
