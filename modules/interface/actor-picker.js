/**
 * A list of the world's actors for a window that picks some of them: a scrolling box of fixed height, a search on
 * the name that ignores accents and case, the actors grouped under their Foundry folders (collapsible, plus
 * « no folder »), an optional filter by kind, and the chosen ones always shown and marked, even when filtered out.
 * The pure part (foldKey, actorKind, visibleIds, folderTree) is tested without Foundry (tests/actor-picker.test.js);
 * the ActorPicker class keeps its state across the window's renders and draws itself into a container.
 * First used by the con tracker (con-app.js).
 */

export const PICKER_KINDS = ["pc", "npc", "grunt"]

// A name as the search reads it: no accents, no case, no extra blanks
export const foldKey = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/\s+/g, " ").trim()

// A player character has a player owner; a character without one is a non-player character
export const actorKind = ({
  type, hasPlayerOwner
}) => type === "actorPc" ? (hasPlayerOwner ? "pc" : "npc") : type === "actorGrunt" ? "grunt" : "other"

const byName = (a, b) => a.name.localeCompare(b.name)
// Up to this many entries, the folders open unfolded
const SMALL_LIST = 20

/**
 * The ids shown for a search and a kind; the chosen and the always shown ones stay in whatever the filter says.
 * The search reads the name, or the entry's own search text when it has one (a contact: its name and its owner's).
 * @param {Array<{id, name, kind, search?}>} entries
 * @param {{query?: string, kind?: string, keep?: Iterable<string>}} filter
 * @returns {Set<string>}
 */
export function visibleIds(entries, {
  query = "", kind = "", keep = []
} = {
}){
  const words = foldKey(query).split(" ").filter(Boolean)
  const kept = new Set(keep)
  const shown = new Set()
  for (const entry of entries){
    const key = foldKey(entry.search ?? entry.name)
    if (kept.has(entry.id) || ((!kind || entry.kind === kind) && words.every(w => key.includes(w)))) shown.add(entry.id)
  }
  return shown
}

/**
 * The folder tree of a list of actors: only the folders that hold some, sorted by name, and the actors without
 * folder (or in a folder not given) under a last node of id null.
 * @param {Array<{id, name, folderId}>} entries
 * @param {Array<{id, name, parentId}>} folders
 * @returns {Array<{id, name, depth, folders, actors, count}>}
 */
export function folderTree(entries, folders){
  const nodes = new Map(folders.map(f => [f.id, {
    id: f.id, name: f.name, parentId: f.parentId ?? null, folders: [], actors: [], count: 0
  }]))
  const loose = {
    id: null, name: "", folders: [], actors: [], count: 0
  }
  for (const entry of entries) (nodes.get(entry.folderId) ?? loose).actors.push(entry)
  const roots = []
  for (const node of nodes.values()){
    const parent = nodes.get(node.parentId)
    // A folder whose parent is missing, or a loop, hangs at the root
    if (parent && parent !== node) parent.folders.push(node)
    else roots.push(node)
  }
  const seen = new Set()
  const settle = (node, depth) => {
    if (seen.has(node)) return 0
    seen.add(node)
    node.depth = depth
    node.actors.sort(byName)
    node.folders = node.folders.filter(child => settle(child, depth + 1) > 0).sort(byName)
    node.count = node.actors.length + node.folders.reduce((sum, child) => sum + child.count, 0)
    return node.count
  }
  const tree = roots.filter(node => settle(node, 0) > 0).sort(byName)
  if (loose.actors.length){
    settle(loose, 0)
    tree.push(loose)
  }
  return tree
}

// The entries and the folders of Foundry actors, in the shape the pure functions read
export function actorEntries(actors){
  return [...actors].map(a => ({
    id: a.id, name: a.name, img: a.img, type: a.type, kind: actorKind(a), folderId: a.folder?.id ?? null
  }))
}

export function actorFolders(){
  return (game.folders?.filter(f => f.type === "Actor") ?? []).map(f => ({
    id: f.id, name: f.name, parentId: f.folder?.id ?? null
  }))
}

export class ActorPicker {

  /**
   * @param {object} options
   * @param {string} options.name          the input name, read back by values()
   * @param {boolean} [options.multiple]   checkboxes, or a single choice
   * @param {string} [options.noneLabel]   a single choice: the label of « none »
   * @param {string} [options.markIcon]    the icon of the marked entries
   * @param {Function} [options.onChange]  called with values() when the choice changes
   */
  constructor({
    name, multiple = false, noneLabel = "", markIcon = "fa-masks-theater", onChange = null
  }){
    this.onChange = onChange
    this.name = name
    this.multiple = multiple
    this.noneLabel = noneLabel
    this.markIcon = markIcon
    this.query = ""
    this.kind = ""
    this.selected = new Set()
    this.opened = new Set()
    this.entries = []
    this.marks = new Map()
  }

  values(){
    return [...this.selected]
  }

  value(){
    return this.values()[0] ?? ""
  }

  clear(){
    this.selected.clear()
  }

  /**
   * Draws the picker into a container, with the actors and folders of the moment.
   * @param {HTMLElement} container
   * @param {object} data
   * @param {Array} data.entries      actorEntries()
   * @param {Array} data.folders      actorFolders()
   * @param {Map<string,string>} [data.marks]   id → tooltip of the actors to mark and always show
   */
  render(container, {
    entries, folders, marks = new Map()
  }){
    if (!container) return
    this.entries = entries
    this.marks = marks
    // An actor deleted since stays out
    for (const id of this.selected) if (!entries.some(e => e.id === id)) this.selected.delete(id)
    const t = key => game.i18n.localize(key)
    const el = (tag, attrs = {
    }, text) => {
      const node = document.createElement(tag)
      for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v)
      if (text !== undefined) node.textContent = text
      return node
    }

    const root = el("div", {
      class: "sr-actor-picker"
    })
    const tools = root.appendChild(el("div", {
      class: "sr-ap-tools"
    }))
    const search = tools.appendChild(el("input", {
      type: "search", class: "sr-ap-search", placeholder: t("SR5.ACTOR_PICKER_Search"), value: this.query
    }))
    const kinds = PICKER_KINDS.filter(k => entries.some(e => e.kind === k))
    let kindSelect = null
    if (kinds.length > 1){
      kindSelect = tools.appendChild(el("select", {
        class: "sr-ap-kind"
      }))
      kindSelect.appendChild(el("option", {
        value: ""
      }, t("SR5.ACTOR_PICKER_AllKinds")))
      for (const k of kinds) kindSelect.appendChild(el("option", {
        value: k, selected: this.kind === k
      }, t(`SR5.ACTOR_PICKER_Kind_${k}`)))
    } else this.kind = ""

    const chosen = root.appendChild(el("div", {
      class: "sr-ap-chosen"
    }))
    const list = root.appendChild(el("div", {
      class: "sr-ap-list"
    }))
    const empty = root.appendChild(el("p", {
      class: "sr-ap-empty hint", hidden: true
    }, t("SR5.ACTOR_PICKER_Empty")))

    const type = this.multiple ? "checkbox" : "radio"
    const inputs = new Map()
    if (!this.multiple && this.noneLabel){
      const row = list.appendChild(el("label", {
        class: "sr-ap-actor sr-ap-none"
      }))
      const input = row.appendChild(el("input", {
        type, name: this.name, value: "", checked: !this.selected.size
      }))
      row.appendChild(el("span", {
        class: "sr-ap-name"
      }, this.noneLabel))
      input.addEventListener("change", () => {
        this.selected.clear()
        refresh()
        this.onChange?.(this.values())
      })
    }

    const drawActor = (parent, entry) => {
      const row = parent.appendChild(el("label", {
        class: "sr-ap-actor", "data-id": entry.id
      }))
      const input = row.appendChild(el("input", {
        type, name: this.name, value: entry.id, checked: this.selected.has(entry.id)
      }))
      if (entry.img) row.appendChild(el("img", {
        src: entry.img, alt: "", loading: "lazy"
      }))
      row.appendChild(el("span", {
        class: "sr-ap-name"
      }, entry.name))
      if (marks.has(entry.id)){
        row.classList.add("marked")
        row.appendChild(el("i", {
          class: `fas ${this.markIcon} sr-ap-mark`, "data-tooltip": marks.get(entry.id)
        }))
      }
      input.addEventListener("change", () => {
        if (!this.multiple) this.selected.clear()
        if (input.checked) this.selected.add(entry.id)
        else this.selected.delete(entry.id)
        refresh()
        this.onChange?.(this.values())
      })
      inputs.set(entry.id, {
        row, input
      })
    }

    const folderNodes = []
    const drawFolder = (parent, node) => {
      const key = node.id ?? "__none__"
      const box = parent.appendChild(el("div", {
        class: "sr-ap-folder", "data-folder": key
      }))
      const head = box.appendChild(el("a", {
        class: "sr-ap-folder-head"
      }))
      head.appendChild(el("i", {
        class: "fas fa-folder sr-ap-folder-icon"
      }))
      head.appendChild(el("span", {
        class: "sr-ap-folder-name"
      }, node.id ? node.name : t("SR5.ACTOR_PICKER_NoFolder")))
      const count = head.appendChild(el("span", {
        class: "sr-ap-count"
      }))
      const body = box.appendChild(el("div", {
        class: "sr-ap-children"
      }))
      for (const child of node.folders) drawFolder(body, child)
      for (const entry of node.actors) drawActor(body, entry)
      head.addEventListener("click", () => {
        if (this.opened.has(key)) this.opened.delete(key)
        else this.opened.add(key)
        refresh()
      })
      folderNodes.push({
        key, box, count, node
      })
    }
    for (const node of folderTree(entries, folders)) drawFolder(list, node)

    // What the search, the kind and the folders show; the chosen and marked ones stay on top as chips
    const refresh = () => {
      const keep = [...this.selected, ...marks.keys()]
      const shown = visibleIds(entries, {
        query: this.query, kind: this.kind, keep
      })
      const filtering = !!foldKey(this.query) || !!this.kind
      for (const [id, {
        row, input
      }] of inputs){
        row.hidden = !shown.has(id)
        input.checked = this.selected.has(id)
        row.classList.toggle("selected", this.selected.has(id))
      }
      const noneInput = list.querySelector(".sr-ap-none input")
      if (noneInput) noneInput.checked = !this.selected.size
      // From the deepest folder up (folderNodes is in post-order): a folder shows when one of its actors does
      const visibleIn = new Map()
      for (const {
        key, box, count, node
      } of folderNodes){
        const n = node.actors.filter(e => shown.has(e.id)).length +
          node.folders.reduce((sum, child) => sum + (visibleIn.get(child.id ?? "__none__") ?? 0), 0)
        visibleIn.set(key, n)
        box.hidden = n === 0
        count.textContent = filtering ? `${n} / ${node.count}` : `${node.count}`
        // A short list opens unfolded: a click folds it, as a click unfolds a long one
        const open = filtering || (entries.length <= SMALL_LIST) !== this.opened.has(key)
        box.classList.toggle("open", open)
        box.querySelector(":scope > .sr-ap-folder-head > .sr-ap-folder-icon").className =
          `fas ${open ? "fa-folder-open" : "fa-folder"} sr-ap-folder-icon`
      }
      empty.hidden = shown.size > 0
      chosen.replaceChildren()
      for (const id of this.selected){
        const entry = entries.find(e => e.id === id)
        if (!entry) continue
        const chip = chosen.appendChild(el("span", {
          class: "sr-ap-chip"
        }, entry.name))
        const remove = chip.appendChild(el("a", {
          "data-tooltip": t("SR5.ACTOR_PICKER_Remove")
        }))
        remove.appendChild(el("i", {
          class: "fas fa-xmark"
        }))
        remove.addEventListener("click", () => {
          this.selected.delete(id)
          refresh()
          this.onChange?.(this.values())
        })
      }
      chosen.hidden = !this.selected.size
    }

    search.addEventListener("input", () => {
      this.query = search.value
      refresh()
    })
    kindSelect?.addEventListener("change", () => {
      this.kind = kindSelect.value
      refresh()
    })
    container.replaceChildren(root)
    refresh()
  }
}
