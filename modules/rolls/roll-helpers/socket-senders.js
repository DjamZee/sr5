/**
 * Who the GM's browser believes on the sockets of marks, grappling, combat and chat buttons. Security
 * lot of Thomas before the djamz.11, on the model of socket-guard.js (Sixtine) and damage-relay.js
 * (Hortense): these handlers used to apply whatever a console sent, without reading the sender.
 *
 * Each one now believes a GM, the owner of what it writes, or a use backed by a card the GM reads
 * again from the chat log (never from the request). Pure rules here; the lookups stay by each handler.
 */

/** The marks a matrix action puts when the attacker wins (SR5 p. 240 and 242): one to three, chosen
 * before the test. Watchdog (Kill Code p. 45) and the IC put a fixed number, whatever the card says. */
export const FIXED_MARKS = {
  watchdog: 1,
  iceFlicker: 1,
  iceProbe: 1,
  iceSleuther: 1,
  iceTarBaby: 1,
  iceBloodhound: 2,
}

/** The actions whose success puts marks on the defender. */
export const MARK_ACTIONS = ["hackOnTheFly", "bruteForce", ...Object.keys(FIXED_MARKS)]

/** The test types of the defense card the mark buttons stand on. */
export const MARK_DEFENSE_TESTS = ["matrixDefense", "iceDefense"]

/** How many marks the attacker's card puts, 1 to 3 (SR5 p. 240: no more than three per icon). */
export function attackerMarks(typeSub, chosen) {
  if (typeSub in FIXED_MARKS) return FIXED_MARKS[typeSub]
  const value = Math.floor(Number(chosen))
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 3) : 1
}

/** The dice taken off to put two or three marks at once (SR5 p. 240): -4, -10. */
export function markPenalty(marks) {
  if (marks >= 3) return -10
  if (marks === 2) return -4
  return 0
}

/**
 * What a pair of cards (the attack, then the defense against it) allows for marks, from hits the GM
 * counted again: the attacker puts its marks when it wins (SR5 p. 240, 242); a failed Sleaze action
 * gives the defender one mark on the attacker (SR5 p. 232). null when neither.
 */
export function markOutcome({
  typeSub, actionType, attackerHits, defenderHits, chosen
}) {
  if (!Number.isFinite(attackerHits) || !Number.isFinite(defenderHits)) return null
  if (attackerHits > defenderHits) {
    if (!MARK_ACTIONS.includes(typeSub)) return null
    return {
      winner: "attacker", marks: attackerMarks(typeSub, chosen), watchdog: typeSub === "watchdog"
    }
  }
  if (actionType === "sleaze") return {
    winner: "defender", marks: 1, watchdog: false
  }
  return null
}

/** Erase Mark (SR5 p. 240): the eraser wins on more hits than the defense; one mark goes, as the
 * system applies it. */
export function eraseWins(eraserHits, defenderHits) {
  return Number.isFinite(eraserHits) && Number.isFinite(defenderHits) && eraserHits > defenderHits
}

/**
 * A grappling request on the GM's browser. `ownsAll` is true when the sender is a GM or owns every
 * fighter the request writes on: then it stands as before. Anyone else needs the card behind it.
 */
export function grappleNeedsCard(ownsAll) {
  return !ownsAll
}

/** The warnings the GM sends back on a grappling request: only from a GM, only grappling ones. */
export function grappleWarnAllowed(senderIsGM, key) {
  return !!senderIsGM && typeof key === "string" && /^SR5\.WARN_Grapple[A-Za-z]*$/.test(key)
}

/**
 * The step of the turn a player asks for (passing their turn): only the owner of the combatant whose
 * turn it is, and only to where the GM computes the next turn himself. The combatants of the request
 * are never written.
 */
export function turnStepAllowed({
  senderIsGM, ownsCurrent, askedTurn, nextTurn, turns
}) {
  if (!senderIsGM && !ownsCurrent) return false
  return Number.isInteger(askedTurn) && askedTurn === nextTurn && nextTurn < turns
}

/** A new initiative pass, or a new round, asked by the owner of the current combatant once the GM
 * finds it due himself. */
export function passAllowed({
  senderIsGM, ownsCurrent, due
}) {
  return (!!senderIsGM || !!ownsCurrent) && !!due
}

/**
 * The initiative of a combatant changed on request: by a GM or its owner (fear, stun, full defense,
 * an interruption action of its own); anyone else only asks the GM to read the sheet again (no
 * change given), which writes nothing the request decides.
 */
export function initChangeAllowed({
  senderIsGM, ownsActor, initChange
}) {
  if (senderIsGM || ownsActor) return true
  return initChange === undefined || initChange === null
}

/**
 * A button of a chat card spent on request. The button must be on the stored card, and the sender one
 * who could have clicked it: a GM; for a GM's button, nobody else; for a test any token answers
 * (opposedTest), any player; otherwise the owner of an actor of the card, or the author of a card
 * that answers it.
 */
export function chatButtonAllowed({
  senderIsGM, button, ownsCardActor, answeredCard
}) {
  if (!button) return false
  if (senderIsGM) return true
  const classes = `${button.testType ?? ""} ${button.gmAction ?? ""}`.split(/\s+/)
  if (classes.includes("chat-button-gm")) return false
  if (ownsCardActor || answeredCard) return true
  return classes.includes("opposedTest")
}
