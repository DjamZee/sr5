import {
  SR5ConRegistry
} from "../interface/con-registry.js"
import {
  openRolledSteps, rolledStepOutcome, conOpposition, CON_ROLLED_STEPS
} from "./con-rules.js"

// The steps of a con rolled with Con (Cutting Aces p. 163-164), between the cards and the gamemaster's registry.
// The card only carries which con and which step: the Intel Level and the props are read again from the
// registry, the gamemaster's, when the target resists and when the result is written.

/**
 * The con step a Con test carries, checked against the registry: the con exists, the roller runs it and the
 * step is open. Null otherwise.
 * @param {{id:string, step:string}|undefined} conTest - the card's test.con
 * @param {string} actorId - the con artist
 */
export function checkedConStep(conTest, actorId){
  if (!conTest?.id || !CON_ROLLED_STEPS.includes(conTest.step)) return null
  const con = SR5ConRegistry.con(conTest.id)
  if (!con || !con.artistIds?.includes(actorId) || !openRolledSteps(con).includes(conTest.step)) return null
  return con
}

/**
 * The target's opposition to a con step (p. 163-164), from the registry's Intel Level.
 * @param {object} actorData - the target's system data
 * @param {number} conIntuition - Con + Intuition, the skill's share of the pool with Intuition
 */
export function conResistance(con, step, actorData, conIntuition){
  return conOpposition(step, {
    judgeIntentions: actorData?.derivedAttributes?.judgeIntentions?.dicePool ?? 0,
    conIntuition,
  }, con?.intel ?? 0)
}

/**
 * Writes a step rolled with Con in the con's journal and moves its status (p. 163-164). The gamemaster's.
 * @returns {Promise<string|null>} the outcome written, null when refused
 */
export async function recordRolledStep(conId, step, net){
  if (SR5ConRegistry.refuse()) return null
  const con = SR5ConRegistry.con(conId)
  if (!con || !openRolledSteps(con).includes(step)) {
    ui.notifications.warn(game.i18n.localize("SR5.CON_StepClosed"))
    return null
  }
  const outcome = rolledStepOutcome(step, net, con.kind)
  await SR5ConRegistry.update(d => {
    const c = d.cons.find(x => x.id === conId)
    if (!c) return
    c.status = outcome
    if (["exposed", "exitClean", "exitCrumbled"].includes(outcome)) c.end = game.time.worldTime
    c.steps = c.steps ?? []
    c.steps.push({
      id: foundry.utils.randomID(), time: game.time.worldTime, step, net, outcome
    })
  })
  return outcome
}
