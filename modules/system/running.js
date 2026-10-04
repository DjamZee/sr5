//Running (SR5 p. 163-164): a character who moves farther than their walking rate in a Combat Turn is running
//until the end of that turn, even if they stop afterwards. Running gives +2 dice on defense tests and -2 dice on
//every action taken while running, Sprint and charge excepted (SR5 p. 164, 179, 188, 190 ; Run & Gun p. 134).
//The state is the "running" token status. It is put on when the token is moved with the "Course" or "Sprint"
//movement action of the token HUD, or, if the world setting asks for it, when the token has gone farther than its
//walking rate this turn. It falls at the start of the next Combat Turn and when the encounter ends.

export const RUNNING_STATUS = "running"
export const RUNNING_ACTIONS = ["run", "sprint"]

//Defense tests: +2 dice for the runner (SR5 p. 164 ; p. 190). Ruling of DjamZ (2026-10-04): the bonus lasts the
//whole Combat Turn, as p. 164 and the example of Caster say, not only after the defender's previous action (p. 190)
const DEFENSE_TESTS = ["defense", "defenseSimple", "martialArtDefense", "powerDefense", "grappleClinchDefense"]
//Actions: -2 dice (SR5 p. 164). Ruling of DjamZ (2026-10-04): resistance tests (damage, drain, fading...) are not
//actions and keep their dice
const ACTION_TESTS = ["attack", "skill", "skillDicePool", "attributeOnly", "lift", "spell", "preparation",
  "complexForm", "matrixAction", "resonanceAction", "grappleClinch", "grappleEscape", "escapeEngulf",
  "healing", "movement"]

/**
 * Which running modifier a test takes.
 * "rangedAttack" and "defenseBox" use the boxes the dialog already had (Attacker running, Defender running) ;
 * "general" (-2) and "defense" (+2) use the running box of the modifiers list ; null: none.
 * @param {{type: string, typeSub?: string}} test
 * @returns {"rangedAttack"|"defenseBox"|"general"|"defense"|null}
 */
export function runningModifierKind(test) {
  if (!test) return null
  if (test.type === "attack" && test.typeSub === "rangedWeapon") return "rangedAttack"
  if (test.type === "defense" && (test.typeSub === "rangedWeapon" || test.typeSub === "meleeWeapon")) return "defenseBox"
  if (DEFENSE_TESTS.includes(test.type)) return "defense"
  //The Sprint test is the movement test of the "run" movement (SR5 p. 164: no running penalty on Sprint)
  if (test.type === "movement" && test.typeSub === "run") return null
  if (ACTION_TESTS.includes(test.type)) return "general"
  return null
}

//The running modifier of the general box: +2 on a defense test, -2 on an action
export function runningModifierValue(kind) {
  return kind === "defense" ? 2 : -2
}

//Distances are measured in scene units: the rules are in meters (a 1.5 m square, a scene may be set in feet)
const FEET = ["ft", "ft.", "feet", "foot", "pi", "pi.", "pied", "pieds"]
export function sceneUnitsToMeters(distance, units) {
  const unit = String(units ?? "").trim().toLowerCase()
  if (FEET.includes(unit)) return distance * 0.3048
  if (unit === "km") return distance * 1000
  return distance
}

/**
 * The gait a distance covered in one Combat Turn asks for (SR5 p. 164).
 * @returns {"walk"|"run"|"sprint"}
 */
export function runningGait(meters, walk, run) {
  if (meters > run) return "sprint"
  if (meters > walk) return "run"
  return "walk"
}

//Meters already covered this Combat Turn, read from the token flag (0 if the flag belongs to another turn)
export function roundMeters(flag, combatId, round) {
  if (!flag || flag.combatId !== combatId || flag.round !== round) return 0
  return Number(flag.meters) || 0
}

/**
 * Whether a move puts the running status on.
 * @param {string} action          The movement action of the move
 * @param {number} totalMeters     Meters covered this Combat Turn, this move included
 * @param {number} walk            Walking rate in meters
 * @param {boolean} auto           World setting: put on from the distance
 */
export function moveMakesRunning(action, totalMeters, walk, auto) {
  if (RUNNING_ACTIONS.includes(action)) return true
  return !!auto && walk > 0 && totalMeters > walk
}

//Colors of the ruler: walking, running, sprinting
export const GAIT_COLORS = {
  walk: 0x2e9e44,
  run: 0xe0b000,
  sprint: 0xd03030
}

//"Course" and "Sprint" in the movement action selector of the token HUD. A meter costs the same as walking:
//only the rates change, and the ruler shows them
export function registerRunningMovementActions(movementConfig) {
  if (!movementConfig?.actions) return
  movementConfig.actions.run = {
    label: "SR5.MovementActionRun",
    icon: "fa-solid fa-person-running",
    img: "icons/svg/wingfoot.svg",
    order: 0.5,
    deriveTerrainDifficulty: ({walk}) => walk
  }
  movementConfig.actions.sprint = {
    label: "SR5.MovementActionSprint",
    icon: "fa-solid fa-person-running-fast",
    img: "icons/svg/wingfoot.svg",
    order: 0.6,
    deriveTerrainDifficulty: ({walk}) => walk
  }
}

export const runningStatusEffect = {
  img: "icons/svg/wingfoot.svg",
  id: RUNNING_STATUS,
  name: "SR5.STATUSES_Running",
  origin: RUNNING_STATUS
}

export function isRunning(actor) {
  return !!actor?.effects?.some(e => e.statuses?.has(RUNNING_STATUS))
}

//Walking and running rates of an actor, in meters (0 when the actor has none: vehicles, devices)
export function actorRates(actor) {
  const movements = actor?.system?.movements
  return {
    walk: Number(movements?.walk?.movement?.value) || 0,
    run: Number(movements?.run?.movement?.value) || 0
  }
}

//A move of a token: counts the meters of the Combat Turn and puts the running status on. Done by the active GM
//only, who receives the hook as every client does
export async function onMoveToken(tokenDocument, movement) {
  if (!game.users.activeGM?.isSelf) return
  const actor = tokenDocument.actor
  if (!actor?.system?.movements) return
  const combat = game.combat
  const combatant = combat?.started ? combat.getCombatantByToken(tokenDocument.id) : null
  //Running is a Combat Turn state: outside an encounter, nothing is put on
  if (!combatant) return

  const action = movement?.passed?.waypoints?.at(-1)?.action ?? tokenDocument.movementAction
  const units = tokenDocument.parent?.grid?.units ?? canvas?.scene?.grid?.units
  const moved = sceneUnitsToMeters(Number(movement?.passed?.distance) || 0, units)
  const total = roundMeters(tokenDocument.getFlag("sr5", "runDistance"), combat.id, combat.round) + moved
  await tokenDocument.setFlag("sr5", "runDistance", {combatId: combat.id, round: combat.round, meters: total})

  const {walk} = actorRates(actor)
  const auto = game.settings.get("sr5", "sr5RunningFromDistance")
  if (moveMakesRunning(action, total, walk, auto) && !isRunning(actor)) {
    await actor.toggleStatusEffect(RUNNING_STATUS, {active: true})
  }
}

//The running status falls at the start of a Combat Turn and when the encounter ends
export async function clearRunning(combat) {
  if (!game.users.activeGM?.isSelf) return
  for (const combatant of combat?.combatants ?? []) {
    if (isRunning(combatant.actor)) await combatant.actor.toggleStatusEffect(RUNNING_STATUS, {active: false})
  }
}

//The ruler colors the planned path by gait: green while walking, yellow while running, red past the running rate.
//The meters already covered this Combat Turn come first
export function createRunningTokenRuler(BaseRuler) {
  return class SR5TokenRuler extends BaseRuler {
    _getSegmentStyle(waypoint) {
      const style = super._getSegmentStyle(waypoint)
      const color = this.#gaitColor(waypoint)
      if (style.width && color !== null) style.color = color
      return style
    }

    _getGridHighlightStyle(waypoint, offset) {
      const style = super._getGridHighlightStyle(waypoint, offset)
      const color = this.#gaitColor(waypoint)
      if (style.alpha !== 0 && color !== null) style.color = color
      return style
    }

    #gaitColor(waypoint) {
      if (waypoint.stage === "passed") return null
      const document = this.token?.document
      const {walk, run} = actorRates(document?.actor)
      if (!(walk > 0)) return null
      //The part of the path already done is in the meters of the Combat Turn
      let passed = waypoint
      while (passed && passed.stage !== "passed") passed = passed.previous
      const planned = (waypoint.measurement?.distance ?? 0) - (passed?.measurement?.distance ?? 0)
      const combat = game.combat
      const before = combat?.started ? roundMeters(document.getFlag("sr5", "runDistance"), combat.id, combat.round) : 0
      const meters = before + sceneUnitsToMeters(planned, document.parent?.grid?.units)
      return GAIT_COLORS[runningGait(meters, walk, run)]
    }
  }
}
