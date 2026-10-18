// A compendium drawn as if it were a table.
//
// "Tirer au hasard" on a compendium, one of its folders, or what the
// compendium browser's filters show, builds a table in memory — one line per
// entry, each as likely as the others — and draws it as any table is drawn.
// The card is therefore the table card, with its header, its grouping of
// repeats and its "Donner" button for the items; nothing is written to the
// world. The card keeps where its lines came from, so "Relancer" draws from
// the same place again (table-actions.js).

import {
  SR5CompendiumBrowser
} from "./compendium-browser.js"
import {
  escape
} from "../system/card-helpers.js"

/** At most this many draws in one go: a slip of the keyboard is not a thousand cards' worth of loot. */
export const MAX_DRAWS = 100

/**
 * The lines of a table holding the given entries, each weighing as given.
 *
 * Ranges are laid end to end in the order of the entries, so a line weighing
 * three covers three faces of the die. A weight below one leaves the entry
 * out: zero is how a line is struck off the table.
 *
 * @param {Array<{uuid: string, name: string, img?: string}>} entries
 * @param {number[]} [weights]  one per entry; every entry weighs one without them
 * @returns {{results: object[], formula: string}}  the lines, and the die that covers them
 */
export function sr5EntryResults(entries, weights = null) {
  const results = []
  let next = 1
  entries.forEach((entry, index) => {
    const weight = weights ? Math.floor(Number(weights[index])) : 1
    if (!(weight >= 1)) return
    results.push({
      _id: foundry.utils.randomID(),
      type: "document",
      name: entry.name,
      img: entry.img || undefined,
      documentUuid: entry.uuid,
      weight,
      range: [next, next + weight - 1],
      drawn: false
    })
    next += weight
  })
  return {
    results, formula: `1d${Math.max(1, next - 1)}`
  }
}

/**
 * The entries of a compendium, or of one of its folders and the folders inside it.
 * @param {CompendiumCollection} pack
 * @param {string|null} [folderId]
 * @returns {Promise<Array<{uuid: string, name: string, img: string}>>}
 */
export async function sr5PackEntries(pack, folderId = null) {
  const index = await pack.getIndex()
  let folders = null
  if (folderId) {
    folders = new Set([folderId])
    for (let grew = true; grew;) {
      grew = false
      for (const folder of pack.folders ?? []) {
        if (folders.has(folder.id) || !folders.has(folder.folder?.id)) continue
        folders.add(folder.id)
        grew = true
      }
    }
  }
  return [...index]
    .filter(entry => !folders || folders.has(entry.folder))
    .map(entry => ({
      uuid: entry.uuid ?? pack.getUuid(entry._id), name: entry.name, img: entry.img
    }))
}

/**
 * Draw `count` times among the entries, each as likely as the others, onto a
 * table card.
 *
 * @param {Array<{uuid: string, name: string, img?: string}>} entries
 * @param {object} options
 * @param {string} options.name       what the card is titled
 * @param {string} [options.img]
 * @param {number} [options.count]    how many draws
 * @param {object} options.source     where the entries came from, for "Relancer"
 * @param {string} [options.rollMode]
 * @returns {Promise<object|null>}  the draw, or null when there was nothing to draw
 */
export async function sr5DrawEntries(entries, {
  name, img, count = 1, source, rollMode
}) {
  if (!entries?.length) {
    ui.notifications.warn(game.i18n.localize("SR5.CompendiumDrawEmpty"))
    return null
  }
  const draws = Math.min(MAX_DRAWS, Math.max(1, Math.floor(Number(count)) || 1))
  const {
    results, formula
  } = sr5EntryResults(entries)
  const table = new CONFIG.RollTable.documentClass({
    _id: foundry.utils.randomID(),
    name,
    img: img || undefined,
    formula,
    replacement: true,
    // The die says nothing here: a face of a die as large as the compendium
    displayRoll: false,
    results
  })
  table.sr5DrawSource = {
    ...source, name, img: img ?? null, count: draws
  }
  // A compendium of tables gives tables, not what they would draw
  return table.drawMany(draws, {
    recursive: false, rollMode
  })
}

/**
 * The entries a card drawn from a compendium was drawn among, read anew.
 * Null when that place is gone, or hidden from this user.
 * @param {object} source  flags.sr5.tableDrawSource
 * @returns {Promise<Array|null>}
 */
export async function sr5EntriesOfSource(source) {
  if (source?.kind === "pack") {
    const pack = game.packs.get(source.pack)
    if (!pack || (!game.user.isGM && !pack.visible)) return null
    return sr5PackEntries(pack, source.folder ?? null)
  }
  if (source?.kind === "browser") return SR5CompendiumBrowser.entriesFor(source.state)
  return null
}

/**
 * Ask how many draws, then draw.
 * @param {object} options
 * @param {string} options.name
 * @param {string} [options.img]
 * @param {Array} options.entries
 * @param {object} options.source
 */
export async function sr5PromptDraw({
  name, img, entries, source
}) {
  if (!entries?.length) {
    ui.notifications.warn(game.i18n.localize("SR5.CompendiumDrawEmpty"))
    return null
  }
  const count = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.localize("SR5.CompendiumDraw"), icon: "fa-solid fa-dice"
    },
    content: `<p>${game.i18n.format("SR5.CompendiumDrawPrompt", {
      name: escape(name), count: entries.length
    })}</p><div class="form-group"><label>${game.i18n.localize("SR5.CompendiumDrawCount")}</label>` +
      `<input type="number" name="count" value="1" min="1" max="${MAX_DRAWS}" step="1" autofocus></div>`,
    ok: {
      label: game.i18n.localize("SR5.CompendiumDraw"),
      icon: "fa-solid fa-dice",
      callback: (event, button) => button.form.elements.count.valueAsNumber
    },
    rejectClose: false
  })
  if (!count) return null
  return sr5DrawEntries(entries, {
    name, img, count, source
  })
}

/**
 * Draw from a whole compendium, or from one of its folders.
 * @param {CompendiumCollection} pack
 * @param {Folder} [folder]
 */
async function promptPack(pack, folder = null) {
  if (!pack) return
  const entries = await sr5PackEntries(pack, folder?.id ?? null)
  return sr5PromptDraw({
    name: folder ? `${pack.title} — ${folder.name}` : pack.title,
    img: pack.banner ?? null,
    entries,
    source: {
      kind: "pack", pack: pack.collection, folder: folder?.id ?? null
    }
  })
}

/** Whether a compendium holds documents that can be drawn. */
function drawable(pack) {
  return Boolean(pack?.visible && pack.documentName !== "Adventure")
}

/** Whether this user may make a table of a compendium: a world table is the game master's to create. */
function buildable(pack) {
  return drawable(pack) && foundry.documents.RollTable.implementation.canUserCreate(game.user)
}

/**
 * The window that makes a world table of compendium entries, each with a
 * weight: one by default, more for what should come up more often, zero for
 * what should not be on the table at all.
 *
 * Nothing in the window is written anywhere until "Créer la table": the
 * weights live in the form, and a filter only hides rows, so a weight set
 * before filtering is still there after.
 */
export class SR5WeightedTableBuilder extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /**
   * @param {object} options
   * @param {string} options.name       the table's name, to begin with
   * @param {Array<{uuid: string, name: string, img?: string}>} options.entries
   */
  constructor({
    name, entries, ...options
  } = {
  }) {
    super(options)
    this.tableName = name ?? ""
    this.entries = [...(entries ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["sr5", "sr-application", "sr-table-builder-window"],
    position: {
      width: 520, height: 640
    },
    window: {
      title: "SR5.TableBuilderTitle",
      icon: "fa-solid fa-table-list",
      resizable: true
    },
    form: {
      handler: SR5WeightedTableBuilder.#onSubmit,
      // Closed by the handler, once the table exists: a table with every weight at zero keeps the window open
      closeOnSubmit: false
    },
    actions: {
      excludeHidden: SR5WeightedTableBuilder.#onExcludeHidden,
      resetWeights: SR5WeightedTableBuilder.#onResetWeights
    }
  }

  static PARTS = {
    form: {
      template: "systems/sr5/templates/interface/table-builder.hbs",
      scrollable: [".sr-table-builder-list"]
    }
  }

  /**
   * Open the window on some entries, or say there are none.
   * @param {string} name
   * @param {Array} entries
   */
  static open(name, entries) {
    if (!entries?.length) {
      ui.notifications.warn(game.i18n.localize("SR5.CompendiumDrawEmpty"))
      return null
    }
    const app = new SR5WeightedTableBuilder({
      name, entries
    })
    app.render(true)
    return app
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    context.name = this.tableName
    context.entries = this.entries.map(entry => ({
      ...entry,
      img: entry.img || "icons/svg/item-bag.svg",
      search: entry.name.toLocaleLowerCase()
    }))
    return context
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options)
    const filter = this.element.querySelector(".sr-table-builder-filter")
    filter?.addEventListener("input", () => {
      const text = filter.value.trim().toLocaleLowerCase()
      for (const row of this.element.querySelectorAll(".sr-table-builder-entry")) {
        row.hidden = Boolean(text) && !row.dataset.search.includes(text)
      }
    })
    this.element.addEventListener("input", event => {
      if (event.target.matches?.("input[data-weight]")) this.#refreshCount()
    })
    this.#refreshCount()
  }

  /** The weight inputs, in the order of the entries. */
  #weightInputs() {
    return [...this.element.querySelectorAll("input[data-weight]")]
  }

  /** "Créer la table (n)": the entries the table will hold, a weight of zero left out (sr5EntryResults). */
  #refreshCount() {
    const count = this.element.querySelector(".sr-table-builder-count")
    if (count) count.textContent = this.#weightInputs().filter(input => Math.floor(Number(input.value)) >= 1).length
  }

  /** "Exclure les masquées": every row the filter hides weighs nothing. */
  static #onExcludeHidden() {
    for (const input of this.#weightInputs()) {
      if (input.closest(".sr-table-builder-entry")?.hidden) input.value = 0
    }
    this.#refreshCount()
  }

  /** "Tout remettre à 1". */
  static #onResetWeights() {
    for (const input of this.#weightInputs()) input.value = 1
    this.#refreshCount()
  }

  /**
   * Create the world table, and open it.
   * @param {SubmitEvent} _event
   * @param {HTMLFormElement} form
   */
  static async #onSubmit(_event, form) {
    const weights = []
    for (const input of this.#weightInputs()) weights[Number(input.dataset.weight)] = input.value
    const {
      results, formula
    } = sr5EntryResults(this.entries, weights)
    if (!results.length) {
      ui.notifications.warn(game.i18n.localize("SR5.TableBuilderEmpty"))
      return
    }
    const name = String(form.elements.name?.value ?? "").trim() || this.tableName
    await foundry.documents.RollTable.implementation.create({
      name, formula, replacement: true, results
    }, {
      renderSheet: true
    })
    return this.close()
  }
}

/**
 * Open the weighted table window on a compendium, or one of its folders.
 * @param {CompendiumCollection} pack
 * @param {Folder} [folder]
 */
async function buildFromPack(pack, folder = null) {
  if (!pack) return
  return SR5WeightedTableBuilder.open(folder ? folder.name : pack.title,
    await sr5PackEntries(pack, folder?.id ?? null))
}

/**
 * "Tirer au hasard" in the context menu of a compendium, in the sidebar.
 * Hook `getCompendiumContextOptions`.
 * @param {Application} _app
 * @param {object[]} options
 */
export function sr5HookCompendiumDrawContext(_app, options) {
  options.push({
    name: "SR5.CompendiumDraw",
    icon: "<i class=\"fa-solid fa-dice\"></i>",
    condition: li => drawable(game.packs.get(li.dataset.pack)),
    callback: li => promptPack(game.packs.get(li.dataset.pack))
  }, {
    name: "SR5.TableBuilderTitle",
    icon: "<i class=\"fa-solid fa-table-list\"></i>",
    condition: li => buildable(game.packs.get(li.dataset.pack)),
    callback: li => buildFromPack(game.packs.get(li.dataset.pack))
  })
}

/**
 * "Tirer au hasard" in the menu of a compendium's window.
 * Hook `getHeaderControlsCompendium`.
 * @param {Compendium} app
 * @param {object[]} controls
 */
export function sr5HookCompendiumDrawHeader(app, controls) {
  if (!drawable(app.collection)) return
  controls.push({
    icon: "fa-solid fa-dice",
    label: "SR5.CompendiumDraw",
    action: "sr5CompendiumDraw",
    onClick: () => promptPack(app.collection)
  })
  if (!buildable(app.collection)) return
  controls.push({
    icon: "fa-solid fa-table-list",
    label: "SR5.TableBuilderTitle",
    action: "sr5CompendiumBuildTable",
    onClick: () => buildFromPack(app.collection)
  })
}

/**
 * "Tirer au hasard" on a folder inside a compendium's window. The same hook
 * serves the world's directories, whose folders are left alone.
 * Hook `getFolderContextOptions`.
 * @param {Application} app
 * @param {object[]} options
 */
export function sr5HookCompendiumDrawFolder(app, options) {
  if (!(app instanceof foundry.applications.sidebar.apps.Compendium)) return
  options.push({
    name: "SR5.CompendiumDraw",
    icon: "<i class=\"fa-solid fa-dice\"></i>",
    condition: () => drawable(app.collection),
    callback: async header => {
      const folder = await fromUuid(header.closest(".directory-item")?.dataset.uuid)
      if (folder) return promptPack(app.collection, folder)
    }
  }, {
    name: "SR5.TableBuilderTitle",
    icon: "<i class=\"fa-solid fa-table-list\"></i>",
    condition: () => buildable(app.collection),
    callback: async header => {
      const folder = await fromUuid(header.closest(".directory-item")?.dataset.uuid)
      if (folder) return buildFromPack(app.collection, folder)
    }
  })
}
