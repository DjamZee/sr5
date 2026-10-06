/**
 * Legacy biography keys.
 *
 * Up to v12 every actor sheet wrote the metatype into
 * `system.biography.characterMetatype` (and the PC sheet wrote the metatype
 * variant into `system.biography.characterMetatypeVariant`), even though the
 * actorPc template declared `metatype` / `metatypeVariant`. The v13 templates
 * were aligned on the short names but the data models and the rules code were
 * not, so the metatype chosen on a sheet no longer reached the rules engine.
 *
 * The canonical keys are now `metatype` and `metatypeVariant` for every actor
 * type. These helpers upgrade documents still carrying the legacy keys.
 */
export const LEGACY_BIOGRAPHY_KEYS = {
  characterMetatype: 'metatype',
  characterMetatypeVariant: 'metatypeVariant',
  // The v12 PC sheet wrote the whole biography under these names (archetypes of the Megapack still carry them):
  // the gender of an imported archetype stayed empty (Albertine)
  characterName: 'name',
  characterAlias: 'alias',
  characterEthnicalGroup: 'ethnicalGroup',
  characterGender: 'gender',
  characterNationality: 'nationality',
  characterBirthPlace: 'birthPlace',
  characterAge: 'age',
  characterFamilySituation: 'familySituation',
  characterDependants: 'dependants',
  characterHeight: 'height',
  characterWeight: 'weight',
  characterEyes: 'eyes',
  characterHair: 'hair',
  characterSkin: 'skin',
}

/**
 * Normalize legacy biography keys in a data model source object, in place.
 * Called from `DataModel.migrateData`, so it also covers documents that never
 * go through the world migration: compendium entries, imported actors and
 * unlinked token overrides.
 * @param {object} source  The raw system data of an actor.
 * @return {object}        The same source object.
 */
export function migrateLegacyBiographyKeys(source) {
  const biography = source?.biography
  if (!biography || typeof biography !== 'object') return source

  for (const [legacyKey, currentKey] of Object.entries(LEGACY_BIOGRAPHY_KEYS)) {
    const legacyValue = biography[legacyKey]
    if (!legacyValue) continue
    if (!biography[currentKey]) biography[currentKey] = legacyValue
    delete biography[legacyKey]
  }

  return source
}
