// The wound modifiers of each roll of an extended test (SR5 p. 50 and p. 171). The rolls of an extended test are
// made over hours or days: a character wounded, or healed, between two rolls rolls with the modifiers he has then,
// not with those of the first roll. Pure rules, without Foundry: roll-test.js (extendedRoll) gives the actor's values.

// The modifier types the actor writes on its tests (utilityActor.js, applyPenalty)
export const WOUND_TYPES = ["penaltycondition", "penaltymatrix", "penaltymagic", "penaltyspecial"]
// The box of the roll dialog that adds them all at once (roll-dialog.js)
export const WOUND_BOX = "penalty"

const KEY = type => type.replace("penalty", "")

/**
 * The dice pool modifiers of the next roll, their wound modifiers read again.
 * @param {Array<{type, label, value}>} modifiers the modifiers of the previous roll
 * @param {object} penalties the actor's system.penalties now ({condition: {actual: {value}}, ...})
 * @param {object} options
 * @param {Array|null} options.sheetModifiers the modifiers the sheet gives this test now (a skill's test.modifiers),
 *   null when the test has none: then only the wound types the first roll had are read again
 * @returns {Array} a new list
 */
export function refreshWoundModifiers(modifiers = [], penalties = {
}, {
  sheetModifiers = null, labels = {
  }
} = {
}){
  const current = type => Number(penalties?.[KEY(type)]?.actual?.value) || 0
  const had = modifiers.filter(m => WOUND_TYPES.includes(m.type))
  let wounds
  if (Array.isArray(sheetModifiers)) wounds = sheetModifiers.filter(m => WOUND_TYPES.includes(m.type)).map(m => ({
    type: m.type, label: m.source ?? m.label ?? labels[m.type] ?? m.type, value: Number(m.value) || 0
  }))
  else wounds = had.map(m => ({
    ...m, value: current(m.type)
  }))
  const out = modifiers.filter(m => !WOUND_TYPES.includes(m.type)).map(m => {
    if (m.type !== WOUND_BOX) return m
    return {
      ...m, value: ["condition", "matrix", "magic", "special"].reduce((t, k) => t + (Number(penalties?.[k]?.actual?.value) || 0), 0)
    }
  })
  return out.concat(wounds.filter(m => m.value !== 0))
}
