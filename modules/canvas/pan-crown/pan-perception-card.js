// Matrix Perception in Foundry (couronne du PAN, lot 5): the button "Obtain information" of a Matrix Perception card,
// the choice of the pieces of information within the hits, the gamemaster's answer, the register of what the observer
// knows (flags.sr5.matrixIntel, read by the crown) and the private message to the observer. The rules are in
// pan-perception.js.
//
// Who writes: the active gamemaster, for every register (as the cards the gamemaster reads again, gm-ledger.js): the
// observer's client asks, the gamemaster's reads the card again from the chat log (cardOf), counts its hits again,
// spends it once (consume), and writes. Its window opens only for an answer she types (lot 8, DjamZ 07/10); a card a
// player wrote is then confirmed in the same window. The writes of one register wait for each other.
// Nothing here is hardened further against the console (decision of 06/10).

import {
  SR5
} from "../../config.js"
import {
  answerOf, checkChoices, entryOf, forgetHolder, intelEntry, intelFor, intelKey, intelUpdateData, perceptionBudget, PERCEPTION_ENTRIES, silentAround, sourceOf
} from "./pan-perception.js"
import {
  fileFacts, isFile
} from "../../system/matrix-files.js"
import {
  fileLastEditText
} from "../../rolls/roll-helpers/file-actions.js"
import {
  activeDeviceOf, buildPanGraph, idsOf
} from "./pan-graph.js"
import {
  PAN_SPOT_RANGE_METERS, isMatrixScene
} from "./pan-visibility.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  SR5_MiscellaneousHelpers
} from "../../rolls/roll-helpers/miscellaneous.js"
import {
  consumedKey, recountHits
} from "../../rolls/roll-helpers/socket-guard.js"

export const PERCEPTION_BUTTON = "matrixPerceptionInfo"
const POOL = "matrix.actions.matrixPerception.test.dicePool"
// The observer's dice are counted within the pool she rolled: the dice added in the roll dialog are not on the sheet
// (Anselmine 07/10: +3 miscellaneous dice, the gamemaster refused an honest card)
const ROLLED = {
  rolled: true
}
// The reasons the observer is told of, when the gamemaster refuses her request
export const PERCEPTION_REFUSALS = ["card", "owner", "empty", "tooMany", "unknown", "noTarget", "twice", "spent", "target", "gm"]

/* -------------------------------------------- */
/*  What the card aims at                        */
/* -------------------------------------------- */

const actorOf = (id, data) => id ? SR5_EntityHelpers.getRealActorFromID(id, data?.actorUuids) : null
const isDefenseCard = data => data?.test?.type === "matrixDefense"

/**
 * The icon a Matrix Perception card aims at: on the attacker's card, its target (and the device chosen on the crown,
 * lot 4); on the defense card of a silent icon, the defender and the device it defended with. The persona stands for
 * the master device (SR5 p. 236).
 * @return {{actor, item, uuid, holder, name, persona: Boolean}|null}
 */
export function perceptionTargetOf(data){
  const actor = isDefenseCard(data) ? actorOf(data.owner?.actorId, data) : (data?.target?.hasTarget ? actorOf(data.target.actorId, data) : null)
  if (!actor) return null
  const chosen = data.target?.itemUuid ? globalThis.fromUuidSync?.(data.target.itemUuid) ?? null : null
  const master = activeDeviceOf(actor)
  const item = chosen ?? master
  return {
    actor, item, uuid: item?.uuid ?? actor.uuid, holder: actor.uuid, name: item?.name ?? actor.name,
    persona: !chosen || chosen === master,
  }
}

// The unlinked tokens' actors of a scene: a deployed drone, a sprite, a door are often unlinked, and none of them is
// in game.actors (relecture)
export function tokenActorsOf(scene){
  return Array.from(scene?.tokens ?? []).map(document => document?.actor).filter(actor => actor?.isToken)
}

// The actors a graph looks a deployed drone up in: the unlinked tokens' first (the scene shown and the target's own),
// then the world's. The drone's base actor in game.actors carries the same links but not the token's own switches.
function actorsAround(target){
  const scenes = new Set([globalThis.canvas?.scene, target?.actor?.token?.parent].filter(Boolean))
  return [...[...scenes].flatMap(tokenActorsOf), ...Array.from(game.actors ?? [])]
}

/** The mode of the icon aimed at: offline, silent or active (pan-graph.js, Kill Code p. 39 for a slave) */
export function perceptionTargetMode(target){
  if (!target?.actor) return "active"
  const node = buildPanGraph(target.actor, {
    resolve: uuid => globalThis.fromUuidSync?.(uuid) ?? null, actors: actorsAround(target)
  }).nodes.find(n => n.uuid === target.uuid)
  if (node) return node.mode
  const system = target.actor.system ?? {
  }
  if (system.wirelessTurnedOn === false) return "offline"
  return system.matrix?.runningSilent ? "silent" : "active"
}

/** The button of the attacker's card (test-MatrixAction.js): the information at once, unless the icon runs silent */
export function perceptionNeedsDefense(data){
  const target = perceptionTargetOf(data)
  return !!target && perceptionTargetMode(target) === "silent"
}

/* -------------------------------------------- */
/*  The facts the answers read                   */
/* -------------------------------------------- */

function monitorOf(document){
  const monitor = document?.system?.conditionMonitors?.matrix
  const boxes = Number(monitor?.value) || 0
  if (!boxes) return null
  return {
    damage: Number(monitor.actual?.value) || 0, boxes
  }
}

function iconTypeOf(target){
  if (isFile(target.item)) return "file"
  const actor = target.actor
  if (actor.type === "actorDevice") {
    const type = actor.system?.matrix?.deviceType
    if (type === "host" || type === "ice") return type
    return "device"
  }
  if (!target.persona || actor.type === "actorDrone") return "device"
  return "persona"
}

/**
 * What the system knows of the icon aimed at (pan-perception.js, answerOf).
 * @param {Object} target   perceptionTargetOf
 * @param {Number|null} silentNearby
 */
export function perceptionFacts(target, silentNearby = null){
  const facts = {
    silentNearby
  }
  if (!target) return facts
  const {
    actor, item, persona
  } = target
  const matrix = actor.system?.matrix ?? {
  }
  facts.monitor = monitorOf(item) ?? monitorOf(actor)
  facts.deviceRating = Number(item?.system?.deviceRating ?? matrix.deviceRating) || 0
  facts.grid = matrix.userGrid ?? null
  facts.iconType = iconTypeOf(target)
  facts.marks = item ? (item.system?.marks ?? []) : (matrix.marks ?? [])
  facts.commcode = item?.type === "itemDevice" ? item.system?.commcode ?? "" : ""
  // A file has no rating nor monitor (SR5 p. 228, 230), runs no program; what it tells is its own (SR5 p. 237)
  if (isFile(item)) {
    facts.file = fileFacts(item)
    facts.monitor = null
    facts.deviceRating = 0
    facts.programs = []
    facts.attributes = {
      attack: null, sleaze: null, dataProcessing: null, firewall: null
    }
    facts.lastAction = null
    return facts
  }
  if (persona) {
    facts.programs = Array.from(actor.items ?? []).filter(i => i.type === "itemProgram" && i.system?.isActive).map(i => i.name)
    facts.attributes = Object.fromEntries(["attack", "sleaze", "dataProcessing", "firewall"].map(key => {
      const value = matrix.attributes?.[key]?.value
      return [key, typeof value === "number" ? value : null]
    }))
    facts.lastAction = actor.flags?.sr5?.lastMatrixAction ?? null
  } else {
    // A device runs no program, and only has Data Processing and Firewall (SR5 p. 227), at its Device Rating as the
    // system defends it (SR5 p. 234)
    facts.programs = []
    facts.attributes = {
      attack: null, sleaze: null, dataProcessing: facts.deviceRating, firewall: facts.deviceRating
    }
    facts.lastAction = null
  }
  return facts
}

// The token of an actor on the gamemaster's canvas
function tokenOfActor(actor){
  if (!actor) return null
  if (actor.isToken) return actor.token?.object ?? null
  return canvas?.tokens?.placeables?.find(t => t.document?.actorLink && t.actor?.id === actor.id) ?? null
}

/**
 * The silent icons within 100 m of the observer's antenna (SR5 p. 236), read on the scene's documents when the
 * gamemaster's canvas shows another scene (relecture): the observer's own scene for an unlinked token, otherwise the
 * scene the players are on. Null when the observer has no token there.
 * @param {Object} observer
 * @param {Object} scene        a Scene, with tokens (TokenDocuments: actor, actorLink, actorId, getCenterPoint) and grid
 * @param {Object} options
 * @param {Function} options.resolve      uuid -> item
 * @param {Array} [options.worldActors]   game.actors
 * @param {Number} [options.unit]         meters per unit of the scene
 * @param {Boolean} [options.inHost]      a scene marked as the inside of a host: no distance (A2)
 * @return {Number|null}
 */
export function silentNearbyOnScene(observer, scene, {
  resolve = () => null, worldActors = [], unit = 1, inHost = false
} = {
}){
  const tokens = Array.from(scene?.tokens ?? [])
  const own = observer?.isToken ? tokens.find(d => d === observer.token || d?.id === observer.token?.id) :
    tokens.find(d => d?.actorLink && d.actorId === observer?.id)
  if (!own) return null
  const actors = [...tokenActorsOf(scene), ...Array.from(worldActors ?? [])]
  const from = own.getCenterPoint()
  const nodes = []
  for (const other of tokens){
    if (!other?.actor || other === own) continue
    for (const node of buildPanGraph(other.actor, {
      resolve, actors
    }).nodes){
      // Where the device stands: its holder's token, a deployed drone's own, a sprite's technomancer (SR5 p. 256)
      const ids = node.droneId ? [node.droneId] : (node.anchorIds ?? node.holderIds ?? [])
      const at = idsOf(other.actor).some(id => ids.includes(id)) ? other : tokens.find(d => d?.actor && idsOf(d.actor).some(id => ids.includes(id)))
      node.distance = !at ? null : inHost ? 0 : scene.grid.measurePath([from, at.getCenterPoint()]).distance * unit
      nodes.push(node)
    }
  }
  return silentAround(nodes, idsOf(observer), PAN_SPOT_RANGE_METERS)
}

/** The silent icons within 100 m of the observer's antenna (SR5 p. 236), read on the gamemaster's canvas, or on the
 * documents of the observer's scene when the canvas shows another one: null when the observer has no token */
export async function silentNearbyOf(observer){
  const token = tokenOfActor(observer)
  if (!token) {
    const scene = observer?.isToken ? observer.token?.parent : (game.scenes?.active ?? null)
    return silentNearbyOnScene(observer, scene, {
      resolve: uuid => globalThis.fromUuidSync?.(uuid) ?? null, worldActors: game.actors ?? [],
      unit: SR5_SystemHelpers.getSceneUnitInMeters(scene), inHost: isMatrixScene(scene),
    })
  }
  const {
    getGraph
  } = await import("./pan-crown.js")
  const nodes = []
  for (const other of canvas.tokens.placeables){
    if (!other.actor || other === token) continue
    nodes.push(...(getGraph(other, {
      viewer: token
    })?.nodes ?? []))
  }
  return silentAround(nodes, idsOf(observer), PAN_SPOT_RANGE_METERS)
}

/* -------------------------------------------- */
/*  The words of an answer                       */
/* -------------------------------------------- */

const ICON_TYPES = {
  persona: "SR5.MatrixPerceptionIconPersona", device: "SR5.MatrixPerceptionIconDevice",
  host: "SR5.MatrixPerceptionIconHost", ice: "SR5.MatrixPerceptionIconIce", file: "SR5.MatrixPerceptionIconFile",
}

/** The label of an entry, with its attribute */
export function entryLabel(choice){
  const label = game.i18n.localize(`SR5.MatrixPerceptionInfo_${choice.key}`)
  return choice.param ? `${label} (${game.i18n.localize(SR5.matrixAttributes[choice.param])})` : label
}

function whenText(action){
  const combat = action.combatId ? game.combats?.get(action.combatId) : null
  if (combat && Number(action.round) > 0) return game.i18n.format("SR5.MatrixPerceptionWhenRound", {
    round: action.round
  })
  const seconds = Math.max(0, Math.round((game.time?.worldTime ?? 0) - (Number(action.worldTime) || 0)))
  if (seconds < 60) return game.i18n.format("SR5.MatrixPerceptionWhenSeconds", {
    seconds
  })
  return game.i18n.format("SR5.MatrixPerceptionWhenMinutes", {
    minutes: Math.round(seconds / 60)
  })
}

/** The words of one answer of answerOf */
export function answerText(answer){
  if (answer.missing) return game.i18n.localize(answer.key === "commcode" ? "SR5.MatrixPerceptionNoCommcode" :
    answer.key === "lastAction" ? "SR5.MatrixPerceptionNoAction" :
      answer.key === "attribute" ? "SR5.MatrixPerceptionNoAttribute" : "SR5.MatrixPerceptionUnknown")
  const value = answer.value
  switch (answer.key){
    case "spot":
      return game.i18n.localize("SR5.MatrixPerceptionSpotted")
    case "monitor":
      return game.i18n.format("SR5.MatrixPerceptionMonitor", value)
    case "programs":
      return value.length ? value.join(", ") : game.i18n.localize("SR5.MatrixPerceptionNoProgram")
    case "iconType":
      return game.i18n.localize(ICON_TYPES[value] ?? ICON_TYPES.device)
    case "grid":
      return game.i18n.localize(SR5.gridTypes[value] ?? value)
    case "lastAction":
      return `${game.i18n.localize(SR5.matrixRolledActions[value.key] ?? value.key)} (${whenText(value)})`
    case "fileEdited":
      // A text the gamemaster typed, or the file's own date (objet Fichier)
      return typeof value === "string" ? value : fileLastEditText(value)
    case "fileBomb":
      return typeof value === "string" ? value : game.i18n.localize(value ? "SR5.MatrixPerceptionFileBombYes" : "SR5.MatrixPerceptionFileBombNo")
    case "fileProtection":
      if (typeof value === "string") return value
      return value > 0 ? game.i18n.format("SR5.MatrixPerceptionFileProtected", {
        rating: value
      }) : game.i18n.localize("SR5.FileNotProtected")
    default:
      return String(value)
  }
}

/* -------------------------------------------- */
/*  The observer's choice                        */
/* -------------------------------------------- */

/** The pieces of information a card gives, as its owner sees it (the gamemaster counts again) */
export function cardBudget(data){
  if (isDefenseCard(data)) return perceptionBudget({
    hits: data.previousMessage?.hits, defenseHits: data.roll?.hits
  })
  return perceptionBudget({
    hits: data?.roll?.hits
  })
}

function hasTargetOn(data){
  return isDefenseCard(data) || !!data?.target?.hasTarget
}

/**
 * The button of the card: the observer chooses her pieces of information, within her hits, and asks.
 * @param {Object} data       the card (flags.sr5data)
 * @param {String} messageId
 */
export async function choosePerceptionInfo(data, messageId){
  const budget = cardBudget(data)
  const hasTarget = hasTargetOn(data)
  const target = hasTarget ? perceptionTargetOf(data) : null
  const esc = foundry.utils.escapeHTML
  const rows = []
  for (const entry of PERCEPTION_ENTRIES){
    if (entry.kind === "target" && !hasTarget) continue
    const params = entry.params ?? [null]
    for (const param of params){
      const choice = {
        key: entry.key, ...(param ? {
          param
        } : {
        })
      }
      const gm = sourceOf(entry, isFile(target?.item)) === "gm" ? ` <em>(${esc(game.i18n.localize("SR5.MatrixPerceptionAskGM"))})</em>` : ""
      rows.push(`<label class="sr5-perception-choice"><input type="checkbox" name="choice" value="${entry.key}|${param ?? ""}"><span>${esc(entryLabel(choice))}${gm}</span></label>`)
    }
  }
  const head = target ? game.i18n.format("SR5.MatrixPerceptionChooseOn", {
    name: esc(target.name), budget
  }) : game.i18n.format("SR5.MatrixPerceptionChooseAround", {
    budget
  })
  const picked = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("SR5.MatrixPerceptionInfoButton")
    },
    content: `<p>${head}</p><div class="sr5-perception-choices">${rows.join("")}</div>`,
    buttons: [{
      action: "ask", label: game.i18n.localize("SR5.MatrixPerceptionAsk"), default: true,
      callback: (event, button) => Array.from(button.form.querySelectorAll("input[name=choice]:checked")).map(input => {
        const [key, param] = input.value.split("|")
        return param ? {
          key, param
        } : {
          key
        }
      }),
    }, {
      action: "cancel", label: game.i18n.localize("SR5.Cancel")
    }],
    // Past the budget, the other boxes are greyed out
    render: (event, dialog) => {
      const element = dialog.element ?? event?.target?.element
      const boxes = Array.from(element?.querySelectorAll("input[name=choice]") ?? [])
      const sync = () => {
        const count = boxes.filter(b => b.checked).length
        for (const box of boxes) box.disabled = !box.checked && count >= budget
      }
      for (const box of boxes) box.addEventListener("change", sync)
      sync()
    },
    rejectClose: false,
  })
  if (!Array.isArray(picked)) return
  const checked = checkChoices(picked, budget, {
    hasTarget
  })
  if (!checked.ok) return void ui.notifications.warn(game.i18n.localize(`SR5.MatrixPerceptionRefused_${checked.reason}`))
  const request = {
    messageId, choices: checked.choices
  }
  if (game.user.isGM) return answerPerception(request, game.user)
  return SR5_SocketHandler.emitForGM("matrixPerceptionInfo", request)
}

/* -------------------------------------------- */
/*  The gamemaster's answer                      */
/* -------------------------------------------- */

/** The card behind a request, its observer and the pieces of information it gives, counted again: null if refused */
async function perceptionCard(messageId){
  const card = SR5_MiscellaneousHelpers.cardOf(messageId)
  const data = card?.data
  if (data?.test?.typeSub !== "matrixPerception") return null
  if (data.test.type === "matrixAction") {
    const hits = SR5_MiscellaneousHelpers.pushAwareHits(card, POOL, Number(data.limit?.value) || 0, ROLLED)
    if (hits === null) return null
    return {
      card, observer: card.roller, budget: perceptionBudget({
        hits
      }), hasTarget: !!data.target?.hasTarget
    }
  }
  if (!isDefenseCard(data)) return null
  // The defense card of a silent icon, and the attacker's card it answers, rolled by the observer it names
  const attack = SR5_MiscellaneousHelpers.cardOf(data.previousMessage?.messageId)
  const observer = actorOf(data.previousMessage?.actorId, data)
  if (!attack || !observer || attack.roller?.uuid !== observer.uuid) return null
  const hits = SR5_MiscellaneousHelpers.pushAwareHits(attack, POOL, Number(attack.data.limit?.value) || 0, ROLLED)
  const {
    SR5_MarkHelpers
  } = await import("../../rolls/roll-helpers/mark.js")
  const defenseHits = card.byGM ? Math.max(0, Number(data.roll?.hits) || 0) : recountHits(data.roll?.r, await SR5_MarkHelpers.defenseCap(card))
  if (hits === null || defenseHits === null) return null
  return {
    card: {
      ...card, byGM: card.byGM && attack.byGM
    }, observer, budget: perceptionBudget({
      hits, defenseHits
    }), hasTarget: true
  }
}

/**
 * The gamemaster's window: the answers worked out, a field for each answer she types (prefilled by a provider), and
 * her say on a card a player wrote. Returns the typed answers, or null when she refuses.
 */
async function gmAnswers({
  observer, target, choices, typed, sender, confirm
}){
  const esc = foundry.utils.escapeHTML
  const facts = target?.facts ?? {
  }
  const rows = choices.map(choice => {
    const entry = entryOf(choice.key)
    if (sourceOf(entry, !!facts.file) === "gm") return `<label class="sr5-perception-answer">${esc(entryLabel(choice))}
      <input type="text" name="${choice.key}" value="${esc(typed[choice.key] ?? "")}"></label>`
    return `<div class="sr5-perception-answer">${esc(entryLabel(choice))}${game.i18n.localize("SR5.Colons")} ${esc(answerText(answerOf(choice, facts, typed)))}</div>`
  })
  const head = game.i18n.format(confirm ? "SR5.MatrixPerceptionGMConfirm" : "SR5.MatrixPerceptionGMType", {
    user: esc(sender?.name ?? "?"), observer: esc(observer.name), target: esc(target?.name ?? game.i18n.localize("SR5.MatrixPerceptionAround"))
  })
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("SR5.MatrixPerceptionGMTitle")
    },
    content: `<p>${head}</p>${rows.join("")}`,
    buttons: [{
      action: "send", label: game.i18n.localize("SR5.MatrixPerceptionGMSend"), default: true,
      callback: (event, button) => Object.fromEntries(Array.from(button.form.querySelectorAll("input[type=text]")).map(i => [i.name, i.value])),
    }, {
      action: "refuse", label: game.i18n.localize("SR5.MatrixPerceptionGMRefuse")
    }],
    rejectClose: false,
  })
  return result && typeof result === "object" ? {
    ...typed, ...result
  } : null
}

/**
 * Whether the gamemaster's window must open: a piece of information only she can answer (files, "in this host"),
 * which no provider answered.
 * @param {Array<{key: String}>} choices
 * @param {Object} typed   the answers already given, by key
 */
export function needsGMWindow(choices, typed = {
}, targetIsFile = false){
  return (choices ?? []).some(c => sourceOf(entryOf(c.key), targetIsFile) === "gm" && !String(typed?.[c.key] ?? "").trim())
}

/**
 * Answer a request, on the active gamemaster's client.
 * @param {{messageId: String, choices: Array}} request
 * @param {User} sender
 */
export async function answerPerception(request, sender){
  // Never a silent refusal: the observer's player is told why, in a few words
  const refuse = (reason, budget = null) => {
    SR5_SystemHelpers.srLog(1, `Matrix Perception refused from ${sender?.name}: ${reason}`, request)
    tellRefusal(sender, reason, budget)
    return false
  }
  const found = await perceptionCard(request?.messageId)
  if (!found) return refuse("card")
  const {
    card, observer, budget, hasTarget
  } = found
  if (!sender?.isGM && !observer.testUserPermission(sender, "OWNER")) return refuse("owner")
  const checked = checkChoices(request.choices, budget, {
    hasTarget
  })
  if (!checked.ok) return refuse(checked.reason, budget)
  const key = consumedKey(card.id, PERCEPTION_BUTTON)
  if (SR5_MiscellaneousHelpers.isConsumed(key)) return refuse("spent")

  const target = hasTarget ? perceptionTargetOf(card.data) : null
  if (hasTarget && !target) return refuse("target")
  const around = checked.choices.some(c => c.key === "silentNearby") ? await silentNearbyOf(observer) : null
  if (target) target.facts = perceptionFacts(target, around)
  const facts = target?.facts ?? perceptionFacts(null, around)

  // A provider (the module Matrice v1) answers what the system cannot: files, "in this host"
  const context = {
    observer, target: target ? {
      actor: target.actor, item: target.item, uuid: target.uuid, name: target.name
    } : null, choices: checked.choices, answers: {
    }
  }
  Hooks.callAll("sr5.matrixPerceptionInfo", context)
  let typed = {
    ...context.answers
  }
  // The window opens only when an answer is the gamemaster's to type (DjamZ, 07/10, lot 8); the answers the system
  // works out leave at once, still written by the active gamemaster after the card is read again and counted
  if (needsGMWindow(checked.choices, typed, !!facts.file)) {
    typed = await gmAnswers({
      observer, target: target ? {
        ...target, facts
      } : {
        facts
      }, choices: checked.choices, typed, sender, confirm: !card.byGM
    })
    // A refusal is not kept: the button stays, and its next click asks again
    if (!typed) return refuse("gm")
  }
  if (!(await SR5_MiscellaneousHelpers.consume(key))) return refuse("spent")

  const answers = checked.choices.map(choice => answerOf(choice, facts, typed))
  if (target) await writeIntel(observer, intel => ({
    ...intel, [intelKey(target.uuid)]: intelEntry(intelFor(intel, target.uuid), answers, {
      uuid: target.uuid, holder: target.holder, name: target.name, time: game.time?.worldTime ?? 0
    })
  }))
  await whisperAnswers(observer, target, answers)
  const {
    SR5_RollMessage
  } = await import("../../rolls/roll-message.js")
  await SR5_RollMessage.updateChatButton(card.id, PERCEPTION_BUTTON)
  return true
}

/** The private message to the observer: her owners and the gamemasters read it, nobody else */
async function whisperAnswers(observer, target, answers){
  const esc = foundry.utils.escapeHTML
  const users = (game.users ?? []).filter(u => u.isGM || observer.testUserPermission(u, "OWNER")).map(u => u.id)
  const items = answers.map(answer => `<li><strong>${esc(entryLabel(answer))}</strong>${game.i18n.localize("SR5.Colons")} ${esc(answerText(answer))}</li>`)
  const title = target ? game.i18n.format("SR5.MatrixPerceptionMessageOn", {
    observer: esc(observer.name), target: esc(target.name)
  }) : game.i18n.format("SR5.MatrixPerceptionMessageAround", {
    observer: esc(observer.name)
  })
  return ChatMessage.create({
    content: `<div class="sr5-perception-message"><h4>${title}</h4><ul>${items.join("")}</ul></div>`,
    whisper: users,
    speaker: {
      alias: game.i18n.localize("SR5.MatrixActionMatrixPerception")
    },
  })
}

/* -------------------------------------------- */
/*  The register, written by the gamemaster      */
/* -------------------------------------------- */

const queues = new Map()

/**
 * Change an observer's register in its turn (the pattern of gm-ledger.js: two answers arriving together both stay).
 * @param {Actor} observer
 * @param {(intel: Object) => Object|null} change   receives a copy of the latest register, returns the next one
 */
export function writeIntel(observer, change){
  const id = observer?.uuid
  if (!id) return Promise.resolve(false)
  const run = async () => {
    const actor = globalThis.fromUuidSync?.(id) ?? observer
    const before = foundry.utils.deepClone(actor.flags?.sr5?.matrixIntel ?? {
    })
    const after = await change(foundry.utils.deepClone(before))
    const data = after ? intelUpdateData(before, after) : null
    if (!data) return false
    await actor.update(data)
    return true
  }
  const job = (queues.get(id) ?? Promise.resolve()).then(run)
  queues.set(id, job.catch(() => {}))
  return job
}

// Every actor that may hold a register: the world's, and the unlinked tokens of every scene
function registers(){
  const actors = [...(game.actors ?? [])]
  for (const scene of game.scenes ?? []){
    for (const token of scene.tokens ?? []){
      if (!token.actorLink && token.actor) actors.push(token.actor)
    }
  }
  return actors.filter(a => a.flags?.sr5?.matrixIntel && Object.keys(a.flags.sr5.matrixIntel).length)
}

/**
 * Lose sight of icons (SR5 p. 236), on the gamemaster's client.
 * @param {Object} data
 * @param {String} data.holder       the uuid of the actor whose icons are lost: it rebooted or jacked out
 * @param {String} [data.observer]   only from this observer's register (Hide beat her); without it, from everyone's
 * @param {Boolean} [data.clearOwn]  the holder also forgets everything she had spotted (her own reboot)
 */
export async function forgetIntel({
  holder, observer = null, clearOwn = false
} = {
}){
  if (!holder) return
  const observers = observer ? [globalThis.fromUuidSync?.(observer)].filter(Boolean) : registers()
  for (const actor of observers){
    if (!Object.values(actor.flags?.sr5?.matrixIntel ?? {
    }).some(e => e?.holder === holder)) continue
    await writeIntel(actor, intel => forgetHolder(intel, holder))
  }
  if (clearOwn) {
    const own = globalThis.fromUuidSync?.(holder)
    if (own?.flags?.sr5?.matrixIntel) await writeIntel(own, () => ({
    }))
  }
}

/** Ask the gamemaster to lose sight of icons: an actor's owner may make the table forget her own icons, or forget
 * what she spotted herself */
export async function requestForgetIntel(data){
  // Nothing to forget: no message to the gamemaster at every reboot
  const holds = actor => Object.values(actor.flags?.sr5?.matrixIntel ?? {
  }).some(e => e?.holder === data?.holder)
  const own = data?.clearOwn ? globalThis.fromUuidSync?.(data.holder) : null
  if (!registers().some(holds) && !Object.keys(own?.flags?.sr5?.matrixIntel ?? {
  }).length) return
  if (game.user.isGM) return forgetIntel(data)
  return SR5_SocketHandler.emitForGM("matrixIntelForget", data)
}

/* -------------------------------------------- */
/*  The sockets, on the gamemaster's client      */
/* -------------------------------------------- */

function activeGM(){
  return game.users?.activeGM?.id === game.user?.id
}

export async function _socketPerceptionInfo(message, senderId){
  if (!activeGM()) return false
  return answerPerception(message?.data ?? {
  }, game.users.get(senderId))
}

/** The words of a refusal: the reason, and the hits the gamemaster counted when they were too few */
export function refusalText(reason, budget = null){
  const why = game.i18n.localize(`SR5.MatrixPerceptionRefused_${reason}`)
  const counted = reason === "tooMany" && Number.isFinite(budget) ? ` ${game.i18n.format("SR5.MatrixPerceptionRefusedCounted", {
    budget
  })}` : ""
  return game.i18n.format("SR5.MatrixPerceptionRefusedByGM", {
    reason: why
  }) + counted
}

/** Tell the player who asked why the gamemaster refused: on her own screen, or here when she is the gamemaster */
export function tellRefusal(sender, reason, budget = null){
  if (!sender) return
  if (sender.id === game.user?.id) return void ui.notifications.warn(refusalText(reason, budget))
  return SR5_SocketHandler.emitForPlayer("matrixPerceptionRefused", {
    reason, budget
  }, sender.id)
}

// Only a gamemaster sends it, and only a reason of the list: no other text reaches a player's screen
export function _socketPerceptionRefused(message, senderId){
  const data = message?.data ?? {
  }
  if (!game.users.get(senderId)?.isGM || !PERCEPTION_REFUSALS.includes(data.reason)) return SR5_SystemHelpers.srLog(1, `matrixPerceptionRefused refused from ${senderId}`, data)
  const budget = Number.isFinite(data.budget) ? Math.max(0, Math.floor(data.budget)) : null
  ui.notifications.warn(refusalText(data.reason, budget))
}

export async function _socketForgetIntel(message, senderId){
  if (!activeGM()) return false
  const sender = game.users.get(senderId)
  const data = message?.data ?? {
  }
  // Losing sight takes nothing from anyone: the owner of the actor named asks it
  const named = globalThis.fromUuidSync?.(data.observer ?? data.holder)
  if (!sender || !named?.testUserPermission(sender, "OWNER")) return SR5_SystemHelpers.srLog(1, `matrixIntelForget refused from ${sender?.name ?? senderId}`, data)
  return forgetIntel(data)
}

/* -------------------------------------------- */
/*  The last Matrix action of an icon            */
/* -------------------------------------------- */

/**
 * Write the last Matrix action of the acting persona (SR5 p. 237: "the last Matrix action of an icon, and when"),
 * by its owner as the action is launched. Only the actions launched after lot 5 are known.
 * @param {Actor} actor
 * @param {String} key   a key of matrix.actions
 */
export async function recordLastMatrixAction(actor, key){
  if (!actor?.isOwner || !key || typeof actor.setFlag !== "function") return
  await actor.setFlag("sr5", "lastMatrixAction", {
    key, worldTime: game.time?.worldTime ?? 0, round: game.combat?.started ? game.combat.round : null,
    combatId: game.combat?.started ? game.combat.id : null,
  })
}
