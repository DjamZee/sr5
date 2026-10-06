/**
 * Links from a sustained spell (or complex form, power, adept power, martial art)
 * to the effects it put on its targets.
 *
 * `system.targetOfEffect` was declared as a list of objects while
 * `SR5_ActorHelper.linkEffectToSource` pushes effect uuids, which are strings:
 * Foundry cast each uuid to `{}` on save. Every stored link is therefore an empty
 * object, and `fromUuid({})` threw "uuid.startsWith is not a function" when the
 * spell was dispelled, reduced or ended.
 *
 * The uuid is not recoverable from `{}`: the empty entries are dropped. The
 * effects already on targets keep their `system.ownerItem`, so the GM can still
 * find and remove them by hand.
 *
 * Called from `Item.migrateData`, so it covers every item wherever it is.
 * @param {object} source  The raw system data of an item.
 * @return {object}        The same source object.
 */
export function migrateTargetOfEffect(source) {
  const links = source?.targetOfEffect
  if (links === undefined || links === null) return source
  const list = Array.isArray(links) ? links : (typeof links === "object" ? Object.values(links) : [links])
  source.targetOfEffect = list.filter(uuid => (typeof uuid === "string") && uuid.length)
  return source
}
