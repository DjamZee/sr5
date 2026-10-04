/**
 * Locks on storages: what a lock is, who may open it, and what picking it
 * takes (SR5 p. 365-366). Kept free of Foundry globals so the rules can be
 * read, and tested, on their own.
 *
 * No book gives rules for a safe or a locked case: a storage simply carries a
 * mechanical lock or a maglock, picked as the core book describes.
 */

export const LOCK_TYPES = ["", "mechanical", "maglock"]

/** What a new storage gets: a safe comes with a rating 4 maglock, wireless
 * off, no anti-tamper, locked. The rest come without a lock. */
export function defaultLockFor(storageType) {
  if (storageType !== "safe") return null
  return {
    type: "maglock", rating: 4, wireless: false, antiTamper: 0, locked: true
  }
}

/** Whether this storage (item or actor) is shut. */
export function isLocked(storage) {
  const lock = storage?.system?.lock
  return Boolean(lock?.type) && Boolean(lock?.locked)
}

/**
 * Whether an item sits in a locked storage of this actor: out of reach of a
 * pickpocket, or of anyone without the key. A missing actor or storage
 * gives false, as isStoredAway does.
 */
export function isLockedAway(item, actor) {
  const storageId = item?.system?.storedIn
  if (!storageId) return false
  const items = actor?.items
  const storage = items?.get?.(storageId) ?? items?.find?.(i => (i.id ?? i._id) === storageId)
  return storage?.type === "itemStorage" && isLocked(storage)
}

/**
 * The extended tests that open a lock, in order (SR5 p. 365): a mechanical
 * lock is one test against its rating. A maglock takes two: the casing off
 * (rating x 2), then the keypad or reader rewired (rating x 2). Each test is
 * Locksmith + Agility [Physical], one Combat Turn per roll.
 */
export function pickStages(lock) {
  const rating = Math.max(1, Number(lock?.rating) || 1)
  if (lock?.type === "mechanical") return [{
    key: "lock", threshold: rating
  }]
  if (lock?.type === "maglock") return [
    {
      key: "casing", threshold: rating * 2
    },
    {
      key: "rewire", threshold: rating * 2
    },
  ]
  return []
}

/**
 * Locksmith + Agility, as the sheet computes it (wound modifiers included).
 * Untrained, Agility - 1 only if the skill allows defaulting: the system's
 * Locksmith does not (canDefault false), so an untrained character cannot pick a lock at all.
 */
export function pickPool(skill, agility) {
  const rating = Math.max(0, Number(skill?.rating?.value) || 0)
  if (rating) {
    const sheetPool = Number(skill?.test?.dicePool)
    return Math.max(0, Number.isFinite(sheetPool) && sheetPool > 0 ? sheetPool : rating + (Number(agility) || 0))
  }
  return skill?.canDefault ? Math.max(0, (Number(agility) || 0) - 1) : 0
}

/**
 * Physical limit, raised by an autopicker's rating. The book reads two ways:
 * p. 365 gives the rating as dice, the gear table p. 450 as limit. DjamZ
 * ruled for the gear table (2026-10-05).
 */
export function pickLimit(physicalLimit, autopickerRating = 0) {
  return Math.max(0, Number(physicalLimit) || 0) + Math.max(0, Number(autopickerRating) || 0)
}

const KIT_NAMES = /kit de serrurerie|lockpick|locksmith|kit de crochet/i
const AUTOPICKER_NAMES = /autocrocheteur|autopicker/i

/** The lockpicking gear a character carries: a kit, needed to pick at all
 * (SR5 p. 450), and the best autopicker. Found by name, the compendium items
 * having no dedicated field; an item put away in a storage does not count. */
export function lockTools(items, isStoredAway = () => false) {
  let kit = false, autopicker = 0
  for (const item of items ?? []) {
    if (item?.type !== "itemGear" || isStoredAway(item)) continue
    const name = item.name ?? ""
    if (AUTOPICKER_NAMES.test(name)) {
      autopicker = Math.max(autopicker, Number(item.system?.itemRating) || 1)
      // An autopicker is a lockpicking tool in itself
      kit = true
    }
    else if (KIT_NAMES.test(name)) kit = true
  }
  return {
    kit, autopicker
  }
}

/**
 * An extended test (SR5 p. 50): one die fewer each roll, hits counted under
 * the limit, until the threshold is met or the pool is spent. A critical
 * glitch ends it on a failure.
 *
 * @param {function(number): Promise<{hits:number, glitch:boolean, criticalGlitch:boolean}>} rollDice
 */
export async function extendedTest(pool, threshold, limit, rollDice) {
  let hits = 0, rolls = 0, glitch = false, criticalGlitch = false
  for (let dice = pool; dice > 0; dice--) {
    const roll = await rollDice(dice)
    rolls++
    hits += limit ? Math.min(roll.hits, limit) : roll.hits
    if (roll.glitch) glitch = true
    if (roll.criticalGlitch) criticalGlitch = true
    if (criticalGlitch || hits >= threshold) break
  }
  return {
    hits, rolls, glitch, criticalGlitch, reached: hits >= threshold && !criticalGlitch
  }
}

/**
 * Whether the GM should act on a pick request. The sender comes from the
 * server and cannot be forged: it must own the character who picks, that
 * character must be beside the storage, and the storage must be in the state
 * the request expects (locked to open it, open to shut it).
 */
export function isPickRequestAllowed({
  storage, picker, senderOwns, relock, distance, reach = 2
}) {
  if (!storage || storage.type !== "actorStorage") return false
  if (!picker || picker.type === "actorStorage" || picker.id === storage.id) return false
  if (!senderOwns(picker)) return false
  if (!storage.system?.lock?.type) return false
  if (Boolean(relock) === isLocked(storage)) return false
  if (!(distance <= reach)) return false
  return true
}

/**
 * Who sees a locked storage on the map, and how far. The character who put
 * it down holds the key: the owners of that character keep their rights.
 * Every other player is brought down to Limited (the name, not the contents),
 * and what they had is kept to be given back once it is open.
 *
 * @param {object} ownership the storage's current ownership
 * @param {string[]} keyHolders user ids holding the key
 * @returns {{ownership: object, saved: object}}
 */
export function lockedOwnership(ownership, keyHolders) {
  const LIMITED = 1
  const next = {
    ...ownership
  }
  const saved = {
  }
  for (const [userId, level] of Object.entries(ownership ?? {
  })) {
    if (userId !== "default" && keyHolders.includes(userId)) continue
    if (level > LIMITED) {
      saved[userId] = level
      next[userId] = LIMITED
    }
  }
  return {
    ownership: next, saved
  }
}

/** The ownership before the lock, given back once the storage is open. */
export function unlockedOwnership(ownership, saved) {
  return {
    ...ownership, ...(saved ?? {
    })
  }
}
