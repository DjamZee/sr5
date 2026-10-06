// The gamemaster's registers are hidden world settings the active GM writes. A write changes what game.settings.get
// returns only once the server has answered: two writes begun together read the same state, and the second erased
// the first (Thomas, measured on 30002: "Overwatch" then a mark spent on the same defense card, the first key missing
// after the GM reloads). Every write of a register therefore waits for the previous one of that register, and reads
// the setting again just before it sets it. Nothing locks the interface: only the writes of one register queue up
const queues = new Map()

function latest(setting){
  try {
    return foundry.utils.deepClone(game.settings.get("sr5", setting) ?? {
    })
  } catch {
    return {
    }
  }
}

/**
 * Change a register in its turn. `change` receives a copy of its latest state and returns the state to write, or
 * null / undefined to leave it untouched; it must not wait on another change of the same register.
 * @param {string} setting the key of the world setting
 * @param {(ledger:object) => object|null|Promise<object|null>} change
 * @returns {Promise<boolean>} true once written
 */
export function updateLedger(setting, change){
  const run = async () => {
    const next = await change(latest(setting))
    if (next === null || next === undefined) return false
    await game.settings.set("sr5", setting, next)
    return true
  }
  const job = (queues.get(setting) ?? Promise.resolve()).then(run)
  //A write that failed does not hold back the next ones
  queues.set(setting, job.catch(() => {}))
  return job
}
