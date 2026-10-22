// The messaging and the contacts for the modules (API pour CONTACTS, landing-metroplexes-sr5): game.sr5.commcode and
// game.sr5.contacts. A module calls these instead of importing the system's files by their path, which may move.
// Every request still goes through the active gamemaster (commcode-traffic.js): a refusal is a notification on the
// asking user's screen, as from the window. Nothing here is hardened against the console (decision of 06/10).

import {
  readTraffic, requestCommcode, directoryFlagOf, setDirectory, openFor
} from "./commcode-traffic.js"
import {
  directoryOf, generateCommcode, normalizeCommcode, withContact
} from "../system/commcode-rules.js"
import {
  worldCommcodes
} from "./commcode-default.js"
import {
  contactsOfCommcode
} from "./contact-commcode.js"
import {
  FAVOR_ACTIONS, onFavorAction
} from "./contact-favors.js"

const copy = value => foundry.utils.deepClone(value ?? null)
const openWindow = async () => (await import("./commcode-window.js")).SR5CommcodeWindow.openMine()

/** The commcode an actor answers on (commcode-window.js): its active device's, or its first device's that has one */
async function commcodeOfActor(actor){
  return (await import("./commcode-window.js")).commcodeOfActor(actor)
}

/**
 * game.sr5.commcode:
 * - open(): the user's window (the gamemaster's: the whole traffic); openDevice(deviceUuid): a device's window;
 *   cipherTool(): the gamemaster's cipher tool (lot 39);
 * - call({deviceUuid, to, text}) and message({deviceUuid, to, text, key}): from a device its user owns. The
 *   gamemaster may speak for a commcode no sheet carries instead: {asCommcode, asName, to, text};
 * - answer(entryId, {side}), refuse(entryId, {side}): side "to" (default) is the called end, "from" the caller. The
 *   gamemaster answers or refuses for a commcode no device carries (a contact); hangup(entryId, {side}) and
 *   say(entryId, text, {side}), a line of an answered call: the user's end when no side is given;
 * - entries(): a copy of the register's entries {id, kind, status, text, sentAt, from, to: {commcode, devices}};
 *   unanswered(): the calls ringing towards a commcode no device carries, those the gamemaster answers;
 * - directory.get(actor), directory.set(actor, list), directory.add(actor, {name, commcode}): the character's
 *   directory [{id, name, commcode, key}] (its owner writes it); add() renames a commcode already listed;
 * - commcodeOf(actor): the commcode the actor answers on, "" when none; generate(): a commcode no one in the
 *   world has yet (devices and contacts).
 */
export const commcodeApi = () => Object.freeze({
  open: () => openWindow(),
  openDevice: uuid => openFor(uuid),
  cipherTool: () => import("./commcode-cipher-tool.js").then(({
    SR5CipherTool
  }) => SR5CipherTool.open()),
  call: ({
    deviceUuid, to, text = "", asCommcode, asName
  } = {
  }) => requestCommcode("send", {
    deviceUuid, to, text, asCommcode, asName, kind: "call"
  }),
  message: ({
    deviceUuid, to, text = "", key, asCommcode, asName
  } = {
  }) => requestCommcode("send", {
    deviceUuid, to, text, key, asCommcode, asName, kind: "message"
  }),
  answer: (entryId, {
    side = "to"
  } = {
  }) => requestCommcode("answer", {
    entryId, side
  }),
  refuse: (entryId, {
    side = "to"
  } = {
  }) => requestCommcode("refuse", {
    entryId, side
  }),
  hangup: (entryId, {
    side
  } = {
  }) => requestCommcode("hangup", {
    entryId, side
  }),
  say: (entryId, text, {
    side
  } = {
  }) => requestCommcode("line", {
    entryId, text, side
  }),
  entries: () => copy(readTraffic().entries),
  unanswered: () => copy(readTraffic().entries.filter(e => e.kind === "call" && e.status === "ringing" && !(e.to?.devices ?? []).length)),
  directory: Object.freeze({
    get: actor => directoryOf(directoryFlagOf(actor)),
    set: (actor, list) => setDirectory(actor, directoryOf(list)),
    add: (actor, contact) => setDirectory(actor, withContact(directoryOf(directoryFlagOf(actor)), contact, () => foundry.utils.randomID())),
  }),
  commcodeOf: actor => commcodeOfActor(actor),
  generate: () => generateCommcode(worldCommcodes()) ?? "",
})

/** The grunt made from a contact (isCreated): the actor whose creator is the contact's item and its character */
function gruntOf(item){
  const owner = item?.parent
  if (!owner) return null
  return Array.from(game.actors ?? []).find(a => a.type === "actorGrunt" && a.system?.creatorItemId === item.id &&
    a.system?.creatorId === owner.id) ?? null
}

/**
 * The commcode a contact answers on: that of the grunt made from it, else its own (system.commcode). With create,
 * a contact that has none gets one, written by its owner (a user who cannot write it gets "").
 */
export async function contactCommcodeOf(item, {
  create = false
} = {
}){
  if (item?.type !== "itemContact") return ""
  const grunt = gruntOf(item)
  if (grunt) {
    const code = await commcodeOfActor(grunt)
    if (code) return code
  }
  const own = String(item.system?.commcode ?? "").trim()
  if (normalizeCommcode(own) || !create || !item.isOwner) return own
  const code = generateCommcode(worldCommcodes())
  if (!code) return ""
  await item.update({
    "system.commcode": code
  })
  return code
}

/**
 * game.sr5.contacts:
 * - favor(item, kind): a favor action of the contact's sheet (Run Faster p. 170-172), its owner only; kind is one
 *   of favorActions ("ask" by default);
 * - commcodeOf(item, {create}): the commcode the contact answers on (contactCommcodeOf);
 * - ofCommcode(commcode): the contacts that carry this commcode (the items themselves, read only).
 */
export const contactsApi = () => Object.freeze({
  favorActions: Object.freeze([...FAVOR_ACTIONS]),
  favor: (item, kind = "ask") => onFavorAction(item, kind),
  commcodeOf: (item, options) => contactCommcodeOf(item, options),
  ofCommcode: commcode => contactsOfCommcode(commcode),
})
