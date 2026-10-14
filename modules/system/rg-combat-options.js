/**
 * The optional combat rules of Run & Gun (RG p. 121-125, "Règles optionnelles pour rendre le combat plus ou moins
 * mortel"), RG1 to RG6. "Par défaut, aucune option n'est utilisée" (RG p. 121): one world setting each, unchecked,
 * read at the roll (lot 10). The book's names are kept, so that a gamemaster can say "we play RG1 and RG4".
 *
 * - RG1 lifts the one attack per Action Phase (RG p. 122). The system never counted it (DjamZ, 03/10: « laisse ça,
 *   restons souple »): the box only writes the table's choice down.
 * - RG2 target size (RG p. 122): a modifier to the attack, from the target's size.
 * - RG3 movement speed (RG p. 122-123): ranged attacks against a mover, and the mover's own defense.
 * - RG4 alternative initiative (RG p. 123): the highest score acts, then loses 10 at once (srcombat.js).
 * - RG5 armor as a penalty (RG p. 124-125): the armor, after AP, comes off the attack, never into the resistance.
 * - RG6 defenseless targets (RG p. 125): every 2 dice of penalty past 0 on the defense add 1 to the DV.
 */

export const RG_SETTINGS = {
  noAttackLimit: "sr5RGNoAttackLimit",
  targetSize: "sr5RGTargetSize",
  movement: "sr5RGMovementModifiers",
  initiative: "sr5RGAlternativeInitiative",
  armorPenalty: "sr5RGArmorAsPenalty",
  defenseless: "sr5RGDefenselessDamage",
}

// The setting of an option, false when it cannot be read (tests, a world not ready)
export function rgOption(key){
  try {
    return globalThis.game?.settings?.get?.("sr5", RG_SETTINGS[key]) === true
  } catch (_err) {
    return false
  }
}

// Read at the roll or at the next turn: no reload
export function registerRGCombatSettings(){
  for (const [key, setting] of Object.entries(RG_SETTINGS)) {
    const suffix = setting.slice(3)
    game.settings.register("sr5", setting, {
      name: `SR5.SETTINGS_${suffix}_T`,
      hint: `SR5.SETTINGS_${suffix}_D`,
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
      onChange: key === "initiative" ? () => ui.combat?.render?.() : undefined,
    })
  }
}

/* -------------------------------------------- */
/* RG2: target size (RG p. 122, table "Modificateurs de taille de cible")
/* -------------------------------------------- */

// Drone and vehicle categories (config.js) → the table's size: micro -3, mini -2, small -1, medium 0,
// large drones and vehicles +1. Huge drones are read as vehicles (+1): the table names none bigger but an airliner engine
export const DRONE_SIZE_MODIFIERS = {
  microdrone: -3, minidrone: -2, smallDrone: -1, mediumDrone: 0, largeDrone: 1, hugeDrone: 1,
}

/**
 * The size of a metahuman or a critter, by Strength + Body: 2-4 small (-1), 5-10 medium (0), 11-15 large (+1),
 * above 15 huge (+2). The table says "supérieure à 16" for huge and leaves 16 out: read as huge.
 */
export function sizeFromStrengthBody(total){
  const value = Number(total)
  if (!Number.isFinite(value)) return 0
  if (value <= 4) return -1
  if (value <= 10) return 0
  if (value <= 15) return 1
  return 2
}

/**
 * The category of a deployed drone: the drone actor does not copy it, its rigger's itemVehicle holds it
 * (entityActor-helpers.js, creatorId / creatorItemId). A drone the gamemaster made himself has none.
 */
export function droneCategoryOf(actor){
  const creator = globalThis.game?.actors?.get?.(actor?.system?.creatorId)
  return creator?.items?.get?.(actor?.system?.creatorItemId)?.system?.category ?? null
}

/**
 * The attack modifier for the size of a target actor, 0 when nothing says it.
 * A vehicle (actorDrone of type "vehicle") is +1; a drone by its category; a body by Strength + Body.
 * @param category the drone's category (droneCategoryOf), read by the caller
 */
export function targetSizeModifier(actor, category = null){
  const system = actor?.system
  if (!system) return 0
  if (actor.type === "actorDrone") {
    if (system.type === "vehicle") return 1
    return DRONE_SIZE_MODIFIERS[category] ?? 0
  }
  const strength = system.attributes?.strength?.augmented?.value
  const body = system.attributes?.body?.augmented?.value
  if (!Number.isFinite(Number(strength)) || !Number.isFinite(Number(body))) return 0
  return sizeFromStrengthBody(Number(strength) + Number(body))
}

/* -------------------------------------------- */
/* RG3: movement speed (RG p. 122, table "Modificateurs liés à la vitesse")
/* -------------------------------------------- */

// [up to meters, attack modifier at range, defense modifier]
export const MOVEMENT_MODIFIERS = [
  [6, 0, 0],
  [12, -1, 0],
  [20, -2, -1],
  [30, -3, -2],
  [45, -4, -3],
  [70, -5, -4],
  [Infinity, -6, -5],
]

/**
 * The two modifiers of a distance moved in the Action Phase. The table's rows are whole meters ("0-6", "7-12"…):
 * a distance between two rows (6.5 m) belongs to the higher one.
 */
export function movementModifiers(meters){
  const value = Math.max(Number(meters) || 0, 0)
  const row = MOVEMENT_MODIFIERS.find(([upTo]) => value <= upTo)
  return {
    attack: row[1], defense: row[2]
  }
}

/**
 * The meters a token moved in its last Action Phase of this Combat Turn (running.js keeps them, `phase`).
 * Another combat or round: none.
 */
export function phaseMeters(flag, combatId, round){
  if (!flag || flag.combatId !== combatId || flag.round !== round) return 0
  return Number(flag.phase?.meters) || 0
}

/**
 * The phase meters after a move: added to the phase's own when the token moves again in the same pass, started
 * again in a new pass (its next Action Phase).
 */
export function nextPhase(previous, pass, meters){
  const same = previous && previous.pass === pass
  return {
    pass, meters: (same ? Number(previous.meters) || 0 : 0) + (Number(meters) || 0)
  }
}

/* -------------------------------------------- */
/* RG5: armor as a penalty (RG p. 124-125)
/* -------------------------------------------- */

/**
 * The attack penalty: the target's armor modified by the AP ("la PA est appliquée avant l'attaque"), never below 0
 * and never a bonus.
 * @param armor the target's armor value
 * @param armorPenetration the weapon's AP (negative)
 */
export function armorPenalty(armor, armorPenetration){
  const value = (Number(armor) || 0) + (Number(armorPenetration) || 0)
  return value > 0 ? -value : 0
}

/* -------------------------------------------- */
/* RG6: defenseless targets (RG p. 125)
/* -------------------------------------------- */

/**
 * The DV added when the defense pool fell below 0: one per full 2 dice past it.
 * @param poolBeforeFloor the defense pool, modifiers counted, before it is raised to 0
 */
export function defenselessDamageBonus(poolBeforeFloor){
  const missing = -(Number(poolBeforeFloor) || 0)
  return missing >= 2 ? Math.floor(missing / 2) : 0
}

/* -------------------------------------------- */
/* RG4: alternative initiative (RG p. 123)
/* -------------------------------------------- */

/**
 * The combatant who acted loses 10 at once (never below 0) and, still above 0, gets a new Action Phase; the next to act
 * is the highest score left above 0. Pure: given the turns in their order once re-sorted, the index of the next one,
 * or -1 when every score is down to 0 and the Combat Turn ends ("une fois que le score d'initiative de tous les
 * protagonistes est réduit à 0 ou moins").
 * @param turns [{initiative, hasPlayed, defeated}] in the combat's order
 * @param skipDefeated the tracker's own setting
 */
export function nextAlternativeTurn(turns, skipDefeated = false){
  return turns.findIndex(t => Number(t.initiative) > 0 && !t.hasPlayed && !(skipDefeated && t.defeated))
}
