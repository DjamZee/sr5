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
  const escape = text => foundry.utils.escapeHTML(String(text ?? ""))
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
  })
}
