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
 * The extended tests that open a lock, in order (SR5 p. 365): a mechanical
 * lock is one test against its rating. A maglock takes two: the casing off
 * (rating x 2), then the keypad or reader rewired (rating x 2). Shutting a
 * maglock again is only putting the casing back, "the same test": one stage.
 * Each test is Locksmith + Agility [Physical], one Combat Turn per roll.
 */
export function pickStages(lock, relock = false) {
  const rating = Math.max(1, Number(lock?.rating) || 1)
  if (lock?.type === "mechanical") return [{
    key: "lock", threshold: rating
  }]
  if (lock?.type === "maglock" && relock) return [{
    key: "casingBack", threshold: rating * 2
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
export function pickPool(skill, agility, autopicker = 0) {
  const rating = Math.max(0, Number(skill?.rating?.value) || 0)
  // On a mechanical lock, an autopicker's rating can stand in for Locksmith
  // (SR5 p. 365), when it is the better of the two. Arbitrage de DjamZ
  // (2026-10-05): the text of p. 365 holds alongside the gear table p. 450.
  const tool = Math.max(0, Number(autopicker) || 0)
  if (tool > rating) return tool + Math.max(0, Number(agility) || 0)
  if (rating) {
    const sheetPool = Number(skill?.test?.dicePool)
    return Math.max(0, Number.isFinite(sheetPool) && sheetPool > 0 ? sheetPool : rating + (Number(agility) || 0))
  }
  return skill?.canDefault ? Math.max(0, (Number(agility) || 0) - 1) : 0
}

/**
 * Physical limit, raised by an autopicker's rating. The book reads two ways:
 * p. 365 gives the rating as dice, the gear table p. 450 as limit. DjamZ
 * ruled for the gear table (2026-10-05). An autopicker works on a mechanical
 * lock only (p. 450): a maglock gains nothing from it.
 */
export function pickLimit(physicalLimit, autopickerRating = 0, lockType = "mechanical") {
  const bonus = lockType === "mechanical" ? Math.max(0, Number(autopickerRating) || 0) : 0
  return Math.max(0, Number(physicalLimit) || 0) + bonus
}

/** Hits of one roll, capped by the limit: a limit of 0 lets none through. */
export function underLimit(hits, limit) {
  return Math.min(Math.max(0, Number(hits) || 0), Math.max(0, Number(limit) || 0))
}

/** Only a maglock has an anti-tamper system (SR5 p. 365). */
export function antiTamperOf(lock) {
  return lock?.type === "maglock" ? Math.max(0, Number(lock.antiTamper) || 0) : 0
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
 * glitch ends it on a failure. A plain glitch is only reported: the GM may
 * take 1D6 hits away (p. 50), which is left to the table.
 *
 * @param {function(number): Promise<{hits:number, glitch:boolean, criticalGlitch:boolean}>} rollDice
 */
export async function extendedTest(pool, threshold, limit, rollDice) {
  let hits = 0, rolls = 0, glitch = false, criticalGlitch = false
  for (let dice = pool; dice > 0; dice--) {
    const roll = await rollDice(dice)
    rolls++
    hits += underLimit(roll.hits, limit)
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

const LIMITED = 1

/**
 * The rights on a storage put down on the map, while it is shut.
 *
 * Limited is enough to open its sheet and ask to pick it; it lets nobody
 * write. So while it is shut, everyone but the key holders (and the GMs) is
 * held at Limited, and what the GM granted above that is kept aside, as the
 * GM's wish, to apply once it is open: Owner then lets a player go through
 * it. A right the GM grants while it is shut joins that wish rather than
 * taking effect; a right the GM takes away (down to None) drops it.
 *
 * Called again on every change of rights, so it must be idempotent: the
 * rights it returns, fed back with the wish it returns, change nothing.
 *
 * @param {object} ownership the storage's current ownership
 * @param {object} saved the wish kept so far ({} at first)
 * @param {string[]} keep user ids left alone: key holders and GMs
 * @returns {{ownership: object, saved: object, changed: boolean}}
 */
export function lockedOwnership(ownership, saved, keep) {
  const next = {
    ...ownership
  }
  const wish = {
    ...(saved ?? {
    })
  }
  for (const [userId, level] of Object.entries(ownership ?? {
  })) {
    if (userId !== "default" && keep.includes(userId)) {
      delete wish[userId]
      continue
    }
    if (level > LIMITED) {
      wish[userId] = level
      next[userId] = LIMITED
    }
    else if (level < LIMITED) delete wish[userId]
  }
  for (const userId of Object.keys(wish)) if (!(userId in next)) delete wish[userId]
  const changed = JSON.stringify(next) !== JSON.stringify(ownership ?? {
  }) ||
    JSON.stringify(wish) !== JSON.stringify(saved ?? {
    })
  return {
    ownership: next, saved: wish, changed
  }
}

/**
 * The rights once it is open: the GM's wish, for those still held at
 * Limited. A right the GM set by hand since (anything but Limited) stays.
 */
export function unlockedOwnership(ownership, saved) {
  const next = {
    ...ownership
  }
  for (const [userId, level] of Object.entries(saved ?? {
  })) {
    if (next[userId] === LIMITED) next[userId] = level
  }
  return next
}
