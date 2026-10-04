//Grappling rules, kept free of Foundry so that they can be tested.
//The whole grappling system is a world setting (sr5GrapplingRules), off by default.

//SR5 p. 195 (Maîtriser) : the attack hits, and Strength + net hits exceed the defender's Physical limit.
export function subdueTakesHold(netHits, strength, physicalLimit){
  if (!(netHits > 0)) return false
  return (strength + netHits) > physicalLimit
}

//The grappling data an actor carries, read from the flag of its grappling effect.
//Returns { role: "holder" | "held", kind: "subdue", partner, hold } or null.
export function grappleHoldOf(effects){
  for (const effect of effects ?? []){
    const data = effect?.flags?.sr5?.grapple
    if (data?.role) return data
  }
  return null
}

//SR5 p. 195 and Run & Gun p. 135 : the escape threshold is the net hits of the hold.
//Only the held fighter has one ; null when the actor is not held.
export function grappleEscapeThreshold(effects){
  const data = grappleHoldOf(effects)
  if (data?.role !== "held") return null
  return Math.max(data.hold ?? 0, 0)
}

//The book is silent on several fighters holding the same target : one hold per token,
//a ruling of DjamZ (2026-10-04) that fills that silence.
export function canStartHold(holderEffects, heldEffects){
  return !grappleHoldOf(holderEffects) && !grappleHoldOf(heldEffects)
}

//The status shown on each fighter's token, by kind of hold and role.
export const GRAPPLE_STATUSES = {
  subdue: {
    holder: "subduing", held: "subdued"
  },
}
