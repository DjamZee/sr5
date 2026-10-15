// The messaging window of a device (lot 14): an AR window in the system's theme, dark or light. One window per
// device: its conversations, its calls, the character's directory and the traffic its snoops intercept. The
// gamemaster's window shows the whole traffic and lets her speak for a commcode no sheet carries. Every change goes
// through the gamemaster (commcode-traffic.js); the window only reads the register.

import {
  readTraffic, requestCommcode, deviceStateOf, directoryFlagOf, setDirectory, mySnoops, speaksFor, cipherEnabled
} from "./commcode-traffic.js"
import {
  cipherOf, hasKey, readMessage
} from "../system/commcode-cipher.js"
import {
  counterpartOf, directoryOf, displayNameOf, entriesOfDevice, isOpen, normalizeCommcode, sameCommcode, threadsOf,
  withContact, COMMCODE_MAX_TEXT
} from "../system/commcode-rules.js"
import {
  worldTimeToComponents, calendarStartYear
} from "../system/calendar.js"
import {
  activeDeviceOf
} from "../canvas/pan-crown/pan-graph.js"

const {
  ApplicationV2, HandlebarsApplicationMixin 
} = foundry.applications.api

const windowIdOf = uuid => uuid ? `sr5-commcode-${uuid.replace(/[^A-Za-z0-9]/g, "-")}` : "sr5-commcode-gm"
const pad = n => String(n).padStart(2, "0")

function timeOf(entry){
  try {
    const c = worldTimeToComponents(entry.worldTime ?? 0, calendarStartYear())
    return `${pad(c.dayOfMonth + 1)}/${pad(c.month + 1)} ${pad(c.hour)}:${pad(c.minute)}`
  } catch {
    return ""
  }
}

/** The commcode an actor answers on: that of its active device, or of the first of its devices that has one */
export function commcodeOfActor(actor){
  if (!actor) return ""
  const device = activeDeviceOf(actor)
  const own = normalizeCommcode(device?.system?.commcode) ? device :
    Array.from(actor.items ?? []).find(i => i.type === "itemDevice" && normalizeCommcode(i.system?.commcode))
  return String(own?.system?.commcode ?? "").trim()
}

/**
 * The contacts the list offers (relecture djamz.13): the players' characters, and for the gamemaster the actors of
 * the tokens of the scene too; neither the holder, nor a commcode already in the directory
 */
function contactCandidates(holder, directory, ownCommcode){
  const actors = new Map()
  for (const actor of game.actors ?? []) if (actor.hasPlayerOwner && actor.type === "actorPc") actors.set(actor.uuid, actor)
  if (game.user?.isGM) for (const token of globalThis.canvas?.scene?.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor)
  const out = []
  for (const actor of actors.values()) {
    if (actor === holder) continue
    const commcode = commcodeOfActor(actor)
    if (!commcode || sameCommcode(commcode, ownCommcode) || out.some(c => sameCommcode(c.commcode, commcode)) ||
      directory.some(c => sameCommcode(c.commcode, commcode))) continue
    out.push({
      name: actor.token?.name ?? actor.name, commcode
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// What the reader of a window has read: per viewer, a convenience kept in her browser only
function readMarks(key){
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) ?? "{}") ?? {
    }
  } catch {
    return {
    }
  }
}
function writeMarks(key, marks){
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(marks))
  } catch {
    // Without storage, everything stays unread: no fault
  }
}

export class SR5CommcodeWindow extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr5", "sr-application", "sr-commcode"],
    position: {
      width: 720, height: 560
    },
    window: {
      title: "SR5.COMMCODE_Title", icon: "fas fa-comment-dots", resizable: true
    },
    actions: {
      commTab: SR5CommcodeWindow.#onTab,
      thread: SR5CommcodeWindow.#onThread,
      newThread: SR5CommcodeWindow.#onNewThread,
      send: SR5CommcodeWindow.#onSend,
      call: SR5CommcodeWindow.#onCall,
      answer: SR5CommcodeWindow.#onCallEvent,
      refuse: SR5CommcodeWindow.#onCallEvent,
      hangup: SR5CommcodeWindow.#onCallEvent,
      line: SR5CommcodeWindow.#onLine,
      addContact: SR5CommcodeWindow.#onAddContact,
      addPicked: SR5CommcodeWindow.#onAddPicked,
      addTarget: SR5CommcodeWindow.#onAddTarget,
      saveContact: SR5CommcodeWindow.#onSaveContact,
      removeContact: SR5CommcodeWindow.#onRemoveContact,
      writeTo: SR5CommcodeWindow.#onWriteTo,
      stopSnoop: SR5CommcodeWindow.#onStopSnoop,
      gmSend: SR5CommcodeWindow.#onGmSend,
      saveKey: SR5CommcodeWindow.#onSaveKey,
      crack: SR5CommcodeWindow.#onCrack,
      cipherTool: SR5CommcodeWindow.#onCipherTool,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/commcode-window.hbs"
    }
  }

  constructor(options = {
  }){
    super({
      ...options, id: windowIdOf(options.deviceUuid)
    })
    this.deviceUuid = options.deviceUuid ?? null
    this.tab = this.deviceUuid ? "messages" : "gm"
    this.current = options.focus?.commcode ?? null
    this.wantFocus = true
  }

  /** The window of a device, opened or brought to the front */
  static openDevice(deviceUuid, {
    focus = null
  } = {
  }){
    const item = deviceUuid ? globalThis.fromUuidSync?.(deviceUuid) ?? null : null
    if (item?.type !== "itemDevice" || !item.parent) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_Refused_noDevice"))
    if (!speaksFor(game.user, item.parent)) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_Refused_owner"))
    const existing = foundry.applications.instances.get(windowIdOf(deviceUuid))
    const app = existing ?? new SR5CommcodeWindow({
      deviceUuid, focus
    })
    if (existing && focus?.commcode) {
      app.tab = "messages"
      app.current = focus.commcode
    }
    return app.render({
      force: true
    }).then(() => app.bringToFront?.())
  }

  /** The gamemaster's window: the whole traffic */
  static openGM(){
    if (!game.user?.isGM) return
    const app = foundry.applications.instances.get(windowIdOf(null)) ?? new SR5CommcodeWindow({
    })
    return app.render({
      force: true
    })
  }

  /** The key, or game.sr5.commcode.open(): the gamemaster's window, or the device of the user's character */
  static openMine(){
    if (game.user?.isGM) return SR5CommcodeWindow.openGM()
    const actors = [game.user?.character, ...(globalThis.canvas?.tokens?.controlled ?? []).map(t => t.actor)].filter(Boolean)
    for (const actor of actors) {
      const device = activeDeviceOf(actor) ?? Array.from(actor.items ?? []).find(i => i.type === "itemDevice" && normalizeCommcode(i.system?.commcode))
      if (device) return SR5CommcodeWindow.openDevice(device.uuid)
    }
    ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_Refused_noDevice"))
  }

  static refreshAll(){
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof SR5CommcodeWindow && app.rendered) app.render()
    }
  }

  get device(){
    return this.deviceUuid ? globalThis.fromUuidSync?.(this.deviceUuid) ?? null : null
  }

  get title(){
    const device = this.device
    return device ? `${game.i18n.localize("SR5.COMMCODE_Title")} — ${device.name}` : game.i18n.localize("SR5.COMMCODE_GMTitle")
  }

  get readKey(){
    return `sr5-commcode-read-${game.user?.id}-${this.deviceUuid ?? "gm"}`
  }

  async _prepareContext(options){
    const context = await super._prepareContext(options)
    const traffic = readTraffic()
    const device = this.device
    context.isGM = !!game.user?.isGM
    context.tab = this.tab
    context.maxText = COMMCODE_MAX_TEXT
    context.cipherOn = cipherEnabled()
    if (!device) return {
      ...context, ...this.#gmContext(traffic)
    }

    const actor = device.parent
    const commcode = String(device.system?.commcode ?? "").trim()
    const state = deviceStateOf(device, actor)
    const directory = directoryOf(directoryFlagOf(actor))
    const entries = entriesOfDevice(traffic.entries, commcode)
    const marks = readMarks(this.readKey)
    const threads = threadsOf(entries, commcode)
    if (!this.current && threads.length) this.current = threads[0].commcode
    // What the user has read is what she opened
    if (this.current && this.tab === "messages") {
      marks[normalizeCommcode(this.current)] = Date.now()
      writeMarks(this.readKey, marks)
    }
    const mine = entry => sameCommcode(entry.from?.commcode, commcode)
    // A ciphered message (lot 39): its sender reads it, its recipient with the key she keeps for her correspondent
    const keyFor = other => directory.find(c => sameCommcode(c.commcode, other))?.key ?? ""
    const read = entry => readMessage(entry, {
      author: mine(entry), key: keyFor(counterpartOf(entry, commcode))
    })
    context.device = {
      name: device.name, commcode, holder: actor?.name ?? "", state, stateLabel: game.i18n.localize(`SR5.COMMCODE_State_${state}`),
      online: state === "online",
    }
    context.noCommcode = !normalizeCommcode(commcode)
    context.threads = threads.map(t => {
      const last = t.entries[t.entries.length - 1]
      const unread = t.entries.filter(e => !mine(e) && (e.deliveredAt ?? e.sentAt ?? 0) > (marks[t.key] ?? 0)).length
      return {
        commcode: t.commcode, name: displayNameOf(t.commcode, directory), known: directory.some(c => sameCommcode(c.commcode, t.commcode)),
        last: last?.kind === "call" ? game.i18n.localize(`SR5.COMMCODE_Call_${last.status}`) : (last ? read(last).text : ""),
        time: last ? timeOf(last) : "", unread, active: sameCommcode(t.commcode, this.current),
      }
    })
    const current = this.current ? threads.find(t => sameCommcode(t.commcode, this.current)) : null
    context.current = this.current ? {
      commcode: this.current, name: displayNameOf(this.current, directory),
      known: directory.some(c => sameCommcode(c.commcode, this.current)),
      bubbles: (current?.entries ?? []).map(e => this.#bubble(e, mine(e), read(e))),
      key: keyFor(this.current),
      // The lock of the composer: ticked when a key is kept for this correspondent, until the user unticks it
      encrypt: this.encrypt?.[normalizeCommcode(this.current)] ?? hasKey(keyFor(this.current)),
    } : null

    // The open call of the device, wherever its thread is
    const call = entries.find(isOpen)
    if (call) {
      const side = mine(call) ? "from" : "to"
      const other = counterpartOf(call, commcode)
      context.call = {
        id: call.id, side, status: call.status, name: displayNameOf(other, directory), commcode: other,
        incoming: call.status === "ringing" && side === "to", outgoing: call.status === "ringing" && side === "from",
        active: call.status === "active",
        lines: (call.lines ?? []).map(l => ({
          mine: l.side === side, text: l.text
        })),
      }
    }
    context.directory = directory
    context.candidates = contactCandidates(actor, directory, commcode)
    context.intercepts = this.#interceptContext(traffic, actor)
    context.hasIntercepts = context.intercepts.length > 0
    return context
  }

  #bubble(entry, mine, seen = readMessage(entry, {
    author: mine
  })){
    const status = entry.kind === "call" ? game.i18n.localize(`SR5.COMMCODE_Call_${entry.status}`) :
      (mine ? game.i18n.localize(`SR5.COMMCODE_Status_${entry.status}`) : "")
    return {
      mine, call: entry.kind === "call", text: seen.text, ciphered: seen.ciphered, locked: seen.ciphered && !seen.clear,
      cipherLabel: seen.ciphered ? game.i18n.localize(`SR5.COMMCODE_Cipher_${seen.how}`) : "",
      time: timeOf(entry), status, pending: entry.status === "pending",
      lines: entry.kind === "call" ? (entry.lines ?? []).length : 0,
    }
  }

  /** The traffic the device's holder intercepts (SR5 p. 241), and the gamemaster sees all of it in her window */
  #interceptContext(traffic, actor){
    const ids = new Set([actor?.id, actor?.token?.id].filter(Boolean))
    return mySnoops(traffic).filter(s => ids.has(s.interception.snooperId)).map(({
      interception, entries
    }) => ({
      id: interception.id, target: interception.targetName,
      entries: entries.map(e => {
        // A ciphered message: the cipher, until the snooper breaks it (lot 39, Crack File SR5 p. 242)
        const seen = readMessage(e, {
          snooperId: interception.snooperId
        })
        return {
          id: e.id, from: e.from?.commcode, fromDevice: e.from?.deviceName, to: e.to?.commcode,
          toDevice: (e.to?.devices ?? [])[0]?.deviceName ?? "", call: e.kind === "call", text: seen.text, time: timeOf(e),
          ciphered: seen.ciphered, locked: seen.ciphered && !seen.clear, crackable: seen.ciphered && !seen.clear && cipherEnabled(),
          cipherLabel: seen.ciphered ? game.i18n.localize(`SR5.COMMCODE_Cipher_${seen.how}`) : "",
          status: e.kind === "call" ? game.i18n.localize(`SR5.COMMCODE_Call_${e.status}`) : "",
          lines: (e.lines ?? []).map(l => `${l.side === "from" ? e.from?.commcode : e.to?.commcode} : ${l.text}`),
        }
      }),
    }))
  }

  #gmContext(traffic){
    const label = end => end?.actorName ? `${end.actorName} (${end.commcode})` : end?.commcode
    const toLabel = entry => {
      const devices = entry.to?.devices ?? []
      return devices.length ? `${devices.map(d => d.actorName).join(", ")} (${entry.to.commcode})` :
        `${entry.to?.commcode} — ${game.i18n.localize("SR5.COMMCODE_NoSheet")}`
    }
    const entries = [...traffic.entries].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0)).slice(0, 150)
    return {
      gm: {
        entries: entries.map(e => ({
          // The gamemaster reads a ciphered message in clear, told it is ciphered (lot 39)
          id: e.id, from: label(e.from), to: toLabel(e), call: e.kind === "call", text: readMessage(e, {
            isGM: true
          }).text, ciphered: !!cipherOf(e), cipherRating: cipherOf(e)?.rating ?? 0, cipherKey: cipherOf(e)?.key ?? "",
          crackedBy: (cipherOf(e)?.crackedBy ?? []).map(id => traffic.interceptions.find(i => i.snooperId === id)?.snooperName ?? game.actors?.get(id)?.name ?? id).join(", "),
          time: timeOf(e),
          status: game.i18n.localize(e.kind === "call" ? `SR5.COMMCODE_Call_${e.status}` : `SR5.COMMCODE_Status_${e.status}`),
          pending: e.status === "pending", open: isOpen(e),
          // The gamemaster answers for the commcodes no sheet carries, and for those she speaks as
          answerable: e.kind === "call" && e.status === "ringing" && !(e.to?.devices ?? []).length,
          active: e.kind === "call" && e.status === "active",
          outgoing: e.kind === "call" && e.status === "ringing" && !!e.from?.gm,
          side: e.from?.gm ? "from" : ((e.to?.devices ?? []).length ? null : "to"),
          lines: (e.lines ?? []).map(l => `${l.side === "from" ? e.from?.commcode : e.to?.commcode} : ${l.text}`),
        })),
        interceptions: traffic.interceptions.map(i => ({
          id: i.id, snooper: i.snooperName, target: i.targetName
        })),
      }
    }
  }

  // The window redraws whenever the register or a device changes: what the user was typing stays
  async _preRender(context, options){
    await super._preRender?.(context, options)
    this.drafts = {
    }
    for (const field of this.element?.querySelectorAll?.("textarea[name], input[type=text][name]") ?? []) {
      if (field.value) this.drafts[field.name] = field.value
    }
    this.focused = this.element?.contains?.(document.activeElement) ? document.activeElement.name : null
  }

  _onRender(context, options){
    super._onRender?.(context, options)
    for (const [name, value] of Object.entries(this.drafts ?? {
    })) {
      const field = this.element.querySelector(`[name="${name}"]`)
      if (field && !field.value) field.value = value
    }
    // Enter sends, Shift+Enter goes to the line
    for (const area of this.element.querySelectorAll("textarea[data-enter]")) {
      area.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.shiftKey) return
        event.preventDefault()
        this.element.querySelector(`[data-action="${area.dataset.enter}"]`)?.click()
      })
    }
    // The lock of the composer stays as the user left it for this correspondent (lot 39)
    this.element.querySelector("input[name=encrypt]")?.addEventListener("change", event => {
      this.encrypt = {
        ...(this.encrypt ?? {
        }), [normalizeCommcode(this.current)]: event.target.checked
      }
    })
    const thread = this.element.querySelector(".sr-commcode-bubbles")
    if (thread) thread.scrollTop = thread.scrollHeight
    // The field the user was in keeps the focus; a conversation just opened gives it to its message
    const back = this.focused ? this.element.querySelector(`[name="${this.focused}"]`) : null
    if (back) back.focus()
    else if (this.wantFocus) this.element.querySelector("textarea[data-focus]")?.focus()
    this.wantFocus = false
  }

  /** Read a field and empty it at once, and its draft with it: the redraw the answer brings must not put it back */
  #take(selector){
    const field = this.element.querySelector(selector)
    const value = field?.value ?? ""
    if (field) field.value = ""
    if (field?.name && this.drafts) delete this.drafts[field.name]
    return value
  }

  #value(selector){
    return this.element.querySelector(selector)?.value ?? ""
  }

  static #onTab(event, target){
    this.tab = target.dataset.tab
    this.render()
  }

  static #onThread(event, target){
    this.tab = "messages"
    this.current = target.dataset.commcode
    this.wantFocus = true
    this.#take("textarea[name=message]")
    // The key field is the correspondent's: another conversation shows its own
    this.#take("input[name=threadKey]")
    this.render()
  }

  static #onNewThread(){
    const to = this.#take("input[name=newCommcode]").trim()
    if (!normalizeCommcode(to)) return
    this.tab = "messages"
    this.current = to
    this.wantFocus = true
    this.#take("input[name=threadKey]")
    this.render()
  }

  /** The key of the cipher agreed with the correspondent, kept in the character's directory (lot 39) */
  async #keepKey(key){
    const actor = this.device?.parent
    if (!actor || !this.current) return
    const directory = directoryOf(directoryFlagOf(actor))
    const kept = directory.find(c => sameCommcode(c.commcode, this.current))?.key ?? ""
    if (kept === key.trim()) return
    await setDirectory(actor, withContact(directory, {
      commcode: this.current, key
    }, () => foundry.utils.randomID()))
  }

  static async #onSend(){
    if (!this.#value("textarea[name=message]").trim() || !this.current) return
    // Ciphered when the lock is ticked: with the key of the field, kept for this correspondent
    let key = ""
    if (cipherEnabled() && this.element.querySelector("input[name=encrypt]")?.checked) {
      key = this.#value("input[name=threadKey]").trim()
      if (!hasKey(key)) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_CipherNoKey"))
      await this.#keepKey(key)
    }
    const text = this.#take("textarea[name=message]")
    await requestCommcode("send", {
      deviceUuid: this.deviceUuid, to: this.current, text, kind: "message", key
    })
  }

  static async #onSaveKey(){
    await this.#keepKey(this.#value("input[name=threadKey]"))
    this.render()
  }

  static async #onCrack(event, target){
    await requestCommcode("crack", {
      interceptionId: target.dataset.interception, entryId: target.dataset.id
    })
  }

  static async #onCipherTool(){
    const {
      SR5CipherTool
    } = await import("./commcode-cipher-tool.js")
    return SR5CipherTool.open()
  }

  static async #onCall(){
    if (!this.current) return
    await requestCommcode("send", {
      deviceUuid: this.deviceUuid, to: this.current, kind: "call"
    })
  }

  static async #onCallEvent(event, target){
    await requestCommcode(target.dataset.action, {
      entryId: target.dataset.id, side: target.dataset.side || undefined, deviceUuid: this.deviceUuid
    })
  }

  static async #onLine(event, target){
    const selector = this.element.querySelector(`textarea[name="line-${target.dataset.id}"]`) ? `textarea[name="line-${target.dataset.id}"]` : "textarea[name=line]"
    if (!this.#value(selector).trim()) return
    const text = this.#take(selector)
    await requestCommcode("line", {
      entryId: target.dataset.id, side: target.dataset.side || undefined, text
    })
  }

  static async #onAddContact(){
    const actor = this.device?.parent
    const name = this.#value("input[name=contactName]")
    const commcode = this.#value("input[name=contactCommcode]")
    if (!actor || !normalizeCommcode(commcode)) return
    await setDirectory(actor, withContact(directoryOf(directoryFlagOf(actor)), {
      name, commcode
    }, () => foundry.utils.randomID()))
    this.render()
  }

  // Relecture djamz.13 (DjamZ): a contact picked in the list, or taken from the token the user targets on the map
  static async #onAddPicked(){
    const option = this.element?.querySelector("select[name=contactPick]")?.selectedOptions?.[0]
    if (!option?.value) return
    await this.#addContact(option.dataset.name ?? "", option.value)
  }

  static async #onAddTarget(){
    const targets = [...(game.user?.targets ?? [])]
    if (!targets.length) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_NoTarget"))
    for (const token of targets) {
      const actor = token.actor
      // A player takes the commcode of a player's character; that of a character of the gamemaster, he gives it
      if (!game.user.isGM && !actor?.hasPlayerOwner) {
        ui.notifications?.warn(game.i18n.format("SR5.COMMCODE_TargetGM", {
          name: token.name 
        }))
        continue
      }
      const commcode = commcodeOfActor(actor)
      if (!commcode) {
        ui.notifications?.warn(game.i18n.format("SR5.COMMCODE_TargetNone", {
          name: token.name 
        }))
        continue
      }
      await this.#addContact(token.name, commcode)
    }
  }

  async #addContact(name, commcode){
    const actor = this.device?.parent
    if (!actor || !normalizeCommcode(commcode)) return
    await setDirectory(actor, withContact(directoryOf(directoryFlagOf(actor)), {
      name, commcode
    }, () => foundry.utils.randomID()))
    this.render()
  }

  // The counterpart of the open conversation, named and kept
  static async #onSaveContact(){
    const actor = this.device?.parent
    if (!actor || !this.current) return
    const name = this.#value("input[name=currentName]")
    await setDirectory(actor, withContact(directoryOf(directoryFlagOf(actor)), {
      name, commcode: this.current
    }, () => foundry.utils.randomID()))
    this.render()
  }

  static async #onRemoveContact(event, target){
    const actor = this.device?.parent
    if (!actor) return
    await setDirectory(actor, directoryOf(directoryFlagOf(actor)).filter(c => c.id !== target.dataset.id))
    this.render()
  }

  static #onWriteTo(event, target){
    this.tab = "messages"
    this.current = target.dataset.commcode
    this.render()
  }

  static async #onStopSnoop(event, target){
    await requestCommcode("stopSnoop", {
      interceptionId: target.dataset.id
    })
  }

  static async #onGmSend(event, target){
    const asCommcode = this.#value("input[name=gmFrom]")
    const asName = this.#value("input[name=gmName]")
    const to = this.#value("input[name=gmTo]")
    const kind = target.dataset.kind === "call" ? "call" : "message"
    const text = kind === "message" ? this.#take("textarea[name=gmText]") : ""
    // A contact without a sheet ciphers with the rating the gamemaster gives (lot 39)
    const key = kind === "message" && cipherEnabled() ? this.#value("input[name=gmKey]").trim() : ""
    const cipherRating = this.#value("input[name=gmCipherRating]")
    await requestCommcode("send", {
      asCommcode, asName, to, text, kind, key, cipherRating
    })
  }
}
