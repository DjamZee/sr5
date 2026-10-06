import {
  SR5_SystemHelpers
} from "./system/utilitySystem.js"

// Every "modifiers" array of an actor or an item is computed: the preparation fills it (updateModifier),
// no sheet field and no code writes one on purpose. A prepared copy written back whole (toObject(false),
// fixed in 3a35dfa82) put them in the source, and the Mégapack actors pack was exported that way: the
// arrays that the preparation does not reset (fatigue, fall, capacity taken...) then grew at every
// preparation, up to 1415 entries. This migration empties them in the source, once per world.

// Bump to run the cleaning again on every world.
export const SOURCE_MODIFIERS_MIGRATION = 1

// Prepared actor copies kept on purpose (a drone's controller, a sprite's or spirit's creator): left as they are.
const SNAPSHOTS = new Set(["vehicleOwner", "creatorData"])

/**
 * The paths of the non empty "modifiers" arrays of a source system, nested item copies included
 * (accessories, a vehicle's weapons, a ritual's spells...).
 * @param {object} system  The source system (never the prepared one)
 * @param {string} prefix  The path of this system in its document
 * @return {string[]}
 */
export function computedModifierPaths(system, prefix = "system") {
  const paths = []
  const walk = (node, path, top) => {
    if (!node || typeof node !== "object") return
    for (const [key, value] of Object.entries(node)) {
      if (top && SNAPSHOTS.has(key)) continue
      const p = `${path}.${key}`
      if (key === "modifiers" && Array.isArray(value)) {
        if (value.length) paths.push(p)
      } else if (value && typeof value === "object") walk(value, p, false)
    }
  }
  walk(system, prefix, true)
  return paths
}

/**
 * The update that empties them, by path, or null when the source is clean.
 * Only the arrays at the top of a document's system can be written by path: an array inside another
 * array (an accessory of an augmentation) is written by replacing the outer array with a cleaned copy.
 * @param {object} system  The source system
 * @return {object|null}
 */
export function sourceModifiersUpdate(system) {
  const paths = computedModifierPaths(system)
  if (!paths.length) return null
  const update = {
  }
  const rewritten = new Set()
  for (const path of paths) {
    const parts = path.split(".")
    const index = parts.findIndex(part => /^\d+$/.test(part))
    if (index === -1) {
      update[path] = []
      continue
    }
    const outer = parts.slice(0, index).join(".")
    if (rewritten.has(outer)) continue
    rewritten.add(outer)
    const copy = foundry.utils.deepClone(foundry.utils.getProperty({
      system
    }, outer))
    emptyModifiers(copy)
    update[outer] = copy
  }
  return update
}

/**
 * At the start of a preparation: empties in place every "modifiers" array of a prepared system, so that
 * none of them starts from what the source holds nor from the previous preparation. Arrays are not
 * entered (stored item copies keep theirs), nor the prepared actor copies and the translation lists.
 * @param {object} system  The prepared system
 */
export function emptyPreparedModifiers(system) {
  const walk = (node, top) => {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue
      if (key === "modifiers" && Array.isArray(value)) node[key] = []
      else if (!Array.isArray(value) && !(top && (SNAPSHOTS.has(key) || key === "lists"))) walk(value, false)
    }
  }
  if (system && typeof system === "object") walk(system, true)
}

// Empties every "modifiers" array of a plain copy, in place
function emptyModifiers(node) {
  if (!node || typeof node !== "object") return
  for (const [key, value] of Object.entries(node)) {
    if (key === "modifiers" && Array.isArray(value)) node[key] = []
    else if (value && typeof value === "object") emptyModifiers(value)
  }
}

/**
 * Before a creation (_preCreate): an actor or an item imported from a pack exported prepared arrives clean,
 * its embedded items too.
 * @param {Document} document  The actor or item about to be created
 */
export function cleanCreatedSource(document) {
  const update = sourceModifiersUpdate(document._source?.system)
  if (update) document.updateSource(update)
  const items = document._source?.items
  if (!Array.isArray(items) || !items.some(i => computedModifierPaths(i.system).length)) return
  document.updateSource({
    items: items.map(item => {
      const itemUpdate = sourceModifiersUpdate(item.system)
      if (!itemUpdate) return item
      const copy = foundry.utils.deepClone(item)
      for (const [path, value] of Object.entries(itemUpdate)) foundry.utils.setProperty(copy, path, value)
      return copy
    })
  })
}

// The item updates of a list of item sources ({_id, system})
function itemUpdates(items) {
  const updates = []
  for (const item of items ?? []) {
    const update = sourceModifiersUpdate(item.system)
    if (update) updates.push({
      _id: item._id, ...update
    })
  }
  return updates
}

/**
 * Cleans an actor whose source is given, through the given actor (a world actor or a token's synthetic actor).
 * @return {Promise<number>} The number of arrays emptied
 */
async function cleanActor(actor, source) {
  let count = 0
  const update = sourceModifiersUpdate(source.system)
  if (update) {
    count += computedModifierPaths(source.system).length
    await actor.update(update, {
      render: false
    })
  }
  const items = itemUpdates(source.items)
  if (items.length) {
    for (const item of source.items) count += computedModifierPaths(item.system).length
    await actor.updateEmbeddedDocuments("Item", items, {
      render: false
    })
  }
  return count
}

/**
 * Runs the cleaning on the world: actors and their items, unowned items, unlinked tokens.
 * Compendium packs are not touched: those of a module belong to their module.
 * @return {Promise<{actors: number, items: number, tokens: number, arrays: number}>}
 */
export async function migrateSourceModifiers() {
  const done = {
    actors: 0, items: 0, tokens: 0, arrays: 0
  }

  for (const actor of game.actors) {
    try {
      const n = await cleanActor(actor, actor._source)
      if (n) {
        done.actors++; done.arrays += n
      }
    } catch (err) {
      console.error(`SR5 | modifiers not cleaned for actor ${actor.name}`, err)
    }
  }

  const worldItems = itemUpdates(game.items.contents.map(i => i._source))
  if (worldItems.length) {
    for (const update of worldItems) done.arrays += computedModifierPaths(game.items.get(update._id)._source.system).length
    await Item.implementation.updateDocuments(worldItems, {
      render: false
    })
    done.items = worldItems.length
  }

  // An unlinked token keeps in its delta only what differs from its actor: cleaned when it holds such arrays
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor || !token.delta) continue
      try {
        const n = await cleanActor(token.actor, token.delta._source)
        if (n) {
          done.tokens++; done.arrays += n
        }
      } catch (err) {
        console.error(`SR5 | modifiers not cleaned for token ${token.name} (${scene.name})`, err)
      }
    }
  }
  return done
}

// Ready hook: the active GM runs it once per world
export async function runSourceModifiersMigration() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return
  if ((Number(game.settings.get("sr5", "sourceModifiersMigration")) || 0) >= SOURCE_MODIFIERS_MIGRATION) return
  const done = await migrateSourceModifiers()
  await game.settings.set("sr5", "sourceModifiersMigration", SOURCE_MODIFIERS_MIGRATION)
  SR5_SystemHelpers.srLog(1, `Computed modifiers emptied in the source: ${done.arrays} arrays (${done.actors} actors, ${done.items} items, ${done.tokens} tokens)`)
  if (done.arrays) ui.notifications.info(game.i18n.format("SR5.INFO_SourceModifiersCleaned", done))
}
