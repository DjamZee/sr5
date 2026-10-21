import {
  negotiationLooksLost, sourceNegotiation, compendiumSourceOf
} from "./negotiation-repair-rules.js"
import {
  updateLedger
} from "../system/gm-ledger.js"
import {
  isMegapackPackage
} from "../system/megapack.js"
import {
  formatDateTime
} from "../helpers/number-format.js"

/** What a compendium index must carry so that an entry stands for its document. */
const INDEX_FIELDS = ["system.skills.negotiation.rating.base", "system.skills.negociation"]
/** How many compendium documents are asked for at once. */
const PREFETCH_CHUNK = 50

/**
 * A compendium uuid cut into its pack, its document id and, for an embedded document, its type and id:
 * `Compendium.<package>.<pack>.<Type>.<id>[.<Embedded>.<id>]`, or the older form without the type.
 * @param {string} uuid
 * @returns {{collection: string, id: string, embedded: string[]|null}|null}
 */
export function parseCompendiumUuid(uuid) {
  const parts = typeof uuid === "string" ? uuid.split(".") : []
  if (parts[0] !== "Compendium" || parts.length < 4) return null
  const rest = parts.slice(3)
  const [id, ...embedded] = rest.length % 2 ? rest : rest.slice(1)
  return {
    collection: `${parts[1]}.${parts[2]}`, id, embedded: embedded.length === 2 ? embedded : null
  }
}

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
    classes: ["sr5", "sr-negotiation-repair"],
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
      template: "systems/sr5/templates/interface/negotiation-repair.hbs", scrollable: [".sr-negotiation-repair-list"]
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
   * Fast on a world of several hundred actors (Romuald, ~400 actors: nothing after 5 minutes): a source
   * is read off its compendium's index, which carries the Negotiation, and not loaded document by
   * document; only the actors whose embedded contacts are needed are loaded, together, pack by pack.
   *
   * @param {object} [from]  what to look through, how to resolve a uuid, the compendiums, the
   *                         corrections already applied (for the tests), and onProgress(done, total)
   * @returns {Promise<{uuid, name, owner, value, source}[]>}
   */
  static async findCandidates({
    actors = game.actors, items = game.items, resolve = uuid => fromUuid(uuid),
    itemPacks = game.packs?.filter(pack => pack.documentName === "Item") ?? [],
    packs = globalThis.game?.packs,
    applied = (game.settings.get("sr5", "sr5NegotiationRepair") ?? {
    }).applied ?? {
    },
    onProgress = null,
  } = {
  }) {
    // The Megapack first (arbitrage de DjamZ, séance H, H18): its contacts carry the same ids and names as
    // those of sr5-compendiums, whose Negotiation can be lost (0) where the Megapack's is right
    const isMegapack = pack => isMegapackPackage(pack?.metadata?.packageName ?? pack?.metadata?.package)
    itemPacks = [...itemPacks.filter(isMegapack), ...itemPacks.filter(pack => !isMegapack(pack))]
    const indexes = new Map()
    const indexOf = async pack => {
      if (!indexes.has(pack)) {
        let index = null
        try {
          index = await pack.getIndex({
            fields: INDEX_FIELDS
          })
        } catch (_err) { /* an unreadable pack: skipped */ }
        indexes.set(pack, index)
      }
      return indexes.get(pack)
    }
    // An index entry stands for its document when it carries the skills as the data model reads them;
    // a source still under the former key needs migrateData, so the document itself (undefined here)
    const lightOf = (pack, entry) => {
      if (!entry?.system || entry.system.skills?.negociation) return undefined
      return {
        uuid: entry.uuid ?? `Compendium.${pack.collection}.${pack.documentName}.${entry._id}`,
        type: entry.type, name: entry.name, system: entry.system, compendium: pack, parent: null,
      }
    }
    const fromEntry = async (pack, entry) => {
      const light = lightOf(pack, entry)
      if (light !== undefined) return light
      try {
        return await pack.getDocument(entry._id)
      } catch (_err) {
        return null
      }
    }
    const packTwin = async doc => {
      for (const pack of itemPacks) {
        const entry = (await indexOf(pack))?.get?.(doc.id)
        if (entry?.type !== doc.type || entry.name !== doc.name) continue
        const twin = await fromEntry(pack, entry)
        if (twin) return twin
      }
      return null
    }
    // A second copy of the same contact on a sheet gets a new id (measured): the name and type then,
    // only when a single entry of the item compendiums carries them. The names are gathered once.
    let byName = null
    const namedTwin = async doc => {
      if (!byName) {
        byName = new Map()
        for (const pack of itemPacks) for (const entry of (await indexOf(pack))?.values?.() ?? []) {
          const key = `${entry?.type}\u0000${entry?.name}`
          if (!byName.has(key)) byName.set(key, [])
          byName.get(key).push([pack, entry])
        }
      }
      let named = byName.get(`${doc.type}\u0000${doc.name}`) ?? []
      // The same contact in both modules: the Megapack's answers, when it holds a single one
      const fromMegapack = named.filter(([pack]) => isMegapack(pack))
      if (fromMegapack.length) named = fromMegapack
      if (named.length !== 1) return null
      return fromEntry(...named[0])
    }
    // Whole documents, for the contacts embedded in a compendium actor: loaded together, pack by pack
    const wholes = new Map()
    const prefetch = async uuids => {
      const byPack = new Map()
      for (const uuid of uuids) {
        const ref = parseCompendiumUuid(uuid)
        const pack = ref && packs?.get?.(ref.collection)
        if (!pack?.getDocuments || wholes.has(`${ref.collection}|${ref.id}`)) continue
        if (!byPack.has(pack)) byPack.set(pack, new Set())
        byPack.get(pack).add(ref.id)
      }
      for (const [pack, ids] of byPack) {
        const list = [...ids]
        for (let i = 0; i < list.length; i += PREFETCH_CHUNK) {
          try {
            for (const doc of await pack.getDocuments({
              _id__in: list.slice(i, i + PREFETCH_CHUNK)
            })) wholes.set(`${pack.collection}|${doc.id}`, doc)
          } catch (_err) { /* an unreadable pack: each is resolved alone below */ }
        }
      }
    }
    const resolved = new Map()
    const resolveOnce = async uuid => {
      if (!resolved.has(uuid)) {
        let doc = null
        try {
          doc = await resolve(uuid)
        } catch (_err) { /* a source gone: no candidate */ }
        resolved.set(uuid, doc ?? null)
      }
      return resolved.get(uuid)
    }
    // The whole source document (to read the contacts it carries)
    const loadWhole = async uuid => {
      if (!uuid) return null
      const ref = parseCompendiumUuid(uuid)
      const whole = ref && wholes.get(`${ref.collection}|${ref.id}`)
      if (whole) return ref.embedded ? whole.getEmbeddedDocument?.(ref.embedded[0], ref.embedded[1]) ?? whole.items?.get?.(ref.embedded[1]) ?? null : whole
      return resolveOnce(uuid)
    }
    // The source as far as the repair needs it: its index entry when that is enough
    const loadSource = async uuid => {
      if (!uuid) return null
      const ref = parseCompendiumUuid(uuid)
      const pack = ref && !ref.embedded && packs?.get?.(ref.collection)
      if (pack) {
        const index = await indexOf(pack)
        if (index) {
          const entry = index.get?.(ref.id)
          if (!entry) return null
          const light = lightOf(pack, entry)
          if (light !== undefined) return light
        }
      }
      return loadWhole(uuid)
    }

    // What to look at: the documents whose Negotiation looks lost, not corrected yet
    const todo = []
    const keep = (doc, owner) => {
      if (negotiationLooksLost(doc?.system) && !applied[doc.uuid]) todo.push([doc, owner])
    }
    for (const actor of actors ?? []) {
      keep(actor, null)
      for (const item of actor.items ?? []) if (item.type === "itemContact") keep(item, actor)
    }
    for (const item of items ?? []) if (item.type === "itemContact") keep(item, null)
    onProgress?.(0, todo.length)
    await prefetch(todo.flatMap(([doc, owner]) => [
      parseCompendiumUuid(compendiumSourceOf(doc))?.embedded ? compendiumSourceOf(doc) : "",
      owner ? compendiumSourceOf(owner) : "",
    ]).filter(Boolean))

    const found = []
    let done = 0
    for (const [doc, owner] of todo) {
      let source = await loadSource(compendiumSourceOf(doc))
      if (source?.type !== doc.type && doc.type === "itemContact") source = await packTwin(doc)
      if (source?.type !== doc.type && owner) {
        const twin = (await loadWhole(compendiumSourceOf(owner)))?.items?.get?.(doc.id)
        source = twin?.type === doc.type && twin.name === doc.name ? twin : null
      }
      if (source?.type !== doc.type && doc.type === "itemContact") source = await namedTwin(doc)
      const value = source?.type === doc.type ? sourceNegotiation(source.system) : 0
      if (value > 0) found.push({
        uuid: doc.uuid, name: doc.name, owner: owner?.name ?? "", value, source: source.uuid ?? "",
        // Where the value comes from, shown to the gamemaster: the compendium, and the actor inside it
        from: [source.compendium?.title ?? source.pack ?? "", source.parent?.name ?? ""].filter(Boolean).join(" › "),
      })
      onProgress?.(++done, todo.length)
    }
    return found
  }

  static open() {
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("SR5.NEGO_REPAIR_OnlyGM"))
    const app = foundry.applications.instances.get("sr5-negotiation-repair") ?? new SR5NegotiationRepair()
    // Opened again: looked for again
    if (!app.#searching) app.#candidates = null
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
      date: formatDateTime(last.date), count: last.count ?? 0, user: last.user ?? ""
    }) : ""
    context.isActiveGM = SR5NegotiationRepair.isActiveGM
    // The window opens at once and says how far the search is; the list comes when it is done
    if (this.#candidates === null && game.user.isGM) this.#search()
    context.searching = this.#candidates === null && game.user.isGM
    context.progress = this.#progress
    context.candidates = this.#candidates ?? []
    return context
  }

  /** "Tout réparer" (relecture djamz.13, R9): ticks or unticks every sheet of the list, all at 0. */
  async _onRender(context, options) {
    await super._onRender(context, options)
    const all = this.element.querySelector("input[name=repairAll]")
    const boxes = () => [...this.element.querySelectorAll("input[name=candidate]")]
    all?.addEventListener("change", () => {
      for (const box of boxes()) box.checked = all.checked
    })
    for (const box of boxes()) box.addEventListener("change", () => {
      if (all) all.checked = boxes().every(b => b.checked)
    })
  }

  /** The candidates found, null while they are being looked for. */
  #candidates = null
  #searching = false
  #progress = ""

  async #search() {
    if (this.#searching) return
    this.#searching = true
    this.#progress = ""
    try {
      this.#candidates = await SR5NegotiationRepair.findCandidates({
        onProgress: (done, total) => {
          this.#progress = game.i18n.format("SR5.NEGO_REPAIR_Searching", {
            done, total
          })
          const progress = this.element?.querySelector(".sr-negotiation-repair-progress")
          if (progress) progress.textContent = this.#progress
        }
      })
    } catch (err) {
      console.error(err)
      this.#candidates = []
    } finally {
      this.#searching = false
    }
    if (this.rendered) this.render()
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
    // The list is looked for again before any write: the button says it is working
    const button = this.element.querySelector("[data-action=apply]")
    if (button) {
      button.disabled = true
      button.querySelector("i")?.classList.replace("fa-check", "fa-spinner")
      button.querySelector("i")?.classList.add("fa-spin")
    }
    const all = await SR5NegotiationRepair.findCandidates()
    const fresh = all.filter(c => ticked.includes(c.uuid))
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
    // What was just looked for, less what was just claimed: no third search
    const claimed = new Set(chosen.map(c => c.uuid))
    this.#candidates = all.filter(c => !claimed.has(c.uuid))
    this.render()
  }
}
