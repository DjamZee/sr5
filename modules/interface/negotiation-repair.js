import {
  negotiationLooksLost, sourceNegotiation, compendiumSourceOf
} from "./negotiation-repair-rules.js"
import {
  updateLedger
} from "../system/gm-ledger.js"

/**
 * The gamemaster's window that gives back the Negotiation lost before the key fix
 * (negotiation-repair-rules.js). It lists the actors and contacts of the world whose skill reads 0
 * while their compendium source gives more; the gamemaster ticks what applies, and each correction
 * is applied once to each sheet (the register keeps them), however often the window is run. Nothing is
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

  /** The world setting that records the corrections applied, by document uuid, and the last run. */
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
   * gives one above 0, and that this repair has not corrected already. A contact's own source is often
   * stale: every contact of fr_contacts carries the uuid of the actor it was copied from inside the
   * pack, and a contact dropped from a pack onto a sheet keeps it (Hugo, measured). Its twin is then
   * looked for by id: the drop keeps the id it has in its pack, and an import keeps the embedded ids,
   * so the same id, type and name in a compendium of items, else in the source of the actor that
   * carries it, is the original. Last, a name and a type that a single entry of the item compendiums
   * carries. The window shows the source: the gamemaster judges.
   *
   * @param {object} [from]  what to look through, how to resolve a uuid, the item compendiums and the
   *                         corrections already applied (for the tests)
   * @returns {Promise<{uuid, name, owner, value, source}[]>}
   */
  static async findCandidates({
    actors = game.actors, items = game.items, resolve = uuid => fromUuid(uuid),
    itemPacks = game.packs?.filter(pack => pack.documentName === "Item") ?? [],
    applied = (game.settings.get("sr5", "sr5NegotiationRepair") ?? {
    }).applied ?? {
    },
  } = {
  }) {
    const indexes = new Map()
    const indexOf = async pack => {
      if (!indexes.has(pack)) {
        let index = null
        try {
          index = await pack.getIndex()
        } catch (_err) { /* an unreadable pack: skipped */ }
        indexes.set(pack, index)
      }
      return indexes.get(pack)
    }
    const packTwin = async doc => {
      for (const pack of itemPacks) {
        const entry = (await indexOf(pack))?.get?.(doc.id)
        if (entry?.type !== doc.type || entry.name !== doc.name) continue
        try {
          return await pack.getDocument(doc.id)
        } catch (_err) { /* gone since the index: next pack */ }
      }
      return null
    }
    // A second copy of the same contact on a sheet gets a new id (measured): the name and type then,
    // only when a single entry of the item compendiums carries them
    const namedTwin = async doc => {
      const named = []
      for (const pack of itemPacks) await indexOf(pack)
      for (const pack of itemPacks) for (const entry of indexes.get(pack)?.values?.() ?? []) {
        if (entry?.type === doc.type && entry.name === doc.name) named.push([pack, entry._id])
      }
      if (named.length !== 1) return null
      try {
        return await named[0][0].getDocument(named[0][1])
      } catch (_err) {
        return null
      }
    }
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
      if (!negotiationLooksLost(doc?.system) || applied[doc.uuid]) return
      let source = await load(compendiumSourceOf(doc))
      if (source?.type !== doc.type && doc.type === "itemContact") source = await packTwin(doc)
      if (source?.type !== doc.type && owner) {
        const twin = (await load(compendiumSourceOf(owner)))?.items?.get?.(doc.id)
        source = twin?.type === doc.type && twin.name === doc.name ? twin : null
      }
      if (source?.type !== doc.type && doc.type === "itemContact") source = await namedTwin(doc)
      if (source?.type !== doc.type) return
      const value = sourceNegotiation(source.system)
      if (value > 0) found.push({
        uuid: doc.uuid, name: doc.name, owner: owner?.name ?? "", value, source: source.uuid ?? "",
        // Where the value comes from, shown to the gamemaster: the compendium, and the actor inside it
        from: [source.compendium?.title ?? source.pack ?? "", source.parent?.name ?? ""].filter(Boolean).join(" › "),
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
    const last = record.last
    context.last = last?.date ? game.i18n.format("SR5.NEGO_REPAIR_LastRun", {
      date: new Date(last.date).toLocaleString(), count: last.count ?? 0, user: last.user ?? ""
    }) : ""
    context.isActiveGM = SR5NegotiationRepair.isActiveGM
    context.candidates = game.user.isGM ? await SR5NegotiationRepair.findCandidates() : []
    return context
  }

  /**
   * Apply what the gamemaster ticked. The list is recomputed first, the one on screen proves nothing;
   * the corrections are claimed in the register before any write, one per document: a second click, a
   * second window or a later run never applies the same correction to the same sheet twice. What was
   * not ticked stays a candidate for a later run.
   */
  static async #apply() {
    if (!SR5NegotiationRepair.isActiveGM) return ui.notifications.warn(game.i18n.localize("SR5.NEGO_REPAIR_OnlyGM"))
    const ticked = [...this.element.querySelectorAll("input[name=candidate]:checked")].map(input => input.value)
    if (!ticked.length) return ui.notifications.warn(game.i18n.localize("SR5.NEGO_REPAIR_NoneTicked"))
    const fresh = (await SR5NegotiationRepair.findCandidates()).filter(c => ticked.includes(c.uuid))
    const date = new Date().toISOString()
    let chosen = []
    await updateLedger("sr5NegotiationRepair", ledger => {
      const applied = {
        ...(ledger.applied ?? {
        })
      }
      chosen = fresh.filter(c => !applied[c.uuid])
      if (!chosen.length) return null
      for (const c of chosen) applied[c.uuid] = {
        value: c.value, date
      }
      return {
        ...ledger, applied, last: {
          date, count: chosen.length, user: game.user.name
        }
      }
    })
    let count = 0
    for (const candidate of chosen) {
      const doc = await fromUuid(candidate.uuid)
      if (!doc) continue
      await doc.update({
        "system.skills.negotiation.rating.base": candidate.value
      })
      count++
    }
    // A second click finds everything claimed: nothing to say
    if (count) ui.notifications.info(game.i18n.format("SR5.NEGO_REPAIR_Applied", {
      count
    }))
    this.render()
  }
}
