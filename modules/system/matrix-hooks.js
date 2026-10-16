// S4 (ticket 4 d'Adrore, 16/10): generic hooks of the Matrix for the modules, with no house rule in the system. Without
// a subscriber, nothing changes: three marks at most (SR5 p. 237), the marks an icon really carries.
// - C1 sr5.matrixHostChanged (actor, host, previous, reason): matrix-host-presence.js
// - C2 sr5.matrixMarkCap, a verdict {attacker, target, cap}: the most marks one owner puts on one icon
// - C3 sr5.matrixEffectiveMarks, a verdict {viewer, target, key, marks}: the marks that count for an action
// - C4 sr5.matrixMarksChanged (target, ownerId, value, previous, source): told once marks are put or erased
// - C5 sr5.overwatchChanged (actor, value, previous): told once an Overwatch Score changes
// A verdict hook hands an object the subscriber may change; a value that is not one the system takes is ignored. A
// subscriber that fails is logged and goes no further. Plain rules, no Foundry in them: the tests give `call`.

export const MATRIX_HOOKS = {
  hostChanged: "sr5.matrixHostChanged",
  markCap: "sr5.matrixMarkCap",
  effectiveMarks: "sr5.matrixEffectiveMarks",
  marksChanged: "sr5.matrixMarksChanged",
  overwatchChanged: "sr5.overwatchChanged",
}

// SR5 p. 237
export const BOOK_MARK_CAP = 3

const defaultCall = (hook, ...args) => globalThis.Hooks?.callAll?.(hook, ...args)

function safely(hook, args, call){
  try {
    call(hook, ...args)
  } catch (error) {
    console.error(`SR5 | ${hook}: a subscriber failed, ignored`, error)
  }
}

/**
 * C2: the most marks one owner may have on an icon. 3 by the book; a module may set another whole number, 1 or more.
 * @param {Object} context   {attacker, target}: the actor who marks, the actor marked (either may be null)
 * @return {Number}
 */
export function matrixMarkCap({
  attacker = null, target = null
} = {
}, call = defaultCall){
  const verdict = {
    attacker, target, cap: BOOK_MARK_CAP
  }
  safely(MATRIX_HOOKS.markCap, [verdict], call)
  return Number.isInteger(verdict.cap) && verdict.cap >= 1 ? verdict.cap : BOOK_MARK_CAP
}

/**
 * C3: the marks that count for an action, from the marks really carried. A module may raise or lower them (0 or more).
 * @param {Object} context   {viewer, target, key, marks}: who acts, on what (an actor or a node of the crown), the
 *                           action's key, the marks it really has
 * @return {Number}
 */
export function matrixEffectiveMarks({
  viewer = null, target = null, key = null, marks = 0
} = {
}, call = defaultCall){
  const real = Number(marks) || 0
  const verdict = {
    viewer, target, key, marks: real
  }
  safely(MATRIX_HOOKS.effectiveMarks, [verdict], call)
  return Number.isFinite(verdict.marks) && verdict.marks >= 0 ? verdict.marks : real
}

/** C4: tell the modules that an owner's marks on an icon went from previous to value (0: erased) */
export function announceMarksChanged(target, ownerId, value, previous, source = null, call = defaultCall){
  if ((Number(value) || 0) === (Number(previous) || 0)) return
  safely(MATRIX_HOOKS.marksChanged, [target, ownerId, Number(value) || 0, Number(previous) || 0, source], call)
}

/** C5: tell the modules that an Overwatch Score went from previous to value */
export function announceOverwatchChanged(actor, value, previous, call = defaultCall){
  if ((Number(value) || 0) === (Number(previous) || 0)) return
  safely(MATRIX_HOOKS.overwatchChanged, [actor, Number(value) || 0, Number(previous) || 0], call)
}

/** The Overwatch Score a change sets, or undefined when it sets none (flat or nested changes) */
export function overwatchInChanges(changes){
  if (!changes) return undefined
  if (Object.hasOwn(changes, "system.matrix.overwatchScore")) return changes["system.matrix.overwatchScore"]
  return changes.system?.matrix?.overwatchScore
}

/** C5 for every way the score changes (a hack, a reboot, the sheet, a module): told once, on the browser that wrote it */
export function registerOverwatchHook() {
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (overwatchInChanges(changes) === undefined) return
    options.sr5OverwatchPrevious = Number(actor.system?.matrix?.overwatchScore) || 0
  })
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user?.id || options?.sr5OverwatchPrevious === undefined) return
    announceOverwatchChanged(actor, actor.system?.matrix?.overwatchScore, options.sr5OverwatchPrevious)
  })
}
