// Brick of milk (No Future p. 154): a complex action that removes the Nausea of CS / tear gas or Pepper
// Punch, and the Disorientation of CS / tear gas only. The stun damage already taken stays.

// The toxins each effect is soothed for, by the key of the book toxin (SR5.toxinTypes)
export const MILK_BRICK_SOOTHES = {
  toxinEffectNausea: ["csTearGas", "pepperPunch"],
  toxinEffectDisorientation: ["csTearGas"],
}

// Labels of what a brick can take off, for the message
export const MILK_BRICK_LABELS = {
  toxinEffectNausea: "SR5.ToxinEffectNausea",
  toxinEffectDisorientation: "SR5.ToxinEffectDisorientation",
  noAction: "SR5.EffectNoAction",
}

// Whether an item is a brick of milk: its system effect "Specific item: brick of milk"
export function isMilkBrick(item){
  return Object.values(item?.system?.systemEffects ?? {
  }).some(e => e?.value === "milkBrick")
}

// Whether the brick removes this toxin effect. The toxin it came from is kept on the effect since this
// change; an older effect, or one from a custom toxin, has no known origin and is removed (the
// gamemaster's call, made once for all)
export function milkBrickRemoves(effectType, toxinType){
  let soothed = MILK_BRICK_SOOTHES[effectType]
  if (!soothed) return false
  if (!toxinType || toxinType === "custom") return true
  return soothed.includes(toxinType)
}

// What the brick takes off an actor, from its effect items ({id, type, toxinType}) and its statuses
// ({id, origin}). A status only goes when no remaining effect still puts it there. The "No action"
// a heavy Nausea puts (damage over Willpower) goes with the Nausea, unless a Paralysis, which puts it
// too, is still there.
export function milkBrickPlan(effects, statuses){
  let items = effects.filter(e => milkBrickRemoves(e.type, e.toxinType))
  let removedTypes = new Set(items.map(e => e.type))
  let keptTypes = new Set(effects.filter(e => !items.includes(e)).map(e => e.type))
  let goneTypes = [...removedTypes].filter(t => !keptTypes.has(t))
  if (goneTypes.includes("toxinEffectNausea") && !keptTypes.has("toxinEffectParalysis")) goneTypes.push("noAction")
  let statusIds = statuses.filter(s => goneTypes.includes(s.origin)).map(s => s.id)
  let removed = [...removedTypes]
  if (goneTypes.includes("noAction") && statuses.some(s => s.origin === "noAction")) removed.push("noAction")
  return {
    itemIds: items.map(e => e.id), statusIds, removed
  }
}

// Uses a brick on an actor. Returns { used, itemIds }: not used when the actor is not the user's
// (nothing is spent), used even when there was nothing to take off (the milk is drunk all the same)
export async function soothe(actor){
  if (!actor) return {
    used: false, itemIds: []
  }
  if (!actor.isOwner) {
    ui.notifications.warn(game.i18n.format("SR5.WARN_MilkBrickNotOwner", {
      name: actor.name
    }))
    return {
      used: false, itemIds: []
    }
  }
  let plan = milkBrickPlan(
    actor.items.filter(i => i.type === "itemEffect").map(i => ({
      id: i.id, type: i.system.type, toxinType: i.getFlag?.("sr5", "toxinType")
    })),
    actor.effects.map(e => ({
      id: e.id, origin: e.origin
    })))
  if (!plan.itemIds.length) {
    ui.notifications.info(game.i18n.format("SR5.MilkBrickNothing", {
      name: actor.name
    }))
    return {
      used: true, itemIds: []
    }
  }
  await actor.deleteEmbeddedDocuments("Item", plan.itemIds)
  if (plan.statusIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", plan.statusIds)
  ui.notifications.info(game.i18n.format("SR5.MilkBrickUsed", {
    name: actor.name, removed: plan.removed.map(t => game.i18n.localize(MILK_BRICK_LABELS[t])).join(", ")
  }))
  return {
    used: true, itemIds: plan.itemIds
  }
}
