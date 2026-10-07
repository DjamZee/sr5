// The dealership (lot R9 of the rigging plan, Q8 of DjamZ): a vehicle or a drone of the shelves, the mods added to it,
// the slots and the price of the whole, before it is bought. Pure rules, read by interface/dealership-window.js and by
// the shop's checkout. The mods bought arrive aboard waiting to be installed (Rigger 5.0 p. 153), as from the
// workshop; the gamemaster may fit them at once
import {
  slotGauges, MOD_CATEGORIES
} from "./vehicle-workshop.js"

const num = v => Math.max(0, Math.floor(Number(v) || 0))

/** R5 p. 153-154: each category has as many slots as the vehicle's Body */
export function dealerCapacity(body) {
  return Object.fromEntries(MOD_CATEGORIES.map(key => [key, num(body)]))
}

/** The mods of the build not waiting to be installed, as fitted: the shelf's copy of a mod says it is not active */
const fittedOf = mods => Array.from(mods ?? []).filter(m => !m.pending).map(m => ({
  ...m, system: {
    ...(m.system ?? {
    }), isActive: true
  }
}))

/** The gauges of the build: `used` what the factory and the fitted mods take up, `pending` what the mods waiting to be
 *  installed will take, `over` when the whole goes beyond the slots ("Il est strictement interdit de dépasser ce
 *  nombre d'emplacements", R5 p. 154: their installation will be refused) */
export function dealerGauges(capacity, mods) {
  const list = Array.from(mods ?? [])
  const fitted = fittedOf(list)
  return slotGauges(capacity, fitted).map(g => {
    const pending = list.filter(m => m.pending && m.system?.type === g.key)
      .reduce((sum, m) => sum + num(m.system?.slots?.value), 0)
    const planned = g.used + pending
    return {
      ...g, pending, planned,
      pendingPercent: g.total > 0 ? Math.min(100 - g.percent, Math.round(100 * pending / g.total)) : 0,
      full: g.total > 0 && planned >= g.total, over: planned > g.total,
    }
  })
}

/** The slots a mod fitted at once by the gamemaster would take beyond the build's: {category, needed, free} or null.
 *  The same refusal as on a drone (entityItem.js, lot R8) */
export function buildSlotsRefusal(capacity, mods, added) {
  const s = added?.system ?? {
  }
  if (!MOD_CATEGORIES.includes(s.type)) return null
  const needed = num(s.slots?.value)
  if (!needed) return null
  const gauge = slotGauges(capacity, fittedOf(mods)).find(g => g.key === s.type)
  return needed > gauge.free ? {
    category: s.type, needed, free: gauge.free
  } : null
}

const LEGALITY_RANK = {
  "": 0, R: 1, F: 2
}

/** The figures of the build: each line's price, the sum, and the lot's availability (the highest of its lines, every
 *  part must be found, SR5 p. 420) and legality (the strictest) */
export function dealerTotals(lines) {
  const list = Array.from(lines ?? [])
  const total = list.reduce((sum, l) => sum + num(l.price), 0)
  const availability = list.reduce((best, l) => Math.max(best, num(l.availability)), 0)
  const legality = list.map(l => l.legality ?? "").reduce((worst, l) => (LEGALITY_RANK[l] ?? 0) > (LEGALITY_RANK[worst] ?? 0) ? l : worst, "")
  return {
    total, availability, legality
  }
}

/** The vehicle data a build is delivered as: its own mods (the factory ones) followed by the mods bought, each priced
 *  on this vehicle; fitted only when the gamemaster fitted it, waiting to be installed otherwise. `slots` is the mod's
 *  prepared count: its stored data holds 0 until an actor prepares it, and the vehicle item's workshop reads it raw */
export function assembledVehicleData(vehicleData, mods, randomID) {
  const added = Array.from(mods ?? []).map(({
    data, price, fitted, slots
  }) => ({
    ...data, _id: randomID(),
    system: {
      ...data.system, isActive: fitted === true, price: {
        ...(data.system?.price ?? {
        }), value: num(price)
      },
      ...(slots === undefined ? {
      } : {
        slots: {
          ...(data.system?.slots ?? {
          }), value: num(slots)
        }
      }),
    },
  }))
  return {
    ...vehicleData,
    system: {
      ...vehicleData.system, vehiclesMod: [...(vehicleData.system?.vehiclesMod ?? []), ...added]
    },
  }
}
