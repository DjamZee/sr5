// The effect editor of the items (tab "Modifiers"): who may write it, the called shots any item can ease, and the
// targets an effect keeps when they are not in the editor's lists.

// The three effect lists of an item (datamodels/items/partial/effects.js)
export const EFFECT_BINDINGS = ["customEffects", "itemEffects", "systemEffects"]

// Called shots an item can ease, outside the martial arts techniques (category "martialArts" keeps those):
// Attaque violente (SR5 p. 196), Prouesse (SR5 p. 197), Partager les dommages (SR5 p. 196), the ammo called shots
// (Run & Gun p. 129-132) and the vehicle locations (Run & Gun p. 128-129). Tir transperçant is left out: its penalty
// is the target's armor, not a book penalty.
export const CALLED_SHOT_ITEM_KEYS = [
  "harderKnock", "trickShot", "splittingDamage",
  "bellringer", "bullsEye", "downTheGullet", "extremeIntimidation", "flameOn", "flashBlind", "hitEmWhereItCounts",
  "onPinsAndNeedles", "ricochetShot", "shreddedFlesh", "tag", "upTheAnte", "warningShot",
  "antenna", "axle", "doorLock", "engineBlock", "fuelTankBattery", "windowMotor",
]
export const CALLED_SHOT_VEHICLE_LOCATIONS = ["antenna", "axle", "doorLock", "engineBlock", "fuelTankBattery", "windowMotor"]

// How much the items lower the penalty of a called shot: the called shot itself, and the vehicle location when one
// is aimed at (Cible spécifique, or Doubler la mise which adds -4 to a location, Run & Gun p. 130)
export function calledShotItemBonus(itemModifiers, calledShot, location){
  let bonus = Number(itemModifiers?.[calledShot]) || 0
  if (location && CALLED_SHOT_VEHICLE_LOCATIONS.includes(location)) bonus += Number(itemModifiers?.[location]) || 0
  return bonus
}

// An eased penalty stops at 0: a bonus never turns a called shot into extra dice
export function easeCalledShotPenalty(penalty, bonus){
  if (!(bonus > 0) || !(penalty < 0)) return penalty
  return Math.min(0, penalty + bonus)
}

// The update option the system puts on its own writes of an item's effects (acid eating an armor, Apply to item, a
// linked effect removed, the mentor conversion): made on a player's client, they are not the player's edits. An option
// can be forged from the console like any write: the setting is a comfort, the gamemaster is warned of what gets through
// A new object at each call: Foundry writes into the options it is given (operation.parent), a shared or frozen one
// broke the update (measured 06/10: "Cannot add property parent, object is not extensible")
export const systemEffectWrite = () => ({
  sr5SystemEffect: true
})
export const isSystemEffectWrite = options => !!options?.sr5SystemEffect

// A category changed in the sheet: the target chosen in the old category means nothing in the new one, and is dropped
// (it used to be by accident, the old target being missing from the new list). Without this, a target missing from
// the lists would be kept as "(not in the list)" across the change.
export function clearTargetsOnCategoryChange(submit, sourceSystem){
  for (const binding of EFFECT_BINDINGS){
    const stored = asList(sourceSystem?.[binding])
    const nested = submit?.system?.[binding]
    if (nested && typeof nested === "object") {
      for (const [i, entry] of Object.entries(nested)){
        if (entry && "category" in entry && entry.category !== stored[i]?.category && "target" in entry) entry.target = ""
      }
    }
    for (const key of Object.keys(submit ?? {
    })){
      const match = key.match(new RegExp(`^system\\.${binding}\\.(\\d+)\\.category$`))
      if (!match) continue
      const targetKey = `system.${binding}.${match[1]}.target`
      if (submit[key] !== stored[match[1]]?.category && targetKey in submit) submit[targetKey] = ""
    }
  }
  return submit
}

// Does an update write one of the effect lists? Nested ({system: {customEffects}}) or dotted ("system.customEffects.0.value")
function effectKeys(changes){
  const dotted = Object.keys(changes ?? {
  }).filter(k => EFFECT_BINDINGS.some(b => k === `system.${b}` || k.startsWith(`system.${b}.`)))
  const nested = EFFECT_BINDINGS.filter(b => changes?.system && typeof changes.system === "object" && b in changes.system)
  return {
    dotted, nested
  }
}

export function touchesItemEffects(changes){
  const {
    dotted, nested
  } = effectKeys(changes)
  return dotted.length > 0 || nested.length > 0
}

const asList = value => Array.isArray(value) ? value : Object.values(value ?? {
})

// Sorted keys, so that two equal effects compare equal whatever the order of their fields
function canonical(value){
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
  return value
}

// The list as the update would leave it. Foundry does not merge into a list: {0: {...}} from the sheet form, and a
// dotted "system.customEffects.0.value", both REPLACE the whole list by the entries sent (measured 06/10: an update
// of "system.customEffects.0.value" left [{value}] alone, the category and target gone)
function listAfter(current, binding, changes){
  const sent = {
  }
  const nested = changes?.system?.[binding]
  if (nested !== undefined) return asList(nested)
  for (const [key, value] of Object.entries(changes ?? {
  })){
    if (key === `system.${binding}`) return asList(value)
    if (!key.startsWith(`system.${binding}.`)) continue
    const [i, ...rest] = key.slice(`system.${binding}.`.length).split(".")
    if (!rest.length) { sent[i] = value; continue }
    sent[i] ??= {
    }
    let node = sent[i]
    while (rest.length > 1){
      const k = rest.shift()
      node[k] ??= {
      }
      node = node[k]
    }
    node[rest[0]] = value
  }
  return Object.keys(sent).length ? Object.values(sent) : asList(current?.[binding])
}

// Would the update change an effect list of the item? Many updates send every field of the sheet back unchanged
export function effectsChangedBy(changes, currentSystem){
  return EFFECT_BINDINGS.some(b => {
    const {
      dotted, nested
    } = effectKeys(changes)
    if (!nested.includes(b) && !dotted.some(k => k === `system.${b}` || k.startsWith(`system.${b}.`))) return false
    return JSON.stringify(canonical(listAfter(currentSystem, b, changes))) !== JSON.stringify(canonical(asList(currentSystem?.[b])))
  })
}

// Takes the effect lists out of an update. Returns true when the update would have changed one of them.
export function stripEffectChanges(changes, currentSystem){
  const changed = effectsChangedBy(changes, currentSystem)
  const {
    dotted, nested
  } = effectKeys(changes)
  for (const k of dotted) delete changes[k]
  for (const b of nested) delete changes.system[b]
  return changed
}

// World setting (DjamZ's ruling G14, 2026-10-06): off by default, the owner of an item writes its effects as before
export function gmOnlyItemEffects(){
  try {
    return !!game.settings.get("sr5", "sr5GMOnlyItemEffects")
  } catch {
    return false
  }
}

export function canEditItemEffects(user, isOwner){
  if (!isOwner) return false
  return !!user?.isGM || !gmOnlyItemEffects()
}

// A stored category or target missing from the editor's lists (an effect written by a newer data pack, or by hand)
// was shown blank, and the next save of the sheet wrote the blank back over it: it is kept as an option of its own.
export function keepUnlistedEffectFields(root, system, label = "?"){
  for (const binding of EFFECT_BINDINGS){
    const list = asList(system?.[binding])
    list.forEach((effect, i) => {
      for (const field of ["category", "target"]){
        const stored = effect?.[field]
        if (!stored || typeof stored !== "string") continue
        const select = root.querySelector(`select[name="system.${binding}.${i}.${field}"]`)
        if (!select || [...select.options].some(o => o.value === stored)) continue
        const option = select.ownerDocument.createElement("option")
        option.value = stored
        option.textContent = `${stored} (${label})`
        select.appendChild(option)
        select.value = stored
      }
    })
  }
}

// When effects are the gamemaster's, their fields are shown but not editable, and they are not sent with the form
export function lockEffectFields(root){
  for (const binding of EFFECT_BINDINGS){
    root.querySelectorAll(`[name^="system.${binding}."]`).forEach(field => { field.disabled = true })
    root.querySelectorAll(`[data-binding="${binding}"]`).forEach(control => control.remove())
  }
}
