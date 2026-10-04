// Brick of milk (No Future p. 154): a complex action that removes the Nausea of CS / tear gas or Pepper
// Punch, and the Disorientation of CS / tear gas only. The stun damage already taken stays.

// The toxins each effect is soothed for, by the key of the book toxin (SR5.toxinTypes)
export const MILK_BRICK_SOOTHES = {
  toxinEffectNausea: ["csTearGas", "pepperPunch"],
  toxinEffectDisorientation: ["csTearGas"],
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

// Removes the soothed toxin effects of an actor, with their status icons; returns the ids of the
// removed effects
export async function soothe(actor){
  if (!actor) return []
  let items = actor.items.filter(i => i.type === "itemEffect" && milkBrickRemoves(i.system.type, i.getFlag?.("sr5", "toxinType")))
  let removed = new Set(items.map(i => i.system.type))
  // A status is only taken off when no remaining effect still puts it there
  let kept = actor.items.filter(i => i.type === "itemEffect" && removed.has(i.system.type) && !items.includes(i)).map(i => i.system.type)
  let statuses = actor.effects.filter(e => removed.has(e.origin) && !kept.includes(e.origin)).map(e => e.id)
  if (!items.length) {
    ui.notifications.info(game.i18n.format("SR5.MilkBrickNothing", {
      name: actor.name
    }))
    return []
  }
  if (!actor.isOwner) {
    ui.notifications.warn(game.i18n.localize("SR5.WARN_MilkBrickNotOwner"))
    return []
  }
  let ids = items.map(i => i.id)
  await actor.deleteEmbeddedDocuments("Item", ids)
  if (statuses.length) await actor.deleteEmbeddedDocuments("ActiveEffect", statuses)
  ui.notifications.info(game.i18n.format("SR5.MilkBrickUsed", {
    name: actor.name
  }))
  return ids
}
