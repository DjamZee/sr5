// Using Con, Cutting Aces p. 162-164 (VF): the three phases of a con, without Foundry.
// The registry (con-registry.js), the gamemaster's window (con-app.js) and the Con test build on these.

// The steps of p. 162-164. kinds: the cons a step belongs to; mandatory: the book's "Obligatoire".
// Reinforce becomes mandatory after a tie on the bait of a long con (p. 163).
export const CON_STEPS = {
  investigation : {
    phase: 1, kinds: ["long"], mandatory: false
  },
  matrixResearch: {
    phase: 1, kinds: ["long"], mandatory: false
  },
  surveillance  : {
    phase: 1, kinds: ["long", "short"], mandatory: true
  },
  evaluation    : {
    phase: 1, kinds: ["long"], mandatory: false
  },
  propFabrication: {
    phase: 1, kinds: ["long", "short"], mandatory: false
  },
  propAcquisition: {
    phase: 1, kinds: ["long", "short"], mandatory: false
  },
  bait          : {
    phase: 2, kinds: ["long", "short"], mandatory: true
  },
  reinforce     : {
    phase: 2, kinds: ["long"], mandatory: false
  },
  exit          : {
    phase: 3, kinds: ["long", "short"], mandatory: false
  },
}

// The steps rolled with the Con skill, from the con artist's sheet (p. 163-164)
export const CON_ROLLED_STEPS = ["bait", "reinforce", "exit"]

// Matrix Connection Level table, p. 163: the target's recommended dice pool. Permanent reads "16+".
export const MATRIX_DEGREES = {
  offline  : 4,
  veryLow  : 6,
  low      : 8,
  moderate : 10,
  high     : 12,
  veryHigh : 14,
  permanent: 16,
}

/**
 * Whether a step belongs to a con of this kind (short or long).
 */
export function stepAllowed(step, kind){
  return !!CON_STEPS[step]?.kinds.includes(kind)
}

/**
 * Net hits of an opposed test: the con artist's hits less the opposition's. Signed.
 */
export function netHits(artistHits, opposingHits){
  return (Math.max(0, Math.floor(Number(artistHits) || 0))) - (Math.max(0, Math.floor(Number(opposingHits) || 0)))
}

/**
 * How a preparation step moves the Intel Level (p. 162-163).
 * Investigation and matrix research add the net hits; surveillance adds or takes them away;
 * evaluation adds them, and cannot be made at an Intel Level of 0 or less (it is its limit).
 * @returns {number} the change to the Intel Level
 */
export function intelDelta(step, net){
  const n = Math.floor(Number(net) || 0)
  switch (step){
    case "surveillance":
      return n
    case "investigation":
    case "matrixResearch":
    case "evaluation":
      return Math.max(0, n)
    default:
      return 0
  }
}

/**
 * Evaluation (p. 163): Psychology (Profiling) + Logic [Intel Level] against the Intel Level.
 * The con artist's hits are capped by the Intel Level, which also gives the opposing dice.
 * @returns {{allowed:boolean, limit:number, opposingDice:number}}
 */
export function evaluationTest(intel){
  const level = Math.floor(Number(intel) || 0)
  return {
    allowed: level > 0, limit: Math.max(0, level), opposingDice: Math.max(0, level)
  }
}

/**
 * Prop fabrication (p. 163): an extended Forgery or Artisan + Agility test, threshold twice the Prop
 * Rating wanted, interval 1 day. Stopped short, the rating is the hits halved, rounded down.
 * @returns {{threshold:number, rating:number, done:boolean}}
 */
export function propFabrication(wanted, hits){
  const rating = Math.max(0, Math.floor(Number(wanted) || 0))
  const h = Math.max(0, Math.floor(Number(hits) || 0))
  const threshold = rating * 2
  const done = rating > 0 && h >= threshold
  return {
    threshold, done, rating: done ? rating : Math.min(rating, Math.floor(h / 2))
  }
}

/**
 * Prop acquisition (p. 163), "en règle générale": Availability three times the Prop Rating,
 * cost the Availability times 1,000 nuyen. The gamemaster may set others.
 */
export function propAcquisition(rating){
  const r = Math.max(0, Math.floor(Number(rating) || 0))
  return {
    availability: r * 3, cost: r * 3 * 1000
  }
}

/**
 * The cumulated Prop Rating (p. 163, "l'Indice d'Accessoire cumulée"): the sum of the props.
 */
export function propTotal(props){
  return (props ?? []).reduce((sum, p) => sum + Math.max(0, Math.floor(Number(p?.rating) || 0)), 0)
}

/**
 * The outcome of a step rolled with Con (p. 163-164), from the con artist's net hits.
 * bait: won = hooked; a tie leaves a long con's mark wary (reinforcing becomes mandatory) and
 * exposes a short con's artist; lost = exposed.
 * reinforce: won = hooked, a tie or a loss = exposed.
 * exit: won = clean exit, a tie or a loss = the story starts to crumble (the goal is reached all the same).
 * @returns {"hooked"|"wary"|"exposed"|"exitClean"|"exitCrumbled"|null}
 */
export function rolledStepOutcome(step, net, kind){
  const n = Math.floor(Number(net) || 0)
  switch (step){
    case "bait":
      if (n > 0) return "hooked"
      if (n === 0 && kind === "long") return "wary"
      return "exposed"
    case "reinforce":
      return n > 0 ? "hooked" : "exposed"
    case "exit":
      return n > 0 ? "exitClean" : "exitCrumbled"
    default:
      return null
  }
}

/**
 * The opposition to a step rolled with Con (p. 163-164). The bait and the exit: the higher of the
 * target's Judge Intentions or Con + Intuition; reinforcing: Judge Intentions only.
 * The bait alone takes the Intel Level off that pool: Intel and props no longer count afterwards (p. 164).
 * @param {string} step
 * @param {{judgeIntentions:number, conIntuition:number}} pools
 * @param {number} intel
 * @returns {{pool:"judgeIntentions"|"conIntuition", base:number, intelModifier:number}}
 */
export function conOpposition(step, pools, intel){
  const judge = Math.max(0, Number(pools?.judgeIntentions) || 0)
  const con = Math.max(0, Number(pools?.conIntuition) || 0)
  const useCon = step !== "reinforce" && con > judge
  return {
    pool: useCon ? "conIntuition" : "judgeIntentions",
    base: useCon ? con : judge,
    // A negative Intel Level (a surveillance that went wrong) helps the target: the book's "modificateur
    // négatif" read as minus the level, signed. Rémi's reading, flagged to the gamemaster in the guide
    intelModifier: step === "bait" ? -Math.floor(Number(intel) || 0) : 0,
  }
}

/**
 * The bonus dice of the con artist on the bait: the cumulated Prop Rating (p. 163). None on the other steps.
 */
export function conArtistBonus(step, props){
  return step === "bait" ? propTotal(props) : 0
}

// A con still running: in preparation, the mark hooked, or the mark wary after a tie on a long con's bait
export const ACTIVE_STATUSES = ["preparing", "hooked", "wary"]

/**
 * The steps rolled with Con a con offers now (p. 163-164): the bait while it is prepared, reinforcing a
 * long con once baited (mandatory when wary), and the exit once the mark is hooked.
 * @param {{kind:string, status:string}} con
 */
export function openRolledSteps(con){
  switch (con?.status){
    case "preparing":
      return ["bait"]
    case "wary":
      return ["reinforce"]
    case "hooked":
      return con.kind === "long" ? ["reinforce", "exit"] : ["exit"]
    default:
      return []
  }
}

/**
 * The Faction Reputation reason a finished con offers (p. 158), from its outcome.
 * @returns {"conUndetected"|"shortConDetected"|"longConDetected"|null}
 */
export function factionReasonOf(status, kind){
  if (status === "exitClean") return "conUndetected"
  if (["exposed", "exitCrumbled", "vanished"].includes(status)) return kind === "long" ? "longConDetected" : "shortConDetected"
  return null
}
