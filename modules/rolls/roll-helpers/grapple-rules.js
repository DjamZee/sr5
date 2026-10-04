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

//SR5 p. 196 (renforcer sa prise): the attacker's net hits add to the hold; when the defender gets more
//hits, the hold weakens by as many. The book is silent below 0 : the hold stops at 0 and only an
//escape frees the defender, a ruling of DjamZ (2026-10-04) that fills that silence.
export function strengthenedHold(hold, netHits){
  return Math.max((hold ?? 0) + netHits, 0)
}

//The actor holds this target (its partner in the hold)
export function holdsTarget(effects, targetId){
  const data = grappleHoldOf(effects)
  return !!targetId && data?.role === "holder" && data.partner === targetId
}

//SR5 p. 195 : a subdued character counts as prone for any attack against them
export function isSubdued(effects){
  const data = grappleHoldOf(effects)
  return data?.role === "held" && data.kind === "subdue"
}

//The kind of hold the actor has on this target ("subdue", "clinch"), or null
export function holdKindOn(effects, targetId){
  return holdsTarget(effects, targetId) ? grappleHoldOf(effects).kind : null
}

//The grappling entries of the attack list. Subduing is a rule of the core book (SR5 p. 195) and the
//holder's options come with it : offered with the grappling rules, whether or not the called shot rules are.
//Run & Gun p. 134 : a clinch opens the way to subduing. Projecting the held fighter to the ground stays
//the knockdown called shot (SR5 p. 196). Run & Gun p. 126 : the fighter held by the target may reverse the
//situation, a melee attack that asks for the martial arts technique, as the called shot already does.
export function grapplingCalledShots({
  unarmed, holdKind, heldByTarget = false, canReverse = false, melee = unarmed
}){
  const keys = []
  //The one held by the target cannot take a second hold on them (one hold per token): reversing is their way
  if (unarmed && !heldByTarget) keys.push(holdKind === "subdue" ? "strengthenHold" : "subdue")
  if (melee && heldByTarget && canReverse) keys.push("reversal")
  return keys
}

//The actor is held by this target
export function isHeldBy(effects, targetId){
  const data = grappleHoldOf(effects)
  return !!targetId && data?.role === "held" && data.partner === targetId
}

//Run & Gun p. 126 : after a reversal the roles are swapped, and Run & Gun p. 148-149 (Contre-prise) lets a successful
//escape count as one. The book does not say what the new hold is worth. The one place to change it: the net hits of
//the test (the reversal, or the escape above its threshold), as every other hold (SR5 p. 195, Run & Gun p. 133), at
//least 1. A ruling of DjamZ (2026-10-04, Q7 and Q8) that fills that silence.
export function holdAfterReversal(netHits){
  return Math.max(netHits, 1)
}

//Contre-prise: the hits above the threshold of the stored hold, not the threshold typed in the dialog, which the
//roller may change (review of lot 4)
export function counterGrappleHold(hits, storedHold){
  return holdAfterReversal(hits - Math.max(storedHold ?? 0, 0))
}

//Run & Gun p. 126: the roles after a reversal, in a hold of the same kind; null when the reverser is not held
export function reversalRoles(data, reverserId){
  if (data?.role !== "held") return null
  return {
    holderId: reverserId, heldId: data.partner, kind: data.kind
  }
}

//Run & Gun p. 133 (Saisie) : Agility + Gymnastics [Physical] against Reaction + Intuition, the hold is the net hits
export function clinchTakesHold(netHits){
  return netHits > 0
}

//The clinch this actor is in, whatever its role, or null
export function clinchOf(effects){
  const data = grappleHoldOf(effects)
  return data?.kind === "clinch" ? data : null
}

//Run & Gun p. 133 : the firearms of the clinch penalty. Every ranged weapon that fires counts, tasers included
//(SR5 p. 135 and 427 rank them among firearms), heavy weapons too. Bows, crossbows and throwing weapons do not,
//nor exoticRangedWeapon, which mostly covers exotic bows and crossbows. Ruling of Juniper's review (2026-10-04).
const CLINCH_NON_FIREARM_TYPES = ["bow", "lightCrossbow", "mediumCrossbow", "heavyCrossbow", "throwing", "exoticRangedWeapon"]
export function isClinchFirearm(rangedWeaponType){
  return !!rangedWeaponType && !CLINCH_NON_FIREARM_TYPES.includes(rangedWeaponType)
}

//Run & Gun p. 133 : in a clinch, melee weapons take a penalty equal to their Reach, firearms one equal to the
//net hits of the clinch. A reading of Run & Gun p. 133-134: for both fighters, whatever their target.
export function clinchAttackPenalty(effects, {
  category, reach, isFirearm
}){
  const clinch = clinchOf(effects)
  if (!clinch) return 0
  if (category === "meleeWeapon") return -Math.max(reach ?? 0, 0)
  if (category === "rangedWeapon" && isFirearm) return -Math.max(clinch.hold ?? 0, 0)
  return 0
}

//Run & Gun p. 133 : the Reach of both fighters is cancelled between them
export function clinchCancelsReach(effects, otherId){
  const clinch = clinchOf(effects)
  return !!clinch && !!otherId && clinch.partner === otherId
}

//SR5 p. 196 : Strength as the Damage Value, Stun, resisted normally with armor, without any test
export function crushDamage(strength){
  return {
    value: strength, type: "stun"
  }
}

//The status shown on each fighter's token, by kind of hold and role.
export const GRAPPLE_STATUSES = {
  subdue: {
    holder: "subduing", held: "subdued"
  },
  clinch: {
    holder: "clinching", held: "clinched"
  },
}

//Run & Gun p. 134 : the clincher may go on to subdue the one they clinch, which replaces the clinch.
//Any other second hold is refused (one hold per token, ruling of DjamZ).
export function holdReplacesClinch(holderEffects, heldId, kind){
  return kind === "subdue" && holdKindOn(holderEffects, heldId) === "clinch"
}

//Delete the grappling effect of an actor once. Deleting one half makes the deleteActiveEffect hook delete the
//other while a loop may reach it too : an effect already gone, or already being deleted, is left alone.
//With a holdId, only the half of that very hold is deleted: a new hold taken meanwhile is left alone.
//Returns true when this call deleted it.
export async function deleteGrappleEffectOnce(actor, pending, holdId = null){
  const effect = actor?.effects?.find(e => e.flags?.sr5?.grapple && (!holdId || e.flags.sr5.grapple.holdId === holdId))
  if (!effect) return false
  const key = effect.uuid ?? effect.id
  if (pending.has(key)) return false
  pending.add(key)
  try {
    await effect.delete()
    return true
  } finally {
    pending.delete(key)
  }
}

//The grappling hooks run on one client only : the active GM chosen by the core, not every GM connected
export function isGrappleKeeper(users){
  return users?.activeGM?.isSelf === true
}

//A linked actor may have tokens on several scenes : removing one of them ends the hold only when none is left
export function tokenRemovalEndsHold(actorLink, remainingTokens){
  return !actorLink || remainingTokens === 0
}

//A hold refused on the GM's client is told to the user who asked for it through the socket, not to the GM
export function refusalRecipient(fromUserId, selfId){
  return fromUserId && fromUserId !== selfId ? fromUserId : null
}

//The buttons of a hold card (Crush, Let go) belong to the one who holds: the GM or the holder's owner
export function canUseHoldCard(isGM, isHolderOwner){
  return !!(isGM || isHolderOwner)
}

//A button left on an older card must not touch a newer hold. Returns the warning to give, or null when the hold
//it was rolled against is still the one in progress.
export function staleHoldWarning(currentHold, cardHoldId){
  if (!currentHold) return "SR5.WARN_GrappleNoHold"
  if (cardHoldId && currentHold.holdId !== cardHoldId) return "SR5.WARN_GrappleHoldChanged"
  return null
}

//An unlinked token rolled from its base actor's sheet: the hold goes on the token's own actor. The token is the
//controlled one of that actor, or its only token on the scene; null when it cannot be told (the base actor stays).
export function tokenForBaseActor({
  isToken, actorLink, tokenIds = [], controlledIds = []
}){
  if (isToken || actorLink) return null
  const controlled = tokenIds.filter(id => controlledIds.includes(id))
  if (controlled.length === 1) return controlled[0]
  return tokenIds.length === 1 ? tokenIds[0] : null
}
