import {
  updateLedger
} from "./gm-ledger.js"
import {
  chaseRanges, normalizeRange, rangeDistance, shiftRange, terrainList, normalizeTerrain, terrainValue, kindOfCategory, isAircraft,
  VEHICLE_KINDS, speedBounds, clampSpeed, chaseThreshold, isFastest, pairKey, markControlled, endOfTurn,
  chaseEndReason, restoreTurnSpeed
} from "./chase-rules.js"
import {
  monitorFull
} from "./rigging-rules.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"

// Vehicle chases (R12, first part: the tracking). The gamemaster keeps the chase in a register only the active GM
// writes (gm-ledger.js): the vehicles, their current Speed, the engagement range of each pair, the Terrain, and who is
// out of control. Players whose vehicle (or who themselves) are in the chase see it, read only.
// The core book's chase (SR5 p. 204-205) is the default; Rigger 5.0's advanced driving rules (p. 175-185) when the
// world setting is on. The rules themselves are in chase-rules.js.
//
// Where the next parts plug in: the chase actions as preset rolls (part 2) and the stunts and Edge (part 3) go through
// SR5Chase — markControlled() when a pilot takes the Control a Vehicle action, shiftPair() for the range changes of
// Catch-Up / Break Away and of a stunt, threshold() for the threshold of an action against another vehicle.

export const CHASE_LEDGER = "sr5Chase"
export const ADVANCED_DRIVING_SETTING = "sr5Rigger5AdvancedDriving"
export const CHASE_EFFECT = "chaseOutOfControl"
export const CHASE_HANDLING_EFFECT = "chaseHandling"
const APP_ID = "sr5-chase"
const SEEN_KEY = "sr5.chaseSeen"
// The log scrolls in its box (lot 5): riggers with several passes write many lines a turn
const LOG_SIZE = 200

const EMPTY = () => ({
  active: false, id: "", turn: 1, combatId: "", round: 0, environment: "speed", terrain: "",
  vehicles: [], ranges: {
  }, lost: {
  }, log: [],
  // Part 2, the chase actions: the Terrain of the turn by vehicle (Sow Chaos, Clear the Path), what a vehicle did this
  // turn (Drift, Strafe, Sow Chaos), who failed a Like a Glove (its Terrain), the Handling a PIT took
  turnTerrain: {
  }, turnFlags: {
  }, glove: {
  }, handlingLoss: {
  },
  // Part 3: the Handling a stunt gave or took for the turn, and the Speed it took, given back at the end of the turn
  // (R5 p. 182)
  turnHandling: {
  }, turnSpeedLoss: {
  },
})

const isActiveGM = () => !!game.user?.isActiveGM

export function advancedDriving() {
  try {
    return !!game.settings.get("sr5", ADVANCED_DRIVING_SETTING)
  } catch {
    return false
  }
}

function readState() {
  let raw
  try {
    raw = game.settings.get("sr5", CHASE_LEDGER)
  } catch {
    raw = null
  }
  return {
    ...EMPTY(), ...(raw ?? {
    })
  }
}

/** The actor of a vehicle of the chase: its token's (an unlinked drone has its own), else the actor itself */
function vehicleActor(vehicle) {
  return fromUuidSync(vehicle.tokenUuid)?.actor ?? fromUuidSync(vehicle.actorUuid) ?? null
}

// A vehicle attribute as prepared, off-road when the vehicle drives off-road and has an off-road value
function attribute(actor, key) {
  const attributes = actor?.system?.attributes
  if (!attributes) return 0
  const offRoad = actor.system.offRoadMode ? Number(attributes[`${key}OffRoad`]?.augmented?.value) : 0
  return offRoad || Number(attributes[key]?.augmented?.value) || 0
}

// The highest Speed a vehicle may be given: its Speed attribute; no cap for a vehicle without actor or without
// Speed, whose register Speed is all there is (lot 16b: it was held at 0, and never given back at the end of the turn)
function speedCap(actor) {
  return attribute(actor, "speed") || Infinity
}

// The current Speed of a vehicle lives on the vehicle itself when its sheet has the field (system.currentSpeed, R11:
// Speed Demon and Information Overload read it): one Speed, not two. The register keeps its own copy for a vehicle
// whose data has no such field.
function hasSpeedField(actor) {
  return Number.isFinite(actor?.system?.currentSpeed)
}

function speedOf(vehicle, actor = vehicleActor(vehicle)) {
  return hasSpeedField(actor) ? actor.system.currentSpeed : (Number(vehicle.speed) || 0)
}

/** The chase state of a vehicle with the Speed it really has now */
function withSpeed(vehicle) {
  return {
    ...vehicle, speed: speedOf(vehicle)
  }
}

/** Whoever is aboard: the vehicle, its driver when he drives it by hand, and the passengers the gamemaster added */
function aboard(vehicle, actor = vehicleActor(vehicle)) {
  const actors = []
  if (actor) actors.push(actor)
  if (actor?.system?.controlMode === "manual" && actor.system.vehicleOwner?.id) {
    const driver = SR5_EntityHelpers.getRealActorFromID(actor.system.vehicleOwner.id)
    if (driver) actors.push(driver)
  }
  for (const uuid of vehicle.passengers ?? []) {
    const passenger = fromUuidSync(uuid)
    if (passenger && !actors.includes(passenger)) actors.push(passenger)
  }
  return actors
}

/** The current user owns a vehicle of the chase, or rides in one */
function involves(state, user = game.user) {
  if (!state.active) return false
  return state.vehicles.some(v => aboard(v).some(a => a.testUserPermission?.(user, "OWNER")))
}

function logLine(state, text) {
  state.log = [...(state.log ?? []), {
    turn: state.turn, text
  }].slice(-LOG_SIZE)
}

export class SR5Chase {

  static register() {
    game.settings.register("sr5", CHASE_LEDGER, {
      scope: "world", config: false, type: Object, default: EMPTY(),
      onChange: () => SR5Chase.#changed(),
    })
  }

  static get state() {
    return readState()
  }

  static get canWrite() {
    return isActiveGM()
  }

  static involves(user) {
    return involves(readState(), user)
  }

  /**
   * Change the chase in the register's turn (gm-ledger.js), on the active gamemaster only. `mutate` gets a copy of the
   * latest state and changes it in place; returning false leaves the register untouched.
   */
  static async update(mutate) {
    if (!this.canWrite) {
      ui.notifications?.warn(game.i18n.localize("SR5.CHASE_OnlyGM"))
      return false
    }
    return updateLedger(CHASE_LEDGER, raw => {
      const state = {
        ...EMPTY(), ...raw
      }
      return mutate(state) === false ? null : state
    })
  }

  static start() {
    return this.update(state => {
      if (state.active) return false
      const combat = game.combat?.started ? game.combat : null
      Object.assign(state, EMPTY(), {
        active: true, id: foundry.utils.randomID(), combatId: combat?.id ?? "", round: combat?.round ?? 0,
        terrain: normalizeTerrain("", advancedDriving()),
      })
    })
  }

  static end() {
    return this.update(state => {
      if (!state.active) return false
      Object.assign(state, EMPTY())
    })
  }

  /** Add the selected tokens of vehicles and drones; a new pair starts at Medium range, the gamemaster moves it */
  static addTokens(tokens) {
    const vehicles = (tokens ?? []).filter(t => t.actor?.type === "actorDrone")
    if (!vehicles.length) {
      ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NoVehicleSelected"))
      return false
    }
    return this.update(state => {
      let added = 0
      for (const token of vehicles) {
        const tokenUuid = token.document?.uuid ?? token.uuid
        if (state.vehicles.some(v => v.tokenUuid === tokenUuid)) continue
        const id = foundry.utils.randomID()
        for (const other of state.vehicles) state.ranges[pairKey(id, other.id)] = "medium"
        state.vehicles.push({
          id, tokenUuid, actorUuid: token.actor.uuid, name: token.name ?? token.actor.name,
          img: token.document?.texture?.src ?? token.actor.img,
          kind: kindOfCategory(token.actor.system?.category, token.actor.system?.pilotSkill), role: state.vehicles.length ? "pursuer" : "pursued",
          // No Speed yet: the gamemaster gives the one it enters the chase with, freely (turnStartSpeed null)
          speed: 0, turnStartSpeed: null, controlled: false, outOfControl: false, uncontrolledTurns: 0,
          autopilot: false, passengers: [], ended: "",
        })
        added++
      }
      return added > 0
    })
  }

  static removeVehicle(id) {
    return this.update(state => {
      state.vehicles = state.vehicles.filter(v => v.id !== id)
      for (const key of Object.keys(state.ranges)) if (key.split("|").includes(id)) delete state.ranges[key]
      for (const key of Object.keys(state.lost)) if (key.split("|").includes(id)) delete state.lost[key]
    })
  }

  static addPassengers(id, tokens) {
    const actors = (tokens ?? []).map(t => t.actor).filter(a => a && a.type !== "actorDrone")
    if (!actors.length) {
      ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NoPassengerSelected"))
      return false
    }
    return this.update(state => {
      const vehicle = state.vehicles.find(v => v.id === id)
      if (!vehicle) return false
      // One vehicle at a time: a passenger who climbs in another leaves the first
      const uuids = actors.map(a => a.uuid)
      for (const v of state.vehicles) v.passengers = (v.passengers ?? []).filter(u => !uuids.includes(u))
      vehicle.passengers.push(...uuids)
    })
  }

  static removePassenger(id, uuid) {
    return this.update(state => {
      const vehicle = state.vehicles.find(v => v.id === id)
      if (!vehicle) return false
      vehicle.passengers = (vehicle.passengers ?? []).filter(u => u !== uuid)
    })
  }

  static async setVehicle(id, field, value) {
    let speed = null
    let actor = null
    const written = await this.update(state => {
      const vehicle = state.vehicles.find(v => v.id === id)
      if (!vehicle) return false
      if (field === "role" && ["pursuer", "pursued"].includes(value)) vehicle.role = value
      else if (field === "kind" && value in VEHICLE_KINDS) vehicle.kind = value
      else if (field === "speed") {
        speed = clampSpeed(value, this.speedBounds(vehicle))
        vehicle.speed = speed
        actor = vehicleActor(vehicle)
      } else return false
    })
    // The vehicle's own field follows, read by its qualities (R11)
    if (written && speed !== null && hasSpeedField(actor) && actor.system.currentSpeed !== speed) {
      await actor.update({
        "system.currentSpeed": speed
      })
    }
    return written
  }

  /** The Speeds a vehicle may take now; a vehicle just added takes any up to its Speed attribute */
  static speedBounds(vehicle) {
    const actor = vehicleActor(vehicle)
    const free = vehicle.turnStartSpeed === null || vehicle.turnStartSpeed === undefined
    return speedBounds(vehicle.turnStartSpeed, attribute(actor, "acceleration"), attribute(actor, "speed"),
      advancedDriving() && !free)
  }

  /** The pilot took the Control a Vehicle action this turn (checked), or the gamemaster takes it back (unchecked) */
  static setControlled(id, controlled) {
    return controlled ? this.markControlled(id) : this.update(state => {
      const vehicle = state.vehicles.find(v => v.id === id)
      if (!vehicle) return false
      vehicle.controlled = false
    })
  }

  static markControlled(id) {
    return this.update(state => {
      const index = state.vehicles.findIndex(v => v.id === id)
      if (index < 0) return false
      state.vehicles[index] = markControlled(state.vehicles[index])
    })
  }

  static setEnvironment(environment) {
    return this.update(state => {
      if (!["speed", "handling"].includes(environment)) return false
      state.environment = environment
    })
  }

  static setTerrain(terrain) {
    return this.update(state => {
      state.terrain = normalizeTerrain(terrain, advancedDriving())
      // Like a Glove's −2 dice last as long as its Terrain (R5 p. 178)
      for (const [id, key] of Object.entries(state.glove ?? {
      })) if (key !== state.terrain) delete state.glove[id]
    })
  }

  static setRange(a, b, range) {
    return this.update(state => {
      const pair = [state.vehicles.find(v => v.id === a), state.vehicles.find(v => v.id === b)]
      if (pair.some(v => !v)) return false
      if (!chaseRanges(advancedDriving(), pair.some(v => isAircraft(v.kind))).includes(range)) return false
      const key = pairKey(a, b)
      state.ranges[key] = range
      delete state.lost[key]
    })
  }

  /**
   * Open (positive steps) or close (negative) the range between two vehicles. Past the farthest range, the pursued one
   * gets away from the other (SR5 p. 205, R5 p. 177): the pair is marked lost.
   */
  static shiftPair(a, b, steps) {
    return this.update(state => {
      const pair = [state.vehicles.find(v => v.id === a), state.vehicles.find(v => v.id === b)]
      if (pair.some(v => !v)) return false
      const key = pairKey(a, b)
      if (state.lost[key]) return false
      const aircraft = pair.some(v => isAircraft(v.kind))
      const from = normalizeRange(state.ranges[key], advancedDriving(), aircraft)
      const {
        range, escaped
      } = shiftRange(from, steps, advancedDriving(), aircraft)
      state.ranges[key] = range
      if (escaped) {
        state.lost[key] = true
        const pursued = pair.find(v => v.role === "pursued") ?? pair[0]
        const pursuer = pair.find(v => v !== pursued)
        logLine(state, game.i18n.format("SR5.CHASE_LogEscaped", {
          pursued: pursued.name, pursuer: pursuer.name, range: game.i18n.localize(`SR5.CHASE_Range_${range}`)
        }))
      }
    })
  }

  /** Threshold of an advanced driving action by `initiatorId` against `targetId` (R5 p. 177), before the control rig */
  static threshold(initiatorId, targetId, controlRig = 0) {
    const state = readState()
    const vehicles = state.vehicles.filter(v => !v.ended).map(withSpeed)
    const initiator = vehicles.find(v => v.id === initiatorId)
    const target = vehicles.find(v => v.id === targetId)
    if (!initiator) return null
    return chaseThreshold({
      terrain: terrainValue(state.terrain, advancedDriving()), initiator, target, controlRig,
      fastest: isFastest(initiator, vehicles),
    })
  }

  /** The Terrain modifier a vehicle's action reads this turn: the chase's, changed by Sow Chaos or Clear the Path */
  static terrainFor(id, state = readState()) {
    return Math.max(0, terrainValue(state.terrain, advancedDriving()) + (Number(state.turnTerrain?.[id]) || 0))
  }

  // ---- Part 2: what the chase actions change (chase-roll.js) ----

  /** A failed test put the vehicle out of control (SR5 p. 203-205): −2 dice aboard until a control action */
  static markOutOfControl(id) {
    return this.update(state => {
      const vehicle = state.vehicles.find(v => v.id === id)
      if (!vehicle || vehicle.ended) return false
      Object.assign(vehicle, {
        controlled: false, outOfControl: true, autopilot: false,
        uncontrolledTurns: Math.max(1, Number(vehicle.uncontrolledTurns) || 0),
      })
      logLine(state, game.i18n.format("SR5.CHASE_LogLostControl", {
        name: vehicle.name
      }))
    })
  }

  /** A Speed an action imposes (PIT, Falling Leaf): from 0 to the Speed attribute, past the bounds of the turn */
  static async forceSpeed(id, value) {
    const vehicle = readState().vehicles.find(v => v.id === id)
    if (!vehicle) return false
    const actor = vehicleActor(vehicle)
    const speed = clampSpeed(value, {
      min: 0, max: speedCap(actor)
    })
    const written = await this.update(state => {
      const v = state.vehicles.find(x => x.id === id)
      if (!v) return false
      v.speed = speed
    })
    if (written && hasSpeedField(actor) && actor.system.currentSpeed !== speed) await actor.update({
      "system.currentSpeed": speed
    })
    return written
  }

  /** A stunt slows another vehicle (R5 p. 182): its Speed drops now and comes back at the end of the Combat Turn */
  static async slowForTurn(id, value) {
    const vehicle = readState().vehicles.find(v => v.id === id)
    if (!vehicle) return false
    const actor = vehicleActor(vehicle)
    const before = speedOf(vehicle, actor)
    if (!await this.forceSpeed(id, value)) return false
    const loss = before - speedOf(readState().vehicles.find(v => v.id === id) ?? vehicle, actor)
    if (!(loss > 0)) return true
    return this.update(state => {
      if (!state.vehicles.some(v => v.id === id)) return false
      state.turnSpeedLoss = {
        ...(state.turnSpeedLoss ?? {
        })
      }
      state.turnSpeedLoss[id] = (Number(state.turnSpeedLoss[id]) || 0) + loss
    })
  }

  /** The initiator gets behind the target (Quick Turn, Six Pack): it pursues, the target is pursued */
  static setRoles(pursuerId, pursuedId) {
    return this.update(state => {
      const pursuer = state.vehicles.find(v => v.id === pursuerId)
      const pursued = state.vehicles.find(v => v.id === pursuedId)
      if (!pursuer || !pursued) return false
      pursuer.role = "pursuer"
      pursued.role = "pursued"
    })
  }

  /** The pursued got away from the other vehicle (SR5 p. 205, R5 p. 177-178): the pair is marked lost */
  static escapePair(a, b) {
    return this.update(state => {
      const pair = [state.vehicles.find(v => v.id === a), state.vehicles.find(v => v.id === b)]
      if (pair.some(v => !v)) return false
      const key = pairKey(a, b)
      if (state.lost[key]) return false
      state.lost[key] = true
      const pursued = pair.find(v => v.role === "pursued") ?? pair[0]
      const pursuer = pair.find(v => v !== pursued)
      logLine(state, game.i18n.format("SR5.CHASE_LogEscaped", {
        pursued: pursued.name, pursuer: pursuer.name,
        range: game.i18n.localize(`SR5.CHASE_Range_${normalizeRange(state.ranges[key], advancedDriving(),
          pair.some(v => isAircraft(v.kind)))}`)
      }))
    })
  }

  /** A vehicle drops out of the chase (Falling Leaf, R5 p. 181) */
  static leaveChase(id, reason) {
    return this.update(state => {
      const vehicle = state.vehicles.find(v => v.id === id)
      if (!vehicle || vehicle.ended) return false
      vehicle.ended = reason
      vehicle.outOfControl = false
      logLine(state, game.i18n.format("SR5.CHASE_LogEnded", {
        name: vehicle.name, reason: game.i18n.localize(`SR5.CHASE_Ended_${reason}`)
      }))
    })
  }

  /** The Terrain of the turn for some vehicles (Sow Chaos +1, Clear the Path −net hits) */
  static addTurnTerrain(ids, delta) {
    return this.update(state => {
      if (!ids?.length || !delta) return false
      state.turnTerrain = {
        ...(state.turnTerrain ?? {
        })
      }
      for (const id of ids) state.turnTerrain[id] = (Number(state.turnTerrain[id]) || 0) + delta
    })
  }

  /** What a vehicle did this turn (drift, noCatchUp, <action>Used) */
  static setTurnFlag(id, flag) {
    return this.update(state => {
      state.turnFlags = {
        ...(state.turnFlags ?? {
        })
      }
      state.turnFlags[id] = {
        ...(state.turnFlags[id] ?? {
        }), [flag]: true
      }
    })
  }

  /** Failed a Like a Glove: −2 dice to Catch-Up while this Terrain lasts (R5 p. 178) */
  static setGlove(id, terrain) {
    return this.update(state => {
      state.glove = {
        ...(state.glove ?? {
        }), [id]: terrain
      }
    })
  }

  /** A line in the chase's log */
  static log(text) {
    return this.update(state => {
      logLine(state, text)
    })
  }

  /** The Handling a stunt gives (or takes from another vehicle) until the end of the Combat Turn (R5 p. 182) */
  static addTurnHandling(id, delta) {
    return this.update(state => {
      if (!state.vehicles.some(v => v.id === id) || !delta) return false
      state.turnHandling = {
        ...(state.turnHandling ?? {
        })
      }
      state.turnHandling[id] = (Number(state.turnHandling[id]) || 0) + delta
    })
  }

  /** Handling lost to a PIT (R5 p. 179), an effect on the vehicle while the chase lasts */
  static addHandlingLoss(id, value) {
    return this.update(state => {
      if (!state.vehicles.some(v => v.id === id) || !(value > 0)) return false
      state.handlingLoss = {
        ...(state.handlingLoss ?? {
        })
      }
      state.handlingLoss[id] = (Number(state.handlingLoss[id]) || 0) + value
    })
  }

  /**
   * End of a Combat Turn (SR5 p. 203, R5 p. 176): each vehicle not controlled goes out of control, then to its
   * autopilot; a vehicle destroyed, pinned or immobilized leaves the chase (R5 p. 175). The Speed of the turn becomes
   * the one the next turn starts from. The turn's events go to the chat.
   */
  static nextTurn() {
    const advanced = advancedDriving()
    let events = [], restored = []
    return this.update(state => {
      events = []
      restored = []
      for (const [index, vehicle] of state.vehicles.entries()) {
        if (vehicle.ended) continue
        const actor = vehicleActor(vehicle)
        // The Speed a stunt took for this turn comes back (R5 p. 182)
        const speed = speedOf(vehicle, actor)
        vehicle.speed = restoreTurnSpeed(speed, state.turnSpeedLoss?.[vehicle.id], speedCap(actor))
        if (vehicle.speed !== speed && hasSpeedField(actor)) restored.push({
          actor, speed: vehicle.speed
        })
        const {
          vehicle: next, event
        } = endOfTurn(vehicle, {
          hasAutopilot: attribute(actor, "pilot") > 0, onAutopilot: actor?.system?.controlMode === "autopilot"
        })
        next.turnStartSpeed = next.speed
        if (event) events.push(game.i18n.format(`SR5.CHASE_Log_${event}`, {
          name: vehicle.name
        }))
        const reason = chaseEndReason({
          // Hang On Baby: a point of Edge keeps it going this turn (R5 p. 178)
          monitorFull: monitorFull(actor?.system?.conditionMonitors?.condition) && !state.turnFlags?.[vehicle.id]?.holdOn,
          handling: actor ? attribute(actor, "handling") : undefined,
          speed: next.speed, acceleration: actor ? attribute(actor, "acceleration") : 1,
        }, advanced)
        if (reason) {
          next.ended = reason
          next.outOfControl = false
          events.push(game.i18n.format("SR5.CHASE_LogEnded", {
            name: vehicle.name, reason: game.i18n.localize(`SR5.CHASE_Ended_${reason}`)
          }))
        }
        state.vehicles[index] = next
      }
      for (const text of events) logLine(state, text)
      state.turn += 1
      // What lasted until the end of the turn (Sow Chaos, Clear the Path, Drift, Strafe)
      state.turnTerrain = {
      }
      state.turnFlags = {
      }
      state.turnHandling = {
      }
      state.turnSpeedLoss = {
      }
    }).then(async written => {
      if (written) for (const r of restored) await r.actor.update({
        "system.currentSpeed": r.speed
      })
      if (written && events.length) await ChatMessage.create({
        content: `<h3>${game.i18n.format("SR5.CHASE_ChatTitle", {
          turn: readState().turn - 1
        })}</h3><ul>${events.map(e => `<li>${e}</li>`).join("")}</ul>`,
      })
      return written
    })
  }

  // The register changed: the active gamemaster puts the −2 dice where they belong, every window follows, and a
  // player whose vehicle just entered a new chase sees it open
  static #changed() {
    const state = readState()
    // One sync at a time, each on the register as it is when its turn comes: an action writes the register several
    // times in a row, and two syncs running together each created the same effect
    if (isActiveGM()) SR5Chase.#syncing = SR5Chase.#syncing.then(async () => {
      const latest = readState()
      await syncOutOfControlEffects(latest)
      await syncHandlingEffects(latest)
    }).catch(e => console.error("SR5 | chase effects", e))
    const app = foundry.applications.instances.get(APP_ID)
    if (app?.rendered) app.render()
    else if (!game.user.isGM && state.active && state.id !== SR5Chase.#seen && involves(state)) {
      SR5Chase.#seen = state.id
      SR5ChaseApp.open()
    }
    ui.controls?.render?.()
  }

  // The chase already opened for this player, kept through a reload of the tab: closed once, the window does not come
  // back at each change of the register (relecture djamz.13, R1: « F5 n'y fait rien »)
  static get #seen() {
    try {
      return sessionStorage.getItem(SEEN_KEY) ?? ""
    } catch {
      return SR5Chase.#seenHere
    }
  }

  static set #seen(id) {
    SR5Chase.#seenHere = id
    try {
      sessionStorage.setItem(SEEN_KEY, id)
    } catch {
      // No storage (private window): this page only
    }
  }

  static #seenHere = ""

  /** The window shows this chase to a player: it counts as seen, whether it opened by itself or by her button */
  static markSeen() {
    const state = readState()
    if (state.active) SR5Chase.#seen = state.id
  }
  static #syncing = Promise.resolve()
}

/**
 * The −2 dice of a vehicle out of control (SR5 p. 203) are an effect on everyone aboard, put and taken off by the
 * active gamemaster. Everything is recomputed from the register: an effect whose vehicle is no longer out of control,
 * or no longer has that character aboard, goes.
 */
async function syncOutOfControlEffects(state) {
  const wanted = new Map()
  if (state.active) for (const vehicle of state.vehicles) {
    if (!vehicle.outOfControl || vehicle.ended) continue
    for (const actor of aboard(vehicle)) wanted.set(actor.uuid, {
      actor, vehicle
    })
  }
  // Every actor that may carry the effect: the world's, and the unlinked tokens of every scene
  const actors = new Map()
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
    if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor)
  }
  for (const {
    actor
  } of wanted.values()) actors.set(actor.uuid, actor)

  for (const actor of actors.values()) {
    const effects = actor.items?.filter(i => i.type === "itemEffect" && i.system?.type === CHASE_EFFECT) ?? []
    const want = wanted.get(actor.uuid)
    const keep = want ? effects.find(e => e.flags?.sr5?.chaseVehicle === want.vehicle.id) : null
    const stale = effects.filter(e => e !== keep)
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(e => e.id))
    if (want && !keep) await actor.createEmbeddedDocuments("Item", [{
      name: `${game.i18n.localize("SR5.CHASE_EffectName")} (${want.vehicle.name})`,
      type: "itemEffect",
      flags: {
        sr5: {
          chaseVehicle: want.vehicle.id
        }
      },
      "system.type": CHASE_EFFECT,
      "system.target": game.i18n.localize("SR5.GlobalPenalty"),
      "system.value": -2,
      "system.durationType": "permanent",
      "system.duration": "",
      "system.gameEffect": game.i18n.localize("SR5.CHASE_EffectGE"),
      "system.customEffects": {
        "0": {
          category: "penaltyTypes", target: "system.penalties.special.actual", type: "value", value: -2,
          forceAdd: true,
        }
      },
    }])
  }
}

/**
 * The Handling a PIT took (R5 p. 179) is an effect on the vehicle, kept in step with the register like the −2 dice: its
 * value follows, and it goes with the chase.
 */
async function syncHandlingEffects(state) {
  const wanted = new Map()
  if (state.active) for (const vehicle of state.vehicles) {
    const loss = Number(state.handlingLoss?.[vehicle.id]) || 0
    const actor = loss > 0 ? vehicleActor(vehicle) : null
    if (actor) wanted.set(actor.uuid, {
      actor, vehicle, loss
    })
  }
  const actors = new Map()
  for (const actor of game.actors ?? []) if (actor.type === "actorDrone") actors.set(actor.uuid, actor)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
    if (!token.actorLink && token.actor?.type === "actorDrone") actors.set(token.actor.uuid, token.actor)
  }
  for (const {
    actor
  } of wanted.values()) actors.set(actor.uuid, actor)

  for (const actor of actors.values()) {
    const effects = actor.items?.filter(i => i.type === "itemEffect" && i.system?.type === CHASE_HANDLING_EFFECT) ?? []
    const want = wanted.get(actor.uuid)
    const keep = want ? effects.find(e => e.system?.value === -want.loss) : null
    const stale = effects.filter(e => e !== keep)
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(e => e.id))
    if (want && !keep) await actor.createEmbeddedDocuments("Item", [{
      name: `${game.i18n.localize("SR5.CHASE_HandlingEffectName")} (−${want.loss})`,
      type: "itemEffect",
      "system.type": CHASE_HANDLING_EFFECT,
      "system.target": game.i18n.localize("SR5.VehicleStat_HandlingShort"),
      "system.value": -want.loss,
      "system.durationType": "permanent",
      "system.duration": "",
      "system.gameEffect": game.i18n.localize("SR5.CHASE_HandlingEffectGE"),
      "system.customEffects": {
        "0": {
          category: "vehicleAttributes", target: "system.attributes.handling.augmented", type: "value",
          value: -want.loss, forceAdd: true,
        },
        "1": {
          category: "vehicleAttributes", target: "system.attributes.handlingOffRoad.augmented", type: "value",
          value: -want.loss, forceAdd: true,
        },
      },
    }])
  }
}

/**
 * The chase window. The active gamemaster leads it; a player whose vehicle (or who herself) is in the chase reads it.
 */
export class SR5ChaseApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["sr5", "sr-application", "sr-chase"],
    position: {
      width: 920, height: 760
    },
    window: {
      title: "SR5.CHASE_Title", icon: "fas fa-car-side", resizable: true
    },
    actions: {
      start: () => SR5Chase.start(),
      end: SR5ChaseApp.#end,
      addTokens: () => SR5Chase.addTokens(canvas?.tokens?.controlled ?? []),
      removeVehicle: (event, target) => SR5Chase.removeVehicle(target.dataset.vehicle),
      addPassengers: (event, target) => SR5Chase.addPassengers(target.dataset.vehicle, canvas?.tokens?.controlled ?? []),
      removePassenger: (event, target) => SR5Chase.removePassenger(target.dataset.vehicle, target.dataset.uuid),
      nextTurn: () => SR5Chase.nextTurn(),
      closer: (event, target) => SR5Chase.shiftPair(target.dataset.a, target.dataset.b, -1),
      farther: (event, target) => SR5Chase.shiftPair(target.dataset.a, target.dataset.b, 1),
      resetPair: (event, target) => SR5Chase.setRange(target.dataset.a, target.dataset.b, target.dataset.range),
      // Part 2: the chase actions, rolled by the vehicle's owners (chase-roll.js)
      chaseAct: SR5ChaseApp.#act,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/chase.hbs", scrollable: ["", ".sr-chase-log"]
    }
  }

  static open() {
    if (!game.user.isGM && !SR5Chase.involves()) {
      return ui.notifications?.warn(game.i18n.localize("SR5.CHASE_NotInvolved"))
    }
    const app = foundry.applications.instances.get(APP_ID) ?? new SR5ChaseApp()
    return app.render({
      force: true
    })
  }

  static async #end() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.CHASE_End"
      },
      content: `<p>${game.i18n.localize("SR5.CHASE_EndConfirm")}</p>`,
    })
    if (confirmed) await SR5Chase.end()
  }

  static async #act(event, target) {
    // The row of the action, not the button: it carries data-vehicle too
    const row = target.closest(".sr-chase-act")
    const key = row?.querySelector("[name=chaseAction]")?.value
    const targetId = row?.querySelector("[name=chaseTarget]")?.value ?? ""
    // Part 3: the level of a stunt within the action (R5 p. 183), 0 for none
    const stunt = Number(row?.querySelector("[name=chaseStunt]")?.value) || 0
    if (!key) return
    const {
      launchChaseAction
    } = await import("./chase-roll.js")
    return launchChaseAction(target.dataset.vehicle, key, targetId, stunt)
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const state = readState()
    const advanced = advancedDriving()
    const terrain = normalizeTerrain(state.terrain, advanced)
    const prefix = advanced ? "SR5.CHASE_TerrainR5_" : "SR5.CHASE_TerrainBook_"

    context.canWrite = SR5Chase.canWrite
    context.active = state.active
    context.advanced = advanced
    context.turn = state.turn
    context.linkedCombat = !!(state.combatId && game.combats?.get(state.combatId)?.started)
    context.environments = ["speed", "handling"].map(key => ({
      key, label: `SR5.CHASE_Env_${key}`, selected: key === state.environment
    }))
    // Lot 5 (séance de DjamZ, 08/10): the rule set is chosen at the top of the window, and each terrain shows examples,
    // the book's (SR5 p. 201, R5 p. 175) and the table's own ones, which are ours
    context.ruleSets = [{
      key: "book", label: "SR5.CHASE_RulesOptBook", selected: !advanced
    }, {
      key: "r5", label: "SR5.CHASE_RulesOptR5", selected: advanced
    }]
    const examples = advanced ? "SR5.CHASE_TerrainR5" : "SR5.CHASE_TerrainBook"
    context.terrains = terrainList(advanced).map(t => ({
      key: t.key, label: game.i18n.localize(`${prefix}${t.key}`), value: t.value, selected: t.key === terrain,
      example: game.i18n.localize(`${examples}Short_${t.key}`),
    }))
    context.terrainExamples = {
      source: `${examples}In`,
      book: game.i18n.localize(`${examples}Book_${terrain}`),
      table: game.i18n.localize(`${examples}Table_${terrain}`),
    }
    context.kinds = Object.keys(VEHICLE_KINDS)
    const {
      windowActions
    } = await import("./chase-roll.js")

    context.vehicles = state.vehicles.map(v => {
      const actor = vehicleActor(v)
      const bounds = SR5Chase.speedBounds(v)
      const free = v.turnStartSpeed === null || v.turnStartSpeed === undefined
      const driver = actor?.system?.controlMode === "manual" && actor.system.vehicleOwner?.id ?
        SR5_EntityHelpers.getRealActorFromID(actor.system.vehicleOwner.id) : null
      let status = ""
      if (v.ended) status = `SR5.CHASE_Ended_${v.ended}`
      else if (v.autopilot) status = "SR5.CHASE_Autopilot"
      else if (v.outOfControl) status = v.uncontrolledTurns >= 2 ? "SR5.CHASE_Adrift" : "SR5.CHASE_OutOfControl"
      else if (actor?.system?.controlMode === "autopilot") status = "SR5.CHASE_OnAutopilot"
      return {
        ...v,
        speed: speedOf(v, actor),
        missing: !actor,
        maxSpeed: attribute(actor, "speed"),
        acceleration: attribute(actor, "acceleration"),
        handling: attribute(actor, "handling"),
        bounds,
        speedHint: advanced && !free ?
          game.i18n.format("SR5.CHASE_SpeedHint", {
            min: bounds.min, max: bounds.max, acceleration: attribute(actor, "acceleration")
          }) :
          game.i18n.format("SR5.CHASE_SpeedHintBook", {
            max: bounds.max
          }),
        status,
        warning: !!(v.outOfControl || v.ended),
        isPursued: v.role === "pursued",
        kinds: context.kinds.map(k => ({
          key: k, label: `SR5.CHASE_Kind_${k}`, selected: k === v.kind
        })),
        driver: driver?.name ?? "",
        passengerList: (v.passengers ?? []).map(uuid => ({
          uuid, name: fromUuidSync(uuid)?.name ?? "?"
        })),
        // The chase actions: for whoever owns the vehicle, the gamemaster included
        canAct: !v.ended && !!actor?.isOwner,
        ...windowActions(state, v),
      }
    })

    const pairs = []
    for (const [i, a] of state.vehicles.entries()) for (const b of state.vehicles.slice(i + 1)) {
      const key = pairKey(a.id, b.id)
      const range = normalizeRange(state.ranges[key], advanced, isAircraft(a.kind) || isAircraft(b.kind))
      const distance = rangeDistance(range, advanced, state.environment)
      pairs.push({
        a: a.id, b: b.id, nameA: a.name, nameB: b.name, range, lost: !!state.lost[key],
        rangeLabel: `SR5.CHASE_Range_${range}`,
        distance: distance ? `${distance[0]}-${distance[1]} m` : "",
        options: chaseRanges(advanced, isAircraft(a.kind) || isAircraft(b.kind)).map(r => ({
          key: r, label: `SR5.CHASE_Range_${r}`, selected: r === range
        })),
      })
    }
    context.pairs = pairs
    context.log = [...(state.log ?? [])].reverse()
    return context
  }

  _onRender(context, options) {
    super._onRender?.(context, options)
    if (!SR5Chase.canWrite) {
      if (!game.user.isGM) SR5Chase.markSeen()
      // A player still takes the chase actions of her own vehicle (part 2). The window's content only: the header's
      // buttons (close, the controls menu) stay hers, or she could not close the window (relecture djamz.13, R1)
      const content = this.element.querySelector(".window-content") ?? this.element
      for (const el of content.querySelectorAll("button, input, select")) el.disabled = !el.hasAttribute("data-chase-act")
      for (const el of content.querySelectorAll("a[data-action]")) el.classList.add("disabled")
      return
    }
    const on = (selector, handler) => {
      for (const el of this.element.querySelectorAll(selector)) el.addEventListener("change", () => handler(el))
    }
    // The world setting's own switch; its onChange renders the window again (utilitySystem.js)
    on("[name=ruleSet]", el => game.settings.set("sr5", ADVANCED_DRIVING_SETTING, el.value === "r5"))
    on("[name=environment]", el => SR5Chase.setEnvironment(el.value))
    on("[name=terrain]", el => SR5Chase.setTerrain(el.value))
    on("[data-field]", el => {
      const id = el.closest("[data-vehicle]")?.dataset.vehicle
      if (el.dataset.field === "controlled") return SR5Chase.setControlled(id, el.checked)
      return SR5Chase.setVehicle(id, el.dataset.field, el.value)
    })
    on("[data-pair-range]", el => SR5Chase.setRange(el.dataset.a, el.dataset.b, el.value))
  }
}

// The chase follows the encounter when one was running as it began: a new round ends the turn
async function onCombatRound(combat, changed) {
  if (!isActiveGM() || !("round" in (changed ?? {
  }))) return
  const state = readState()
  if (!state.active || state.combatId !== combat.id || !(Number(changed.round) > Number(state.round))) return
  await SR5Chase.update(s => {
    s.round = Number(changed.round)
  })
  await SR5Chase.nextTurn()
}

function onSceneControls(controls) {
  const tokens = controls?.tokens ?? controls?.token
  if (!tokens?.tools) return
  tokens.tools.sr5Chase = {
    name: "sr5Chase",
    title: "SR5.CHASE_Title",
    icon: "fas fa-car-side",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: !!game.user?.isGM || SR5Chase.involves(),
    onChange: () => SR5ChaseApp.open(),
  }
}

export function registerChaseHooks() {
  Hooks.on("updateCombat", (combat, changed) => onCombatRound(combat, changed).catch(e => console.error("SR5 | chase", e)))
  Hooks.on("getSceneControlButtons", onSceneControls)
  // An opposition card: the card it answers renders again for everyone, and its button goes (chaseButtonSpent, lot 5)
  Hooks.on("createChatMessage", message => {
    const chase = message?.flags?.sr5data?.chase
    const origin = chase?.mode === "oppose" && chase.originId ? game.messages?.get(chase.originId) : null
    if (origin) ui.chat?.updateMessage?.(origin)
  })
  // A vehicle's Speed or damage changed on its sheet: the open window follows
  Hooks.on("updateActor", actor => {
    if (actor?.type !== "actorDrone") return
    const app = foundry.applications.instances.get(APP_ID)
    if (app?.rendered) app.render()
  })
}

// What the chase actions read of a vehicle (chase-roll.js)
export {
  vehicleActor as chaseVehicleActor, attribute as chaseAttribute, speedOf as chaseSpeedOf, aboard as chaseAboard
}

export const _test = {
  aboard, involves, attribute, syncOutOfControlEffects, syncHandlingEffects, onCombatRound, readState
}
