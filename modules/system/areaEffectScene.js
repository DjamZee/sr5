//The one rule for "an area effect counts on this scene", shared by the prepared data (SR5_EffectArea) and the
//roll-time environment rows (SR5_CombatHelpers). It has no import so that both can load it.

//The scene of the template that put an area effect on an actor, read from its owner
//(Scene.<id>.MeasuredTemplate.<id>), or null when the effect comes from no template on a scene
export function templateSceneId(item){
  return /^Scene\.([^.]+)\.MeasuredTemplate\./.exec(item?.system?.ownerItem ?? "")?.[1] ?? null
}

//An area effect whose template stands on another scene than sceneId. A linked actor is the same on every
//scene, so the template of one scene must not count on another. An effect with no template scene (left by a
//template preview before b685ff03) counts nowhere a scene is known.
export function isAreaEffectOffScene(item, sceneId){
  if (item?.type !== "itemEffect" || item.system?.type !== "areaEffect" || !sceneId) return false
  return templateSceneId(item) !== sceneId
}

//An area effect from no template on a scene that sets an environment row (light, visibility...). The roll
//counts it nowhere, so the prepared data leaves it out and the sheet does not show it either
export function isOrphanEnvironmentEffect(item){
  if (item?.type !== "itemEffect" || item.system?.type !== "areaEffect" || templateSceneId(item)) return false
  return Object.values(item.system.customEffects ?? {
  }).some(e => /^system\.itemsProperties\.environmentalMod\./.test(e?.target ?? ""))
}
