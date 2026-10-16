// Messages and calls between commcodes (lot 14), as plain rules with no Foundry in them so that tests can read them.
// The register, the gamemaster's answers and the window are in interface/commcode-traffic.js and commcode-window.js.
//
// What the book says, and where:
// - SR5 p. 215: a commcode is the address, number and handle that identify someone in a communication.
// - SR5 p. 241, Send Message (Simple Action, a Data Processing action, no test): a message no longer than a sentence,
//   an image or a file, to a user whose commcode the character knows; through a DNI, even in AR, about a paragraph.
//   The same action opens a live feed (a call) to one or more users.
// - SR5 p. 241, Snoop (GE + Intuition [Sleaze] v. Logic + Firewall, 1 mark): the hacker intercepts the traffic sent
//   from or to the target as long as she keeps a mark on it; the sidebar: in a call, she notes the correspondent and
//   may look for him with a Matrix Perception (SR5 p. 242).
// - SR5 p. 246, Trace Icon (2 marks): the physical location of the target, known as long as one mark stays.
// - SR5 p. 424: a device whose wireless is off is out of the Matrix; SR5 p. 443: a jammer "bloque les communications
//   sans fil"; SR5 p. 232: a Faraday cage leaves no signal (not drawn by the system).
// - Kill Code p. 43, Haywire: "il est impossible de passer des appels" (the system does not keep that state: the
//   gamemaster plays it).
// The book does not say what becomes of a message sent to a device out of reach: it waits for the device and is
// delivered when it comes back (a call is not: nobody answers). A choice of the author, said in the wiki.

export const COMMCODE_SETTING = "sr5CommcodeTraffic"
// The register keeps the latest entries; an open call or a message still waiting is never dropped
export const COMMCODE_MAX_ENTRIES = 400
// A technical bound on one message, far above a paragraph: the book bounds the length by the action, not by a count
export const COMMCODE_MAX_TEXT = 2000

export const CALL_OPEN = ["ringing", "active"]
// The states of an entry
// message: "delivered" | "pending" (the recipient's device is out of reach)
// call: "ringing" | "active" | "ended" | "refused" | "missed" | "unreachable" | "cut"
export const DEVICE_STATES = ["online", "offline", "jammed", "bricked"]

/** A commcode as compared: trimmed, spaces folded, case ignored */
export function normalizeCommcode(value){
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

export function sameCommcode(a, b){
  const left = normalizeCommcode(a)
  return !!left && left === normalizeCommcode(b)
}

/**
 * Can a device send and receive: out of the Matrix with its wireless off (SR5 p. 424), its Matrix monitor full
 * (bricked, SR5 p. 229), or jammed (SR5 p. 443). A device running silent still talks (SR5 p. 236).
 * @param {{mode: String, jammed: Boolean, bricked: Boolean}} state  mode as pan-device-mode.js gives it
 * @return {String} one of DEVICE_STATES
 */
export function deviceReachability({
  mode = "active", jammed = false, bricked = false
} = {
}){
  if (mode === "offline") return "offline"
  if (bricked) return "bricked"
  if (jammed) return "jammed"
  return "online"
}

/** An empty register, or the register read back in its shape */
export function trafficOf(raw){
  return {
    entries: Array.isArray(raw?.entries) ? raw.entries.filter(e => e?.id) : [],
    interceptions: Array.isArray(raw?.interceptions) ? raw.interceptions.filter(i => i?.id) : [],
  }
}

export function isOpen(entry){
  return entry?.kind === "call" && CALL_OPEN.includes(entry.status)
}

/** Keeps the latest entries; the open calls and the pending messages stay whatever their age */
export function pruneEntries(entries, max = COMMCODE_MAX_ENTRIES){
  if (entries.length <= max) return entries
  const keep = new Set(entries.filter(e => isOpen(e) || e.status === "pending").map(e => e.id))
  const sorted = [...entries].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))
  for (const entry of sorted) {
    if (keep.size >= max) break
    keep.add(entry.id)
  }
  return entries.filter(e => keep.has(e.id))
}

/** Does the entry leave from, or arrive at, this commcode */
export function involves(entry, commcode){
  return sameCommcode(entry?.from?.commcode, commcode) || sameCommcode(entry?.to?.commcode, commcode)
}

/** What the recipient's side sees of an entry: nothing of a message still waiting, nor of a call that never rang */
export function seenByRecipient(entry){
  if (entry?.kind === "call") return entry.status !== "unreachable"
  return entry?.status === "delivered"
}

/**
 * The entries a device sees: all those it sent, and those it received once they reached it.
 * @param {Array} entries
 * @param {String} commcode   the device's
 */
export function entriesOfDevice(entries, commcode){
  if (!normalizeCommcode(commcode)) return []
  return entries.filter(e => sameCommcode(e.from?.commcode, commcode) || (sameCommcode(e.to?.commcode, commcode) && seenByRecipient(e)))
}

/** The other end of an entry, seen from this commcode */
export function counterpartOf(entry, commcode){
  return sameCommcode(entry?.from?.commcode, commcode) ? entry?.to?.commcode : entry?.from?.commcode
}

/**
 * The conversations of a device, one per counterpart, the latest first.
 * @param {Array} entries        entriesOfDevice
 * @param {String} commcode      the device's
 * @param {Number} [readUntil]   the time the user last read them: what came in after is unread
 * @return {Array<{key, commcode, entries, last, unread}>}
 */
export function threadsOf(entries, commcode, readUntil = 0){
  const threads = new Map()
  for (const entry of entries) {
    const other = counterpartOf(entry, commcode)
    const key = normalizeCommcode(other)
    if (!key) continue
    if (!threads.has(key)) threads.set(key, {
      key, commcode: other, entries: [], last: 0, unread: 0
    })
    const thread = threads.get(key)
    thread.entries.push(entry)
    const at = entry.deliveredAt ?? entry.sentAt ?? 0
    thread.last = Math.max(thread.last, at)
    if (!sameCommcode(entry.from?.commcode, commcode) && at > readUntil) thread.unread++
  }
  for (const thread of threads.values()) thread.entries.sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0))
  return [...threads.values()].sort((a, b) => b.last - a.last)
}

/**
 * The next state of a call. `side` is the end that acts: "from" (the caller) or "to" (the called).
 * @param {String} status
 * @param {String} event   "answer", "refuse", "hangup" or "cut" (a device went out of reach)
 * @param {String} side
 * @return {String|null}   null when the event does not apply
 */
export function nextCallStatus(status, event, side){
  if (status === "ringing") {
    if (event === "answer" && side === "to") return "active"
    if (event === "refuse" && side === "to") return "refused"
    if (event === "hangup") return side === "from" ? "missed" : "refused"
    if (event === "cut") return "missed"
    return null
  }
  if (status === "active" && (event === "hangup" || event === "cut")) return event === "cut" ? "cut" : "ended"
  return null
}

/**
 * The traffic a snooper intercepts: the entries sent from or to her target since her Snoop, while she keeps her mark
 * (SR5 p. 241). A message still waiting has not left the sender: it is intercepted on the sender's side only.
 * @param {Object} traffic        trafficOf
 * @param {String} snooperId      the id the system gives the hacker in marks
 * @param {(interception) => Boolean} holds   is her mark still on the target
 * @return {Array<{interception, entries}>}
 */
export function interceptedBy(traffic, snooperId, holds = () => true){
  return traffic.interceptions
    .filter(i => i.snooperId === snooperId && holds(i))
    .map(interception => ({
      interception,
      entries: traffic.entries.filter(e => (e.sentAt ?? 0) >= (interception.since ?? 0) && (
        e.from?.actorId === interception.targetId ||
        (seenByRecipient(e) && (e.to?.devices ?? []).some(d => d.actorId === interception.targetId))
      )).sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0)),
    }))
}

/** The message as it is written to the register: trimmed, bounded */
export function cleanText(text, max = COMMCODE_MAX_TEXT){
  return String(text ?? "").replace(/\r\n/g, "\n").trim().slice(0, max)
}

/** A contact of the directory, as written on the character (flags.sr5.commcodeDirectory) */
export function directoryOf(raw){
  return (Array.isArray(raw) ? raw : [])
    .filter(c => normalizeCommcode(c?.commcode))
    .map(c => ({
      id: String(c.id ?? normalizeCommcode(c.commcode)), name: String(c.name ?? "").trim(), commcode: String(c.commcode).trim(),
      // The key of the cipher agreed with this contact (lot 39), "" when none
      key: String(c.key ?? "")
    }))
}

/**
 * The directory with one more contact, or the same one renamed (a commcode is listed once). A key given (a string,
 * even empty) replaces the contact's (lot 39); none leaves it.
 */
export function withContact(directory, contact, newId = () => Math.random().toString(36).slice(2, 10)){
  const commcode = String(contact?.commcode ?? "").trim()
  if (!normalizeCommcode(commcode)) return directory
  const name = String(contact?.name ?? "").trim()
  const key = typeof contact?.key === "string" ? contact.key.trim() : null
  const found = directory.find(c => sameCommcode(c.commcode, commcode))
  if (found) return directory.map(c => c === found ? {
    ...c, name: name || c.name, key: key ?? c.key ?? ""
  } : c)
  return [...directory, {
    id: newId(), name, commcode, key: key ?? ""
  }]
}

/** The name a user reads for a commcode: her contact's, or the commcode itself */
export function displayNameOf(commcode, directory){
  const contact = directory.find(c => sameCommcode(c.commcode, commcode))
  return contact?.name || String(commcode ?? "")
}

// Relecture djamz.13 (arbitrage de DjamZ): a communication device set on a character gets a commcode of its own,
// #XX-XXXX-XXXX-XX. Its owner may change it once; the gamemaster, as often as he likes.
export const COMMCODE_DEVICE_TYPES = ["commlink", "cyberdeck", "riggerCommandConsole"]
export const COMMCODE_ACTOR_TYPES = ["actorPc", "actorGrunt"]
const COMMCODE_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/** Does this device, on this actor, get a commcode of its own */
export function needsCommcode(device, actorType){
  return device?.type === "itemDevice" && COMMCODE_DEVICE_TYPES.includes(device.system?.type) &&
    COMMCODE_ACTOR_TYPES.includes(actorType) && !normalizeCommcode(device.system?.commcode)
}

/**
 * A new commcode, #XX-XXXX-XXXX-XX, none of those already given
 * @param {Iterable<String>} taken   the commcodes of the world
 * @param {Function} random          returns a number in [0, 1)
 */
export function generateCommcode(taken = [], random = Math.random){
  const used = new Set([...taken].map(normalizeCommcode))
  const draw = n => Array.from({
    length: n 
  }, () => COMMCODE_CHARS[Math.floor(random() * COMMCODE_CHARS.length)]).join("")
  for (let i = 0; i < 100; i++){
    const code = `#${draw(2)}-${draw(4)}-${draw(4)}-${draw(2)}`
    if (!used.has(normalizeCommcode(code))) return code
  }
  return null
}

/**
 * A change of commcode asked by a user: "allowed" (nothing to note), "first" (the owner's one change, to note) or
 * "refused" (the owner already used it)
 */
export function commcodeChange({
  isGM = false, before = "", after = "", edited = false 
} = {
}){
  if (isGM || String(after ?? "").trim() === String(before ?? "").trim()) return "allowed"
  return edited ? "refused" : "first"
}
