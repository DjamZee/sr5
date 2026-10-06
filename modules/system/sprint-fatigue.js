//Fatigue of sprinting (SR5 p. 174): "Pour chaque phase d'action ou tour de combat consécutif pendant lequel un
//personnage utilise une action sprinter, il subit des dommages cumulatifs de 1E" (1E, then 2E, 3E... until he slows
//down), resisted with Body + Willpower, armor never counts. Ruling of DjamZ (2026-10-06, T7): only the sprint is
//automated; the long run, (Body + Running) x 10 minutes then every 3 minutes, stays with the GM.
//The Sprint test card is written by the player: it only says that a sprint was rolled. The streak is kept in a
//flag of the combat, written by the active GM alone, who reads the round and the pass himself and rolls the
//resistance of the damage.
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_PrepareRollTest
} from "../rolls/roll-prepare.js"
import {
  SR5Combat
} from "./srcombat.js"

export const SPRINT_FATIGUE_FLAG = "sprintFatigue"
const PENDING = new Set()

/**
 * The next step of a sprinter's streak.
 * Consecutive: a later pass of the same Combat Turn (a later action phase), or the next Combat Turn.
 * @param {{round: number, pass: number, streak: number}|undefined} previous The last sprint counted
 * @returns {{round: number, pass: number, streak: number}|null} null: this phase is already counted
 */
export function sprintFatigueStep(previous, round, pass) {
  if (previous && previous.round === round && previous.pass === pass) return null
  const consecutive = !!previous && ((previous.round === round && pass > previous.pass) || round === previous.round + 1)
  return {
    round, pass, streak: consecutive ? (Number(previous.streak) || 0) + 1 : 1
  }
}

//The card of a Sprint test (the "run" movement test, SR5 p. 164)
export function isSprintCard(message) {
  const test = message?.flags?.sr5data?.test
  return test?.type === "movement" && test?.typeSub === "run"
}

//Active GM side, on every new chat message
export async function onSprintCard(message) {
  if (!game.users?.activeGM?.isSelf || !isSprintCard(message)) return
  const combat = game.combat
  if (!combat?.started) return
  const actor = SR5_EntityHelpers.getRealActorFromID(message.flags.sr5data.owner?.actorId)
  const author = message.author
  if (!actor?.system?.resistances?.fatigue || !author) return
  //A card says nothing over an actor its author does not own
  if (!author.isGM && !actor.testUserPermission?.(author, "OWNER")) return
  const combatant = SR5Combat.getCombatantFromActor(actor)
  if (!combatant) return
  const ledger = combat.getFlag("sr5", SPRINT_FATIGUE_FLAG) ?? {
  }
  const step = sprintFatigueStep(ledger[combatant.id], combat.round, combat.getFlag("sr5", "combatInitiativePass") || 1)
  if (!step) return
  //Two cards of the same phase arriving together read the ledger before either writes it: the first one counts
  const key = `${combat.id}.${combatant.id}.${step.round}.${step.pass}`
  if (PENDING.has(key)) return
  PENDING.add(key)
  try {
    await combat.setFlag("sr5", SPRINT_FATIGUE_FLAG, {
      ...ledger, [combatant.id]: step
    })
  } finally {
    PENDING.delete(key)
  }
  const damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
  damageInfo.damage.value = step.streak
  damageInfo.damage.type = "stun"
  damageInfo.damage.resistanceType = "fatigue"
  await actor.rollTest("resistanceCard", null, damageInfo)
}
