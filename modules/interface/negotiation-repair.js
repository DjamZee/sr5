import {
  negotiationLooksLost, sourceNegotiation, compendiumSourceOf
} from "./negotiation-repair-rules.js"
import {
  updateLedger
} from "../system/gm-ledger.js"

/**
 * The gamemaster's window that gives back the Negotiation lost before the key fix
 * (negotiation-repair-rules.js). It lists the actors and contacts of the world whose skill reads 0
 * while their compendium source gives more; the gamemaster ticks what applies, once. Nothing is
 * read off a player's sheet or a chat card: the list is recomputed from the documents and the
 * compendiums when the gamemaster applies it, and only the active gamemaster writes.
 */
export class SR5NegotiationRepair extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: "sr5-negotiation-repair",
    classes: ["sr5", "sr-application", "sr-negotiation-repair"],
    position: {
      width: 640, height: 600
    },
    window: {
      title: "SR5.NEGO_REPAIR_Title", icon: "fas fa-handshake", resizable: true
    },
    actions: {
      apply: SR5NegotiationRepair.#apply,
    },
  }

  static PARTS = {
    body: {
      template: "systems/sr5/templates/interface/negotiation-repair.hbs", scrollable: [""]
    }
  }

  /** The world setting that records the repair once it is done. */
  static register() {
    game.settings.register("sr5", "sr5NegotiationRepair", {
      scope: "world", config: false, type: Object, default: {
      },
    })
  }

  static get isActiveGM() {
    return game.user.isGM && game.users.activeGM?.id === game.user.id
  }

  /**
   * The candidates: an actor or a contact whose Negotiation looks lost, and whose compendium source
   * gives one above 0. A contact carried by an actor whose own source is stale (a copy made inside a
   * pack keeps the uuid of where it came from) is matched in the source of its actor: the embedded
   * ids are kept on import.
   *
   * @param {object} [from]  what to look through, and how to resolve a uuid (for the tests)
   * @returns {Promise<{uuid, name, owner, value, source}[]>}
   */
  static async findCandidates({
    actors = game.actors, items = game.items, resolve = uuid => fromUuid(uuid)
  } = {
  }) {
    const cache = new Map()
    const load = async uuid => {
      if (!uuid) return null
      if (!cache.has(uuid)) {
        let doc = null
        try {
          doc = await resolve(uuid)
        } catch (_err) { /* a source gone: no candidate */ }
        cache.set(uuid, doc ?? null)
      }
      return cache.get(uuid)
    }
    const found = []
    const consider = async (doc, owner) => {
      if (!negotiationLooksLost(doc?.system)) return
      let source = await load(compendiumSourceOf(doc))
      if (source?.type !== doc.type && owner) {
        const twin = (await load(compendiumSourceOf(owner)))?.items?.get?.(doc.id)
        source = twin?.type === doc.type && twin.name === doc.name ? twin : null
      }
      if (source?.type !== doc.type) return
      const value = sourceNegotiation(source.system)
      if (value > 0) found.push({
        uuid: doc.uuid, name: doc.name, owner: owner?.name ?? "", value, source: source.uuid ?? ""
      })
    }
    for (const actor of actors ?? []) {
      await consider(actor, null)
      for (const item of actor.items ?? []) if (item.type === "itemContact") await consider(item, actor)
    }
    for (const item of items ?? []) if (item.type === "itemContact") await consider(item, null)
    return found
  }

  static open() {
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("SR5.NEGO_REPAIR_OnlyGM"))
    const app = foundry.applications.instances.get("sr5-negotiation-repair") ?? new SR5NegotiationRepair()
    return app.render({
      force: true
    })
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const record = game.settings.get("sr5", "sr5NegotiationRepair") ?? {
    }
    context.done = record.date ? game.i18n.format("SR5.NEGO_REPAIR_AlreadyDone", {
      date: new Date(record.date).toLocaleString(), count: record.count ?? 0, user: record.user ?? ""
    }) : ""
    context.isActiveGM = SR5NegotiationRepair.isActiveGM
    context.candidates = context.done || !game.user.isGM ? [] : await SR5NegotiationRepair.findCandidates()
    return context
  }

  /** Apply what the gamemaster ticked: the list is recomputed first, the one on screen proves nothing. */
  static async #apply() {
    if (!SR5NegotiationRepair.isActiveGM) return ui.notifications.warn(game.i18n.localize("SR5.NEGO_REPAIR_OnlyGM"))
    const ticked = [...this.element.querySelectorAll("input[name=candidate]:checked")].map(input => input.value)
    if (!ticked.length) return ui.notifications.warn(game.i18n.localize("SR5.NEGO_REPAIR_NoneTicked"))
    // Claimed in the register first: a second click, or a second window, finds it taken and does nothing
    const date = new Date().toISOString()
    const claimed = await updateLedger("sr5NegotiationRepair", ledger => ledger.date ? null : {
      date, count: 0, user: game.user.name
    })
    if (!claimed) return this.render()
    const chosen = (await SR5NegotiationRepair.findCandidates()).filter(c => ticked.includes(c.uuid))
    let count = 0
    for (const candidate of chosen) {
      const doc = await fromUuid(candidate.uuid)
      if (!doc) continue
      await doc.update({
        "system.skills.negotiation.rating.base": candidate.value
      })
      count++
    }
    await updateLedger("sr5NegotiationRepair", ledger => ({
      ...ledger, count
    }))
    ui.notifications.info(game.i18n.format("SR5.NEGO_REPAIR_Applied", {
      count
    }))
    this.render()
  }
}
