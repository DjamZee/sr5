// Vehicle chases (R12, part 2): the chase actions in Foundry. A button of the chase window prepares the pilot's vehicle
// test (rollData-VehicleTest.js) with the threshold of chase-actions.js; the card it posts carries what the action is.
// The target opposes it from that card; the active gamemaster applies the outcome to the register (chase.js), and the
// follow-up tests an action asks for (stay at Extreme, avoid a crash, the new Terrain…) are buttons of the card he posts.
//
// Who writes: the gamemaster, who alone writes the register. He reads the cards again from the chat log (cardOf) and
// spends each once (consume), as for the files of the Matrix (file-actions.js). Nothing here is hardened further
// against the console (decision of 06/10).

import {
  CHASE_ACTIONS, NEAR_RANGES, actionRefusal, actionThreshold, actionDice, resolveAction, resolveFollowUp,
  stuntAdvantagesFor, cardActions
} from "./chase-actions.js"
import {
  chaseRanges, normalizeRange, terrainList, normalizeTerrain, terrainValue, effectiveSpeed, isFastest, isAircraft,
  pairKey
} from "./chase-rules.js"
import {
  SR5Chase, advancedDriving, chaseVehicleActor, chaseAttribute, chaseSpeedOf
} from "./chase.js"
import {
  monitorFull, vehiclePilotId
} from "./rigging-rules.js"
import {
  swarmCountOf
} from "./swarm.js"

export const CHASE_ROLL_PREFIX = "chaseRoll_"
export const CHASE_APPLY = "chaseApply"

const esc = s => foundry.utils.escapeHTML(String(s ?? ""))

/** The vehicle a chase button rolls for, or null */
export function chaseRollVehicleId(type) {
  return typeof type === "string" && type.startsWith(CHASE_ROLL_PREFIX) ? type.slice(CHASE_ROLL_PREFIX.length) : null
}

export function isChaseButton(type) {
  return type === CHASE_APPLY || !!chaseRollVehicleId(type)
}

function actionLabel(key) {
  return game.i18n.localize(`SR5.CHASE_Action_${key}`)
}

function liveVehicles(state) {
  return state.vehicles.filter(v => !v.ended)
}

function pairRange(state, a, b) {
  const va = state.vehicles.find(v => v.id === a)
  const vb = state.vehicles.find(v => v.id === b)
  if (!va || !vb) return null
  return normalizeRange(state.ranges[pairKey(a, b)], advancedDriving(), isAircraft(va.kind) || isAircraft(vb.kind))
}

function withSpeed(vehicle) {
  return {
    ...vehicle, speed: chaseSpeedOf(vehicle)
  }
}

function speedGap(a, b) {
  if (!a || !b) return 0
  return Math.ceil(Math.abs(effectiveSpeed(chaseSpeedOf(a), a.kind) - effectiveSpeed(chaseSpeedOf(b), b.kind)))
}

// The vehicles on the other side, still in the chase with this one
function opponentsOf(state, vehicle) {
  return liveVehicles(state).filter(v => v.id !== vehicle.id && v.role !== vehicle.role && !state.lost[pairKey(v.id, vehicle.id)])
}

function nearOf(state, vehicle, list) {
  return list.filter(v => NEAR_RANGES.includes(pairRange(state, vehicle.id, v.id))).map(v => v.id)
}

/* -------------------------------------------- */
/*  Launching an action from the window          */
/* -------------------------------------------- */

// What an action asks before its test: the new Terrain of Like a Glove, the angle of a Collision, the drones of a
// Swarm, the maneuver of the core book's Catch-Up (SR5 p. 200)
async function askOptions(key, state, vehicle, stunt = 0) {
  const advanced = advancedDriving()
  const fields = []
  // A stunt alone, or within the action (R5 p. 182-183): its level, and the advantage it gives if it is made
  if (key === "stunt" || stunt > 0) {
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_StuntLevel"))} <input type="number" name="stuntLevel" min="1" value="${Math.max(1, stunt)}"></label>`)
    const options = stuntAdvantagesFor(key).map(a => `<option value="${a}">${esc(game.i18n.localize(`SR5.CHASE_StuntAdvantage_${a}`))}</option>`).join("")
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_StuntAdvantage"))} <select name="stuntAdvantage">${options}</select></label>`)
    const slow = ["handling", "speed"].map(s => `<option value="${s}">${esc(game.i18n.localize(`SR5.CHASE_StuntSlow_${s}`))}</option>`).join("")
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_StuntSlow"))} <select name="stuntSlow">${slow}</select></label>`)
  }
  if (key === "catchUpBook" || key === "stuntBook") {
    const options = [1, 2, 3, 4].map(n => `<option value="${n}" ${n === 2 ? "selected" : ""}>${esc(game.i18n.localize(`SR5.CHASE_Maneuver_${n}`))}</option>`).join("")
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_Maneuver"))} <select name="maneuver">${options}</select></label>`)
  }
  if (key === "likeAGlove") {
    const current = terrainValue(state.terrain, advanced)
    const harder = terrainList(advanced).filter(t => t.value > current)
    if (!harder.length) {
      ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NoHarderTerrain"))
      return null
    }
    const prefix = advanced ? "SR5.CHASE_TerrainR5_" : "SR5.CHASE_TerrainBook_"
    const options = harder.map(t => `<option value="${t.key}">${esc(game.i18n.localize(`${prefix}${t.key}`))} (+${t.value})</option>`).join("")
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_NewTerrain"))} <select name="newTerrain">${options}</select></label>`)
    fields.push(`<label><input type="checkbox" name="endRun"> ${esc(game.i18n.localize("SR5.CHASE_EndRun"))}</label>`)
    fields.push(`<label><input type="checkbox" name="endRunHarder"> ${esc(game.i18n.localize("SR5.CHASE_EndRunHarder"))}</label>`)
  }
  if (key === "collision") {
    const options = ["rear", "side", "front"].map(a => `<option value="${a}" ${a === "side" ? "selected" : ""}>${esc(game.i18n.localize(`SR5.CHASE_Angle_${a}`))}</option>`).join("")
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_Angle"))} <select name="angle">${options}</select></label>`)
  }
  if (key === "swarm") {
    // The drones of its swarm when it has one (Rigger 5.0 p. 35), otherwise the vehicles of its side
    const drones = swarmCountOf(chaseVehicleActor(vehicle)) || liveVehicles(state).filter(v => v.role === vehicle.role).length
    fields.push(`<label>${esc(game.i18n.localize("SR5.CHASE_DroneCount"))} <input type="number" name="droneCount" min="2" value="${Math.max(2, drones)}"></label>`)
  }
  if (!fields.length) return {
  }
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: actionLabel(key)
    },
    content: `<div class="sr-chase-options">${fields.join("")}</div>`,
    buttons: [{
      action: "ok", label: game.i18n.localize("SR5.RollDice"), default: true,
      callback: (event, button) => {
        const f = button.form.elements
        return {
          maneuver: f.maneuver ? Number(f.maneuver.value) : undefined,
          newTerrain: f.newTerrain?.value,
          endRun: !!f.endRun?.checked,
          endRunHarder: !!f.endRunHarder?.checked,
          angle: f.angle?.value,
          droneCount: f.droneCount ? Math.max(2, Math.floor(Number(f.droneCount.value) || 2)) : undefined,
          stunt: f.stuntLevel ? {
            level: Math.max(1, Math.floor(Number(f.stuntLevel.value) || 1)), advantage: f.stuntAdvantage?.value,
            slow: f.stuntSlow?.value,
          } : undefined,
        }
      },
    }, {
      action: "cancel", label: game.i18n.localize("SR5.Cancel")
    }],
    rejectClose: false,
  })
  return result && typeof result === "object" ? result : null
}

/**
 * A button of the window: the pilot of `vehicleId` takes the chase action `key` (against `targetId`).
 * Rolled by whoever owns the vehicle, the gamemaster included.
 */
export async function launchChaseAction(vehicleId, key, targetId = "", stunt = 0) {
  const state = SR5Chase.state
  const advanced = advancedDriving()
  const action = CHASE_ACTIONS[key]
  const vehicle = state.vehicles.find(v => v.id === vehicleId)
  if (!state.active || !vehicle || vehicle.ended || !action) return false
  const actor = chaseVehicleActor(vehicle)
  if (!actor?.isOwner) return ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NotYourVehicle"))
  const target = action.target || action.targetOptional ? state.vehicles.find(v => v.id === targetId && !v.ended && v.id !== vehicleId) : null
  const range = target ? pairRange(state, vehicleId, target.id) : null
  const pilot = await edgePilot(actor)
  const controlMode = actor.system?.controlMode
  // A stunt within the action: Rigger 5.0 only, never the autopilot nor an action that rolls nothing (R5 p. 183)
  const stuntWithin = advanced && action.roll !== false && key !== "stunt" ? Math.max(0, Math.floor(Number(stunt) || 0)) : 0
  const refusal = actionRefusal(key, {
    advanced, kind: vehicle.kind, range, hasTarget: !!target, flags: state.turnFlags?.[vehicleId] ?? {
    }, role: vehicle.role, controlMode, edgeLeft: !!pilot?.edgeLeft, speed: chaseSpeedOf(vehicle),
    monitorFull: monitorFull(actor.system?.conditionMonitors?.condition),
  }) ?? (target && state.lost[pairKey(vehicleId, target.id)] ? "lost" : null) ??
    (stuntWithin && controlMode === "autopilot" ? "autopilot" : null)
  if (refusal) return ui.notifications?.warn(game.i18n.format(`SR5.CHASE_Refused_${refusal}`, {
    action: actionLabel(key)
  }))

  const options = await askOptions(key, state, vehicle, stuntWithin)
  if (!options) return false
  // Edge (R5 p. 178-181): the pilot's own point, by the system's path, once the player confirms
  if (action.edge && !(await spendPilotEdge(pilot, key))) return false
  const newTerrain = options.newTerrain ? normalizeTerrain(options.newTerrain, advanced) : undefined
  const live = liveVehicles(state).map(withSpeed)
  const ctx = {
    terrain: SR5Chase.terrainFor(vehicleId, state), speed: chaseSpeedOf(vehicle),
    targetSpeed: target ? chaseSpeedOf(target) : 0, gap: speedGap(vehicle, target),
    fastest: isFastest(live.find(v => v.id === vehicleId), live), range, maneuver: options.maneuver,
    newTerrainValue: newTerrain ? terrainValue(newTerrain, advanced) : 0, endRun: options.endRun,
    endRunHarder: options.endRunHarder, droneCount: options.droneCount, stunt: options.stunt,
    damageModifier: Number(actor.system?.penalties?.condition?.actual?.value) || 0,
  }
  const chase = {
    mode: "initiate", key, chaseId: state.id, initiatorId: vehicleId, targetId: target?.id ?? "",
    threshold: actionThreshold(key, ctx), limit: limitOf(action, state),
    dice: actionDice(key, {
      side: "initiator", range, flags: state.turnFlags?.[vehicleId] ?? {
      }, gloveMalus: !!state.glove?.[vehicleId] && state.glove[vehicleId] === state.terrain, advanced
    }),
    limitMods: turnHandlingMods(state, vehicleId),
    options: {
      ...options, newTerrain, newTerrainValue: ctx.newTerrainValue
    },
  }
  if (action.roll === false) return postChaseCard(actor, chase, {
    title: actionLabel(key), apply: true, lines: action.edge ? [edgeLine(pilot)] : [], actions: cardActions(key)
  })
  return actor.rollTest("vehicleTest", null, {
    chaseRoll: chase
  })
}

// The Handling a stunt gave or took this turn (R5 p. 182), as a limit modifier of the vehicle's chase tests
function turnHandlingMods(state, vehicleId) {
  const value = Number(state.turnHandling?.[vehicleId]) || 0
  return value ? [{
    key: "SR5.CHASE_LimitStunt", value
  }] : []
}

/**
 * The character whose Edge a vehicle's pilot spends (R5 p. 178-181): its controller by hand, remotely or jumped in,
 * never the autopilot. Read by the system's own test (SR5_RollTestHelper.hasEdgeLeft).
 * @returns {Promise<null|{actor: object, edgeLeft: boolean}>}
 */
async function edgePilot(vehicleActor) {
  const pilotId = vehiclePilotId(vehicleActor?.system)
  if (!pilotId) return null
  const {
    SR5_EntityHelpers
  } = await import("../entities/helpers.js")
  const {
    SR5_RollTestHelper
  } = await import("../rolls/roll-test-helper.js")
  const actor = SR5_EntityHelpers.getRealActorFromID(pilotId)
  return actor ? {
    actor, edgeLeft: SR5_RollTestHelper.hasEdgeLeft(actor)
  } : null
}

// The player confirms, then a point of the pilot's Edge is spent as for any test (removeEdgeFromActor)
async function spendPilotEdge(pilot, key) {
  if (!pilot?.actor?.isOwner) {
    ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NotYourPilot"))
    return false
  }
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: actionLabel(key)
    },
    content: `<p>${esc(game.i18n.format("SR5.CHASE_EdgeConfirm", {
      name: pilot.actor.name
    }))}</p>`,
  })
  if (!confirmed) return false
  const {
    SR5_RollTestHelper
  } = await import("../rolls/roll-test-helper.js")
  await SR5_RollTestHelper.removeEdgeFromActor(null, pilot.actor)
  return true
}

function edgeLine(pilot) {
  return game.i18n.format("SR5.CHASE_EdgeSpent", {
    name: pilot?.actor?.name ?? "?"
  })
}

// [Speed or Handling] by the environment of the turn in the core book (SR5 p. 205); Handling otherwise
function limitOf(action, state) {
  return action.limit === "environment" && !advancedDriving() && state.environment === "speed" ? "speed" : "handling"
}

/**
 * The buttons of a chase action's card (test-VehicleTest.js): the target opposes it, or the gamemaster applies it.
 */
export async function chaseCardButtons(cardData) {
  const chase = cardData.chase
  if (!chase) return false
  const {
    SR5_RollMessage
  } = await import("../rolls/roll-message.js")
  const action = CHASE_ACTIONS[chase.key]
  if (chase.mode === "initiate" && action?.opposed && chase.targetId) {
    const target = SR5Chase.state.vehicles.find(v => v.id === chase.targetId)
    cardData.chatCard.buttons[`${CHASE_ROLL_PREFIX}${chase.targetId}`] = SR5_RollMessage.generateChatButton("chaseRoll",
      `${CHASE_ROLL_PREFIX}${chase.targetId}`, game.i18n.format("SR5.CHASE_OpposeButton", {
        name: target?.name ?? "?"
      }))
    return true
  }
  cardData.chatCard.buttons[CHASE_APPLY] = SR5_RollMessage.generateChatButton("nonOpposedTest", CHASE_APPLY,
    game.i18n.localize("SR5.CHASE_ApplyButton"), true)
  return true
}

/** Whether the current user may see a chase button of a card: its vehicle's owners, and the gamemaster */
export function mayUseChaseButton(type) {
  if (game.user?.isGM) return true
  const id = chaseRollVehicleId(type)
  if (!id) return false
  const vehicle = SR5Chase.state.vehicles.find(v => v.id === id)
  return !!vehicle && !!chaseVehicleActor(vehicle)?.isOwner
}

/* -------------------------------------------- */
/*  The buttons of the cards                     */
/* -------------------------------------------- */

/** A click on a chase button of a card */
export async function chaseButton(type, messageData, messageId) {
  if (type === CHASE_APPLY) {
    if (!SR5Chase.canWrite) return ui.notifications?.warn(game.i18n.localize("SR5.CHASE_OnlyGM"))
    const {
      SR5_RollMessage
    } = await import("../rolls/roll-message.js")
    return SR5_RollMessage.applyOnce(messageId, type, () => applyChaseCard(messageId))
  }
  const vehicleId = chaseRollVehicleId(type)
  const state = SR5Chase.state
  const vehicle = state.vehicles.find(v => v.id === vehicleId)
  const chase = messageData?.chase
  if (!vehicle || !chase || !state.active || chase.chaseId !== state.id) return ui.notifications?.warn(game.i18n.localize("SR5.CHASE_Stale"))
  const actor = chaseVehicleActor(vehicle)
  if (!actor?.isOwner) return ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NotYourVehicle"))
  // The target opposes the initiator's test, with no threshold of its own
  if (chase.mode === "initiate") return actor.rollTest("vehicleTest", null, {
    chaseRoll: {
      mode: "oppose", key: chase.key, chaseId: chase.chaseId, originId: messageId, initiatorId: chase.initiatorId,
      targetId: vehicleId, threshold: 0, limit: chase.limit, limitMods: turnHandlingMods(state, vehicleId),
      dice: actionDice(chase.key, {
        side: "target", range: pairRange(state, chase.initiatorId, vehicleId), advanced: advancedDriving()
      }),
    }
  })
  // A follow-up test the gamemaster's card asks for
  const pending = chase.pending?.[vehicleId]
  if (chase.mode !== "pending" || !pending) return false
  return actor.rollTest("vehicleTest", null, {
    chaseRoll: {
      mode: "followUp", key: chase.key, chaseId: chase.chaseId, originId: messageId, sourceId: messageId,
      vehicleId, test: pending.test, threshold: pending.threshold, limit: pending.limit ?? "handling",
      limitMods: turnHandlingMods(state, vehicleId),
      dice: pending.dice ? [{
        key: pending.diceKey ?? "SR5.CHASE_DiceCriticalGlitch", value: pending.dice
      }] : [],
    }
  })
}

/* -------------------------------------------- */
/*  The gamemaster's resolution                  */
/* -------------------------------------------- */

// What resolveAction reads of the chase for an action
function resolveContext(state, chase, roll) {
  const advanced = advancedDriving()
  const initiator = state.vehicles.find(v => v.id === chase.initiatorId)
  const target = state.vehicles.find(v => v.id === chase.targetId)
  const actor = initiator ? chaseVehicleActor(initiator) : null
  const range = target ? pairRange(state, initiator.id, target.id) : null
  const opponents = initiator ? opponentsOf(state, initiator) : []
  const allies = initiator ? liveVehicles(state).filter(v => v.id !== initiator.id && v.role === initiator.role) : []
  return {
    ...roll, ...chase.options,
    initiatorId: chase.initiatorId, targetId: chase.targetId, initiatorRole: initiator?.role,
    rawThreshold: chase.threshold, limit: chase.limit, range, ranges: chaseRanges(advanced),
    aircraft: !!(initiator && isAircraft(initiator.kind)) || !!(target && isAircraft(target.kind)),
    terrain: SR5Chase.terrainFor(chase.initiatorId, state), acceleration: chaseAttribute(actor, "acceleration"),
    handling: chaseAttribute(actor, "handling"), body: chaseAttribute(actor, "body"),
    speed: initiator ? chaseSpeedOf(initiator) : 0, targetSpeed: target ? chaseSpeedOf(target) : 0,
    opponents: opponents.map(v => v.id), nearOpponents: initiator ? nearOf(state, initiator, opponents) : [],
    pursuers: opponents.filter(v => v.role === "pursuer").map(v => v.id),
    turnHandling: Number(state.turnHandling?.[chase.initiatorId]) || 0,
    nearAllies: initiator ? nearOf(state, initiator, allies) : [],
  }
}

// The pursuer's last test of Rigger 5.0 past Extreme: Terrain + the Speed gap (R5 p. 177)
function followUpThreshold(state, effect) {
  if (effect.test !== "escapeR5") return effect.threshold
  const a = state.vehicles.find(v => v.id === effect.a)
  const b = state.vehicles.find(v => v.id === effect.b)
  return SR5Chase.terrainFor(effect.vehicle, state) + speedGap(a, b)
}

function rollOf(card) {
  const roll = card?.data?.roll ?? {
  }
  return {
    hits: Math.max(0, Number(roll.hits) || 0), threshold: Math.max(0, Number(card?.data?.threshold?.value) || 0),
    glitch: !!(roll.glitchRoll || roll.criticalGlitchRoll), criticalGlitch: !!roll.criticalGlitchRoll,
  }
}

/** Apply a chase card, on the gamemaster's client */
export async function applyChaseCard(messageId) {
  const {
    SR5_MiscellaneousHelpers
  } = await import("../rolls/roll-helpers/miscellaneous.js")
  const {
    consumedKey
  } = await import("../rolls/roll-helpers/socket-guard.js")
  const {
    SR5_RollMessage
  } = await import("../rolls/roll-message.js")
  const card = SR5_MiscellaneousHelpers.cardOf(messageId)
  const chase = card?.data?.chase
  const state = SR5Chase.state
  if (!chase || !state.active || chase.chaseId !== state.id) {
    ui.notifications?.warn(game.i18n.localize("SR5.CHASE_Stale"))
    return false
  }

  let source = chase, outcome, spentOn = messageId, spentUse = CHASE_APPLY, originButton = null
  if (chase.mode === "oppose") {
    // The initiator's card, read again: its hits and threshold; one opposition counts per card
    const origin = SR5_MiscellaneousHelpers.cardOf(chase.originId)
    if (!origin?.data?.chase) return refuse()
    source = origin.data.chase
    const initiatorRoll = rollOf(origin)
    spentOn = origin.id
    spentUse = `chase_${chase.targetId}`
    originButton = [origin.id, `${CHASE_ROLL_PREFIX}${chase.targetId}`]
    if (!(await SR5_MiscellaneousHelpers.consume(consumedKey(spentOn, spentUse)))) return refuse("spent")
    outcome = resolveAction(source.key, resolveContext(state, source, {
      ...initiatorRoll, opposingHits: rollOf(card).hits
    }))
  } else if (chase.mode === "followUp") {
    // The gamemaster's card that asked for it
    const asked = SR5_MiscellaneousHelpers.cardOf(chase.sourceId)
    const pending = asked?.byGM ? asked.data?.chase?.pending?.[chase.vehicleId] : null
    if (!pending) return refuse()
    source = asked.data.chase
    spentOn = asked.id
    spentUse = `chase_${chase.vehicleId}`
    originButton = [asked.id, `${CHASE_ROLL_PREFIX}${chase.vehicleId}`]
    if (!(await SR5_MiscellaneousHelpers.consume(consumedKey(spentOn, spentUse)))) return refuse("spent")
    outcome = resolveFollowUp(pending, rollOf(card))
  } else {
    if (!(await SR5_MiscellaneousHelpers.consume(consumedKey(spentOn, spentUse)))) return refuse("spent")
    outcome = resolveAction(chase.key, resolveContext(state, chase, rollOf(card)))
  }

  // Once a turn (Sow Chaos): spent by the test, won or not
  if (chase.mode === "initiate" && CHASE_ACTIONS[chase.key]?.oncePerTurn) await SR5Chase.setTurnFlag(chase.initiatorId, `${chase.key}Used`)
  const followUps = await applyEffects(outcome.effects)
  await SR5_RollMessage.updateChatButton(card.id, CHASE_APPLY)
  if (originButton) await SR5_RollMessage.updateChatButton(...originButton)
  await postOutcome(source, chase, outcome, followUps)
  // Part 3 (stunts, Edge) hooks here
  Hooks.callAll("sr5ChaseActionResolved", {
    key: source.key, mode: chase.mode, outcome
  })
  return true

  function refuse(reason = "card") {
    ui.notifications?.warn(game.i18n.localize(`SR5.CHASE_ApplyRefused_${reason}`))
    return false
  }
}

/** Write the effects of an outcome in the register, one after the other; the follow-up tests come back */
async function applyEffects(effects) {
  const followUps = []
  for (const e of effects ?? []) {
    switch (e.type) {
      case "shift": await SR5Chase.shiftPair(e.a, e.b, e.steps); break
      case "setRange": await SR5Chase.setRange(e.a, e.b, e.range); break
      case "roles": await SR5Chase.setRoles(e.pursuer, e.pursued); break
      case "control": await SR5Chase.markControlled(e.id); break
      case "outOfControl": await SR5Chase.markOutOfControl(e.id); break
      case "speed": await SR5Chase.forceSpeed(e.id, e.value); break
      case "turnSpeed": await SR5Chase.slowForTurn(e.id, e.value); break
      case "handling": if (e.delta < 0) await SR5Chase.addHandlingLoss(e.id, -e.delta); break
      case "terrain": await SR5Chase.setTerrain(e.key); break
      case "turnTerrain": await SR5Chase.addTurnTerrain(e.ids, e.delta); break
      case "turnHandling": await SR5Chase.addTurnHandling(e.id, e.delta); break
      case "flag": await SR5Chase.setTurnFlag(e.id, e.flag); break
      case "glove": await SR5Chase.setGlove(e.id, e.terrain); break
      case "leave": await SR5Chase.leaveChase(e.id, e.reason); break
      case "escape": await SR5Chase.escapePair(e.a, e.b); break
      case "followUp": followUps.push({
        ...e, threshold: followUpThreshold(SR5Chase.state, e)
      }); break
      default: break
    }
  }
  return followUps
}

/** The gamemaster's card: what happened, and the buttons of the follow-up tests */
async function postOutcome(source, chase, outcome, followUps) {
  const state = SR5Chase.state
  const initiator = state.vehicles.find(v => v.id === source.initiatorId)
  const name = id => state.vehicles.find(v => v.id === id)?.name ?? "?"
  const lines = []
  const subject = chase.mode === "followUp" ? name(chase.vehicleId) : initiator?.name ?? "?"
  lines.push(game.i18n.format(outcome.success ? "SR5.CHASE_OutcomeWon" : "SR5.CHASE_OutcomeLost", {
    name: subject, net: outcome.net
  }))
  for (const e of outcome.effects ?? []) {
    if (e.type === "followUp") continue
    const prefix = advancedDriving() ? "SR5.CHASE_TerrainR5_" : "SR5.CHASE_TerrainBook_"
    const key = e.type === "flag" ? `flag_${e.flag}` : e.type === "shift" ? (e.steps > 0 ? "shiftFarther" : "shiftCloser") : e.type
    lines.push(game.i18n.format(`SR5.CHASE_Effect_${key}`, {
      terrain: e.key ? game.i18n.localize(`${prefix}${e.key}`) : "",
      a: name(e.a), b: name(e.b), name: name(e.id ?? e.pursuer), other: name(e.pursued), steps: Math.abs(e.steps ?? 0),
      range: e.range ? game.i18n.localize(`SR5.CHASE_Range_${e.range}`) : "", value: e.type === "turnTerrain" || e.type === "turnHandling" ? (e.delta > 0 ? `+${e.delta}` : `−${-e.delta}`) :
        e.type === "handling" ? Math.abs(e.delta) : e.value ?? 0,
      names: (e.ids ?? []).map(name).join(", "),
    }))
  }
  for (const n of outcome.notes ?? []) lines.push(game.i18n.format(n.key, n.data ?? {
  }))
  const pending = {
  }
  for (const f of followUps) pending[f.vehicle] = {
    test: f.test, threshold: f.threshold, a: f.a, b: f.b, vehicle: f.vehicle, applied: f.applied, total: f.total,
    toEscape: f.toEscape, terrain: f.terrain, dice: f.dice ?? 0, diceKey: f.diceKey, limit: f.limit,
  }
  for (const text of lines) await SR5Chase.log(text)
  const actor = initiator ? chaseVehicleActor(initiator) : null
  return postChaseCard(actor, {
    mode: followUps.length ? "pending" : "done", key: source.key, chaseId: state.id, initiatorId: source.initiatorId,
    pending,
  }, {
    title: actionLabel(source.key), lines, followUps: followUps.map(f => ({
      id: f.vehicle, label: game.i18n.format("SR5.CHASE_FollowUpButton", {
        name: name(f.vehicle), test: game.i18n.localize(`SR5.CHASE_FollowUp_${f.test}`), threshold: f.threshold
      })
    }))
  })
}

/** A card without dice: the result of an action, or the Control a Vehicle action that rolls nothing */
async function postChaseCard(actor, chase, {
  title, lines = [], followUps = [], apply = false, actions = []
}) {
  if (!actor) return false
  // The combat actions it spends, checked and counted as a roll does (roll-test.js)
  const {
    SR5Combat
  } = actions.length ? await import("./srcombat.js") : {
  }
  if (actions.length && !SR5Combat.hasActionsLeft(actor, actions)) return false
  const {
    SR5_PrepareRollTest
  } = await import("../rolls/roll-prepare.js")
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  const {
    SR5_RollMessage
  } = await import("../rolls/roll-message.js")
  const rollData = SR5_PrepareRollTest.getBaseRollData(null, actor)
  rollData.test.type = "falseTest"
  rollData.test.title = `${game.i18n.localize("SR5.CHASE_Title")}${game.i18n.localize("SR5.Colons")} ${title}`
  rollData.edge.canUseEdge = false
  rollData.roll = {
    rollMode: game.settings.get("core", "rollMode")
  }
  rollData.chase = chase
  lines.forEach((text, i) => {
    rollData.chatCard.buttons[`chaseLine${i}`] = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", esc(text))
  })
  for (const f of followUps) rollData.chatCard.buttons[`${CHASE_ROLL_PREFIX}${f.id}`] = SR5_RollMessage.generateChatButton("chaseRoll",
    `${CHASE_ROLL_PREFIX}${f.id}`, esc(f.label))
  if (apply) rollData.chatCard.buttons[CHASE_APPLY] = SR5_RollMessage.generateChatButton("nonOpposedTest", CHASE_APPLY,
    game.i18n.localize("SR5.CHASE_ApplyButton"), true)
  rollData.combat.actions = actions
  const card = await SR5_RollTest.renderRollCard(rollData)
  if (game.combat && actions.length) await SR5Combat.changeActionInCombat(rollData.owner.actorId, actions)
  return card
}

/* -------------------------------------------- */
/*  The window                                   */
/* -------------------------------------------- */

/** The actions a vehicle may pick in the window, and the vehicles it may aim at */
export function windowActions(state, vehicle) {
  const advanced = advancedDriving()
  const flags = state.turnFlags?.[vehicle.id] ?? {
  }
  const targets = liveVehicles(state).filter(v => v.id !== vehicle.id && !state.lost[pairKey(v.id, vehicle.id)])
  const actions = Object.values(CHASE_ACTIONS).filter(a => a.rules === "both" || a.rules === (advanced ? "r5" : "book"))
    .filter(a => !a.kinds || a.kinds.includes(vehicle.kind))
    .map(a => ({
      key: a.key, label: actionLabel(a.key), page: a.page, target: !!a.target,
      unavailable: a.oncePerTurn && flags[`${a.key}Used`],
    }))
  return {
    actions, targets: targets.map(v => ({
      id: v.id, name: v.name, range: game.i18n.localize(`SR5.CHASE_Range_${pairRange(state, vehicle.id, v.id)}`)
    }))
  }
}

export const _test = {
  resolveContext, followUpThreshold, rollOf, limitOf
}
