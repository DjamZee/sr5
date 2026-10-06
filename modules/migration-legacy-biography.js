import {
  LEGACY_BIOGRAPHY_KEYS
} from "./datamodels/common/biographyMigration.js"
import {
  SR5_SystemHelpers
} from "./system/utilitySystem.js"

// The v12 PC sheet wrote the biography under characterX keys. migrateData reads them into the current keys, but only
// in memory: the database kept them, and a field emptied on the sheet came back from its old key at the next load
// (Bérénice's review: a gender emptied showed "female" again). The client never sees those keys (every document is
// migrated as it is built), so this migration writes the biography as migrateData read it and unsets every legacy key,
// once per world, on every actor that can carry them.

// Bump to run it again on every world.
export const LEGACY_BIOGRAPHY_MIGRATION = 1

// The actor types whose data model reads the legacy keys (migrateLegacyBiographyKeys)
const TYPES = ["actorPc", "actorGrunt"]

/**
 * The update of an actor: its biography as migrateData read it, written whole by a forced replacement ("=="), which the
 * database applies as is. An unset ("-=") of a key the data model does not know is dropped by the client's cleaning
 * before it is sent (measured: characterMetatype stayed in the database).
 * @param {object} biography  the source biography, as migrateData left it
 * @return {object}  update data
 */
export function legacyBiographyUpdate(biography) {
  const kept = Object.fromEntries(Object.entries(biography ?? {
  }).filter(([key]) => !(key in LEGACY_BIOGRAPHY_KEYS)))
  return {
    "system.==biography": kept
  }
}

/**
 * The update of an unlinked token: the legacy keys unset in its delta, whose system the data model does not clean
 * (measured), and the current keys the delta holds kept as read; nothing more written over it (a delta holds only
 * what differs from its actor).
 * @param {object} biography  the delta's source biography
 * @return {object}  update data of the token
 */
export function legacyDeltaUpdate(biography) {
  const update = {
  }
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_BIOGRAPHY_KEYS)) {
    if (biography?.[currentKey] !== undefined) update[`delta.system.biography.${currentKey}`] = biography[currentKey]
    update[`delta.system.biography.-=${legacyKey}`] = null
  }
  return update
}

/** Writes it on one actor, diff off: an unchanged biography would otherwise not be sent */
async function cleanActor(actor) {
  await actor.update(legacyBiographyUpdate(actor._source.system?.biography), {
    diff: false, render: false
  })
}

/**
 * Runs it on the world: actors, the deltas of unlinked tokens that hold a biography, and the actors of the world's own
 * compendium packs (those of a module belong to their module).
 * @return {Promise<{actors: number, tokens: number, packed: number, failed: number}>}
 */
export async function migrateLegacyBiography() {
  const done = {
    actors: 0, tokens: 0, packed: 0, failed: 0
  }
  for (const actor of game.actors) {
    if (!TYPES.includes(actor.type)) continue
    try {
      await cleanActor(actor)
      done.actors++
    } catch (err) {
      done.failed++
      console.error(`SR5 | legacy biography not cleaned for actor ${actor.name}`, err)
    }
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const biography = token.delta?._source?.system?.biography
      if (token.actorLink || !token.actor || !TYPES.includes(token.actor.type) || !biography || typeof biography !== "object") continue
      try {
        await token.update(legacyDeltaUpdate(biography), {
          diff: false, render: false
        })
        done.tokens++
      } catch (err) {
        done.failed++
        console.error(`SR5 | legacy biography not cleaned for token ${token.name} (${scene.name})`, err)
      }
    }
  }
  for (const pack of game.packs) {
    if (pack.documentName !== "Actor" || pack.metadata?.packageType !== "world") continue
    const wasLocked = pack.locked
    try {
      if (wasLocked) await pack.configure({
        locked: false
      })
      for (const actor of await pack.getDocuments()) {
        if (!TYPES.includes(actor.type)) continue
        await cleanActor(actor)
        done.packed++
      }
    } catch (err) {
      done.failed++
      console.error(`SR5 | legacy biography not cleaned in pack ${pack.collection}`, err)
    } finally {
      if (wasLocked) await pack.configure({
        locked: true
      })
    }
  }
  return done
}

// Ready hook: the active GM runs it once per world. Marked done only when nothing failed, so a failure is taken up
// again at the next load (it is idempotent).
export async function runLegacyBiographyMigration() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return
  if ((Number(game.settings.get("sr5", "legacyBiographyMigration")) || 0) >= LEGACY_BIOGRAPHY_MIGRATION) return
  const done = await migrateLegacyBiography()
  SR5_SystemHelpers.srLog(1, `Legacy biography keys unset: ${done.actors} actors, ${done.tokens} tokens, ${done.packed} in world packs, ${done.failed} failed`)
  if (done.failed) return
  await game.settings.set("sr5", "legacyBiographyMigration", LEGACY_BIOGRAPHY_MIGRATION)
}
