// Deus vult ! and Mon pays, qu'il ait tort ou raison (Manuel de l'assassin p. 14-15), the pure rules:
// « Faites un test de Volonté au début de sa phase d'action s'il a subi une blessure depuis sa précédente phase
// d'action […]. Son seuil est égal au nombre de cases de dommages encaissées pendant ce temps. En cas de réussite
// l'assassin ignore tous les modificateurs de blessure et continue d'effectuer un test avant chaque phase d'action.
// Son seuil augmente avec chaque nouvelle case de dommages. […] S'il échoue à l'un de ces tests, tous les
// modificateurs de blessure sont immédiatement appliqués et cet avantage ne peut plus être utilisé avant le combat
// suivant. »
// A ledger entry, by actor uuid: { combatId, boxes (seen at its last phase), threshold (the boxes counted since the
// first test), holding (the last test succeeded), broken (a test failed in this combat), card (the test awaited) }

/** The value a quality carries in its system effects (category "specialCase"). */
export const WOUND_RESOLVE_EFFECT = "woundResolve"

/** The boxes of damage an actor carries: Physical and Stun, or the single monitor of a grunt. */
export function woundBoxes(system){
  const monitors = system?.conditionMonitors ?? {
  }
  return ["physical", "stun", "condition"].reduce((sum, key) => sum + (Number(monitors[key]?.actual?.value) || 0), 0)
}

/** Whether one of the items is an active quality with the effect. */
export function hasWoundResolve(items){
  for (const item of items ?? []){
    if (item?.system?.isActive === false) continue
    const effects = item?.system?.systemEffects
    const list = Array.isArray(effects) ? effects : Object.values(effects ?? {
    })
    if (list.some(e => e?.value === WOUND_RESOLVE_EFFECT)) return true
  }
  return false
}

const fresh = (combatId, boxes) => ({
  combatId, boxes, threshold: 0, holding: false, broken: false, card: null
})

/**
 * The boxes each fighter has when the combat starts (or when it first shows in it): only the wounds taken in the
 * combat call for a test. `fighters`: [{uuid, boxes}]
 */
export function ledgerWithFighters(ledger, fighters, combatId){
  let changed = false
  const next = {
    ...ledger
  }
  for (const {
    uuid, boxes
  } of fighters){
    if (next[uuid]?.combatId === combatId) continue
    next[uuid] = fresh(combatId, boxes)
    changed = true
  }
  return changed ? next : null
}

/**
 * The start of the fighter's action phase. `threshold` is that of the test to make, null when there is none: no
 * wound since its last phase and no test holding, or the advantage lost for this combat.
 * @returns {{entry: object, threshold: number|null}}
 */
export function atPhaseStart(entry, boxes, combatId){
  if (!entry || entry.combatId !== combatId) return {
    entry: fresh(combatId, boxes), threshold: null
  }
  const taken = Math.max(0, boxes - (Number(entry.boxes) || 0))
  if (entry.broken || (!taken && !entry.holding)) return {
    entry: {
      ...entry, boxes
    }, threshold: null
  }
  // « Son seuil augmente avec chaque nouvelle case de dommages » : 2 boxes, then 2 more before the next phase, 4
  const threshold = (Number(entry.threshold) || 0) + taken
  return {
    entry: {
      ...entry, boxes, threshold
    }, threshold
  }
}

/** The test made: held, or lost until the next combat. */
export function afterTest(entry, success){
  return success ? {
    ...entry, holding: true, card: null
  } : {
    ...entry, holding: false, broken: true, card: null
  }
}

/** Whether the wound modifiers are ignored. */
export function ignoresWounds(entry){
  return !!entry?.holding && !entry.broken
}

/** The ledger without the entries of a combat that ended. */
export function ledgerWithoutCombat(ledger, combatId){
  const next = Object.fromEntries(Object.entries(ledger ?? {
  }).filter(([, e]) => e?.combatId !== combatId))
  return Object.keys(next).length === Object.keys(ledger ?? {
  }).length ? null : next
}
