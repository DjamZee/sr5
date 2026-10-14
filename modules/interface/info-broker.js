// The information broker's window (lot 37a): buying and selling data, Cutting Aces p. 148-149.
// Opened from the shop window of a vendor made from the « Courtier en informations » template, or by the gamemaster
// from any vendor's. The rules are in info-broker-rules.js.
//
// The requests live in a register of the gamemaster (gm-ledger.js): a player's browser asks, the active GM's
// browser writes. The gamemaster quotes a price within the book's range, the buyer accepts, the gamemaster's
// browser debits the buyer's accounts, then delivers the data as a « Fichier » item (itemFile) in her inventory.
// Selling works the other way: the character offers one of her files, the gamemaster bids, she accepts, the
// gamemaster's browser credits her. Whether the data are sound stays in the register, for the gamemaster only.
import {
  updateLedger
} from "../system/gm-ledger.js"
import {
  INFO_TYPES, infoType, priceRangeLabel, startingQuote, quoteInRange, RELIABILITY, nextStatus, sortRequests, forOwner,
  fileName, cleanRequest
} from "../system/info-broker-rules.js"
import {
  SR5_SocketHandler
} from "../socket.js"

const {
  ApplicationV2, HandlebarsApplicationMixin
} = foundry.applications.api

export const INFO_BROKER_LEDGER = "sr5InfoBrokerLedger"
const L = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key)
const nuyen = n => `${Number(n || 0).toLocaleString("fr-FR")} ¥`

function isWriter(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function brokerLedger(){
  try {
    return game.settings.get("sr5", INFO_BROKER_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

export function registerInfoBrokerLedger(){
  game.settings.register("sr5", INFO_BROKER_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
    // Every open broker window follows the register
    onChange: () => {
      for (const app of foundry.applications.instances.values()) if (app instanceof SR5InfoBrokerApp) app.render()
    },
  })
}

function typeLabel(key){
  return L(`SR5.INFOBROKER_Type_${key}`)
}

function transaction(type, amount, name){
  return {
    name,
    type: "itemNuyen",
    img: "systems/sr5/assets/img/items/itemNuyen.svg",
    system: {
      amount, type, date: new Date().toISOString().slice(0, 10), description: ""
    },
  }
}

async function whisper(actor, content){
  const ids = game.users.filter(u => u.isGM || actor?.testUserPermission?.(u, "OWNER")).map(u => u.id)
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({
      actor
    }),
    whisper: ids,
    content: `<div class="sr-infobroker-card">${content}</div>`,
  })
}

/* -------------------------------------------- */
/*  The gamemaster's side: every write          */
/* -------------------------------------------- */

async function writeEntry(id, change){
  return updateLedger(INFO_BROKER_LEDGER, ledger => {
    const next = change(ledger[id] ? {
      ...ledger[id]
    } : null)
    if (!next) return null
    ledger[id] = next
    return ledger
  })
}

/** A new request, from the buyer's browser or the gamemaster's own. */
async function gmRegister(data, {
  actorUuid, vendorUuid, userId
}){
  const clean = cleanRequest(data)
  const actor = actorUuid ? await fromUuid(actorUuid) : null
  if (!clean || !actor) return
  // A file offered for sale must be the seller's (sell)
  let fileLabel = ""
  if (clean.kind === "sell") {
    const file = actor.items.get(clean.fileId)
    if (!file || file.type !== "itemFile") return
    fileLabel = file.name
  }
  const vendor = vendorUuid ? await fromUuid(vendorUuid) : null
  const id = foundry.utils.randomID()
  await writeEntry(id, () => ({
    id, ...clean, fileLabel, status: clean.kind === "sell" ? "offered" : "asked",
    actorUuid, actorName: actor.name, vendorUuid: vendorUuid ?? "", vendorName: vendor?.name ?? "", userId,
    price: clean.kind === "sell" ? 0 : startingQuote(infoType(clean.type)), reliability: "sound", content: "", gmNote: "",
    time: game.time?.worldTime ?? 0, date: new Date().toISOString().slice(0, 10),
  }))
  ui.notifications.info(L(clean.kind === "sell" ? "SR5.INFOBROKER_GmNewSale" : "SR5.INFOBROKER_GmNewRequest", {
    actor: actor.name, type: typeLabel(clean.type)
  }))
}

/** The buyer accepts a quote: her accounts pay it, then the request is paid. */
async function gmAccept(entry){
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return
  await actor.createEmbeddedDocuments("Item", [transaction("loss", entry.price, L("SR5.INFOBROKER_PurchaseOf", {
    name: fileName(typeLabel(entry.type), entry.subject)
  }))])
  await writeEntry(entry.id, e => e && nextStatus(e.status, "accept", "owner") ? {
    ...e, status: "paid"
  } : null)
  await whisper(actor, L("SR5.INFOBROKER_CardPaid", {
    actor: actor.name, name: fileName(typeLabel(entry.type), entry.subject), price: nuyen(entry.price)
  }))
}

/** The seller accepts a bid: she is paid, the broker keeps a copy (the file stays on her sheet). */
async function gmSell(entry){
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return
  await actor.createEmbeddedDocuments("Item", [transaction("gain", entry.price, L("SR5.INFOBROKER_SaleOf", {
    name: entry.fileLabel || typeLabel(entry.type)
  }))])
  await writeEntry(entry.id, e => e && nextStatus(e.status, "sell", "owner") ? {
    ...e, status: "sold"
  } : null)
  await whisper(actor, L("SR5.INFOBROKER_CardSold", {
    actor: actor.name, name: entry.fileLabel || typeLabel(entry.type), price: nuyen(entry.price)
  }))
}

/** The data delivered: a file on the buyer's sheet, with what the gamemaster wrote. */
async function gmDeliver(entry){
  const actor = await fromUuid(entry.actorUuid)
  if (!actor) return
  const name = fileName(typeLabel(entry.type), entry.subject)
  await actor.createEmbeddedDocuments("Item", [{
    name, type: "itemFile", img: "icons/svg/book.svg",
    system: {
      content: entry.content || `<p>${foundry.utils.escapeHTML(L("SR5.INFOBROKER_NoContent"))}</p>`,
      description: `<p>${foundry.utils.escapeHTML(L("SR5.INFOBROKER_FileFrom", {
        vendor: entry.vendorName || L("SR5.INFOBROKER_Title"), date: entry.date
      }))}</p>`,
    },
    flags: {
      sr5: {
        infoBroker: {
          type: entry.type, subject: entry.subject
        }
      }
    },
  }])
  await writeEntry(entry.id, e => e && nextStatus(e.status, "deliver", "gm") ? {
    ...e, status: "delivered"
  } : null)
  await whisper(actor, L("SR5.INFOBROKER_CardDelivered", {
    actor: actor.name, name
  }))
}

/** The buyer's or seller's answer, checked on the gamemaster's browser. */
async function gmAnswer(id, move, senderId){
  const entry = brokerLedger()[id]
  if (!entry) return
  const actor = await fromUuid(entry.actorUuid)
  const sender = game.users.get(senderId)
  if (!actor || !sender || !(sender.isGM || actor.testUserPermission(sender, "OWNER"))) return
  if (!nextStatus(entry.status, move, "owner")) return
  if (move === "accept") return gmAccept(entry)
  if (move === "sell") return gmSell(entry)
  await writeEntry(id, e => e ? {
    ...e, status: nextStatus(e.status, move, "owner") ?? e.status
  } : null)
}

export async function _socketInfoBrokerRequest(message, senderId){
  if (!isWriter()) return
  const {
    request, actorUuid, vendorUuid
  } = message.data ?? {
  }
  const actor = actorUuid ? await fromUuid(actorUuid) : null
  const sender = game.users.get(senderId)
  if (!actor || !sender || !actor.testUserPermission(sender, "OWNER")) return
  return gmRegister(request, {
    actorUuid, vendorUuid, userId: senderId
  })
}

export async function _socketInfoBrokerAnswer(message, senderId){
  if (!isWriter()) return
  return gmAnswer(message.data?.id, message.data?.move, senderId)
}

/* -------------------------------------------- */
/*  The window                                  */
/* -------------------------------------------- */

export class SR5InfoBrokerApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "sr5-info-broker",
    classes: ["sr5", "sr-application", "sr-infobroker"],
    position: {
      width: 900, height: 720
    },
    window: {
      title: "SR5.INFOBROKER_Title", icon: "fas fa-user-secret", resizable: true
    },
    actions: {
      pickType: SR5InfoBrokerApp.#onPickType,
      order: SR5InfoBrokerApp.#onOrder,
      offer: SR5InfoBrokerApp.#onOffer,
      answer: SR5InfoBrokerApp.#onAnswer,
      gmMove: SR5InfoBrokerApp.#onGmMove,
      brokerTab: SR5InfoBrokerApp.#onTab,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/info-broker.hbs", scrollable: [".sr-infobroker-scroll"]
    }
  }

  /**
   * Opens the window, for a buyer (an actor the user owns) at a vendor's.
   * @param {{vendor?: Actor, buyer?: Actor}} options
   */
  static open({
    vendor = null, buyer = null
  } = {
  }){
    const app = foundry.applications.instances.get("sr5-info-broker") ?? new SR5InfoBrokerApp()
    app.vendor = vendor ?? app.vendor ?? null
    app.buyer = buyer ?? app.buyer ?? null
    return app.render({
      force: true
    })
  }

  tab = "buy"
  picked = null

  /** The characters this user may buy for: the buyer given, else the ones she owns. */
  #buyers(){
    const owned = (game.actors?.contents ?? []).filter(a => a.isOwner && ["actorPc", "actorGrunt"].includes(a.type) && (!game.user.isGM || a.hasPlayerOwner))
    if (this.buyer && !owned.includes(this.buyer)) owned.unshift(this.buyer)
    return owned
  }

  async _prepareContext(options){
    const context = await super._prepareContext(options)
    const buyers = this.#buyers()
    if (!this.buyer || !buyers.includes(this.buyer)) this.buyer = buyers[0] ?? null
    const ledger = brokerLedger()
    const isGM = game.user.isGM
    const mine = Object.values(ledger).filter(e => isGM || (fromUuidSync(e.actorUuid)?.isOwner))
    const statusLabel = s => L(`SR5.INFOBROKER_Status_${s}`)
    const requests = sortRequests(mine).map(raw => {
      const e = isGM ? raw : forOwner(raw)
      const type = infoType(e.type)
      return {
        ...e,
        typeLabel: typeLabel(e.type),
        range: priceRangeLabel(type),
        priceLabel: nuyen(e.price),
        statusLabel: statusLabel(e.status),
        isSell: e.kind === "sell",
        inRange: e.kind === "sell" || quoteInRange(type, e.price),
        canAccept: !!nextStatus(e.status, "accept", "owner"),
        canSell: !!nextStatus(e.status, "sell", "owner"),
        canDecline: !!nextStatus(e.status, "decline", "owner"),
        canCancel: !!nextStatus(e.status, "cancel", "owner"),
        gmQuote: isGM && ["asked", "quoted"].includes(e.status),
        gmBid: isGM && ["offered", "bid"].includes(e.status),
        gmDeliver: isGM && e.status === "paid",
        reliabilities: RELIABILITY.map(r => ({
          key: r, label: L(`SR5.INFOBROKER_Reliability_${r}`), selected: r === (e.reliability || "sound")
        })),
      }
    })
    const types = INFO_TYPES.map(t => ({
      key: t.key, label: typeLabel(t.key), hint: L(`SR5.INFOBROKER_TypeHint_${t.key}`), range: priceRangeLabel(t),
      picked: t.key === this.picked,
    }))
    const files = this.buyer ? this.buyer.items.filter(i => i.type === "itemFile").map(i => ({
      id: i.id, name: i.name
    })) : []
    const shop = this.vendor ? this.#vendorShop() : null
    return {
      ...context,
      isGM,
      tab: this.tab,
      vendorName: this.vendor?.name ?? "",
      banner: shop?.banner ?? "",
      portrait: shop?.portrait || this.vendor?.img || "",
      buyers: buyers.map(a => ({
        uuid: a.uuid, name: a.name, selected: a === this.buyer
      })),
      buyerName: this.buyer?.name ?? "",
      types,
      picked: this.picked ? types.find(t => t.picked) : null,
      files,
      requests,
      openCount: requests.filter(r => ["asked", "quoted", "paid", "offered", "bid"].includes(r.status)).length,
    }
  }

  #vendorShop(){
    const storage = this.vendor?.items?.find(i => i.type === "itemStorage" && i.system.shop?.template === "infoBroker") ??
      this.vendor?.items?.find(i => i.type === "itemStorage" && i.system.shop)
    return storage?.system.shop ?? null
  }

  _onRender(context, options){
    super._onRender(context, options)
    const select = this.element.querySelector('[name="buyer"]')
    select?.addEventListener("change", ev => {
      this.buyer = fromUuidSync(ev.target.value) ?? this.buyer
      this.render()
    })
  }

  static #onTab(event, target){
    this.tab = target.dataset.tab
    this.render()
  }

  static #onPickType(event, target){
    this.picked = target.dataset.type
    this.render()
  }

  async #send(request){
    if (!this.buyer) return ui.notifications.warn(L("SR5.INFOBROKER_NoBuyer"))
    const payload = {
      request, actorUuid: this.buyer.uuid, vendorUuid: this.vendor?.uuid ?? ""
    }
    if (isWriter()) return gmRegister(request, {
      actorUuid: payload.actorUuid, vendorUuid: payload.vendorUuid, userId: game.user.id
    })
    await SR5_SocketHandler.emitForGM("infoBrokerRequest", payload)
    ui.notifications.info(L("SR5.INFOBROKER_Sent"))
  }

  static async #onOrder(){
    const subject = this.element.querySelector('[name="subject"]')?.value ?? ""
    if (!this.picked) return ui.notifications.warn(L("SR5.INFOBROKER_PickType"))
    await this.#send({
      kind: "buy", type: this.picked, subject
    })
    this.tab = "requests"
    this.render()
  }

  static async #onOffer(){
    const form = this.element
    const fileId = form.querySelector('[name="fileId"]')?.value ?? ""
    const type = form.querySelector('[name="sellType"]')?.value ?? ""
    const asked = form.querySelector('[name="asked"]')?.value ?? 0
    if (!fileId) return ui.notifications.warn(L("SR5.INFOBROKER_NoFile"))
    await this.#send({
      kind: "sell", type, fileId, asked, subject: this.buyer?.items.get(fileId)?.name ?? ""
    })
    this.tab = "requests"
    this.render()
  }

  static async #onAnswer(event, target){
    const {
      id, move
    } = target.dataset
    if (isWriter()) return gmAnswer(id, move, game.user.id)
    await SR5_SocketHandler.emitForGM("infoBrokerAnswer", {
      id, move
    })
  }

  /** The gamemaster quotes, bids, refuses, says « not found », or delivers. */
  static async #onGmMove(event, target){
    if (!game.user.isGM) return
    if (!isWriter()) return ui.notifications.warn(L("SR5.INFOBROKER_NotActiveGM"))
    const {
      id, move
    } = target.dataset
    const row = target.closest("[data-request]")
    const read = name => row?.querySelector(`[name="${name}"]`)?.value
    const entry = brokerLedger()[id]
    if (!entry || !nextStatus(entry.status, move, "gm")) return
    const fields = {
      price: Math.max(0, Math.trunc(Number(read("price")) || 0)),
      reliability: RELIABILITY.includes(read("reliability")) ? read("reliability") : entry.reliability,
      content: read("content") ?? entry.content,
      gmNote: read("gmNote") ?? entry.gmNote,
    }
    if (move === "deliver") {
      await writeEntry(id, e => e ? {
        ...e, content: fields.content, reliability: fields.reliability, gmNote: fields.gmNote
      } : null)
      return gmDeliver({
        ...entry, ...fields
      })
    }
    await writeEntry(id, e => e ? {
      ...e, ...fields, status: nextStatus(e.status, move, "gm")
    } : null)
    const actor = await fromUuid(entry.actorUuid)
    const key = {
      quote: "SR5.INFOBROKER_CardQuoted", bid: "SR5.INFOBROKER_CardBid", notFound: "SR5.INFOBROKER_CardNotFound", refuse: "SR5.INFOBROKER_CardRefused"
    }[move]
    if (key && actor) await whisper(actor, L(key, {
      actor: actor.name, name: entry.kind === "sell" ? (entry.fileLabel || typeLabel(entry.type)) : fileName(typeLabel(entry.type), entry.subject),
      price: nuyen(fields.price)
    }))
  }
}
