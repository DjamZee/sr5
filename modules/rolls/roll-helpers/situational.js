// Situational effects (SR5 p. 462, Chrome Flesh p. 160-172): bonuses or penalties an item grants only
// in a given situation ("against inhaled toxins", "at night"). Such an effect is not applied on the
// sheet: it leaves a zero-valued marker in the modifiers of its target, and the roll that reads that
// target offers it as a box to tick in the roll dialog, unticked by default.
// Effects aimed at "system.rollTests.*" (Pushed, Qualia: "+1 die to tests linked to Logic") have no
// object on the sheet: they are matched at roll time against the attributes the roll uses.

export const SITUATIONAL_PREFIX = "situational:"
export const ROLL_TESTS_PREFIX = "system.rollTests."
export const ANY_ROLL = "anyRoll"

// The value an effect brings, by its type; null when the type has no meaning outside the sheet
export function situationalValue(customEffect, itemData){
  let base
  switch (customEffect.type){
    case "value": base = parseFloat(customEffect.value) || 0; break
    case "rating": base = itemData?.itemRating || 0; break
    case "hits": base = itemData?.hits || 0; break
    default: return null
  }
  let multiplier = parseFloat(customEffect.multiplier) || 1
  return base * multiplier
}

export function isRollTestsTarget(target){
  return typeof target === "string" && target.startsWith(ROLL_TESTS_PREFIX)
}

export function isSituationalType(type){
  return typeof type === "string" && type.startsWith(SITUATIONAL_PREFIX)
}

export function situationalIndex(type){
  return parseInt(type.slice(SITUATIONAL_PREFIX.length))
}

// Attribute keys of the linked attributes a dice pool is made of, found by their label
export function rollAttributes(composition, attributeLabels){
  let keys = []
  for (let m of composition || []){
    if (m.type !== "linkedAttribute") continue
    for (let [key, label] of Object.entries(attributeLabels)){
      if (label === m.source && !keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

// Takes the situational markers out of a prepared roll and returns the boxes to offer, plus the
// roll-wide effects that apply without a box (a non situational Pushed)
export function extractSituational(rollData, effects, attributes){
  let offers = [], always = [], seen = new Set()
  let offer = (index, kind) => {
    let effect = effects[index]
    if (!effect || seen.has(`${kind}${index}`)) return
    seen.add(`${kind}${index}`)
    offers.push({
      key: `situational_${kind}_${index}`, kind, label: effect.source, when: effect.when || "",
      value: effect.value, isMalus: effect.value < 0
    })
  }

  for (let list of [rollData.dicePool.composition, rollData.dicePool.modifiers]){
    if (!Array.isArray(list)) continue
    for (let i = list.length - 1; i >= 0; i--){
      if (!isSituationalType(list[i].type)) continue
      offer(situationalIndex(list[i].type), "dicePool")
      list.splice(i, 1)
    }
  }
  for (let key of Object.keys(rollData.limit.modifiers || {
  })){
    if (!isSituationalType(key)) continue
    offer(situationalIndex(key), "limit")
    delete rollData.limit.modifiers[key]
  }

  effects.forEach((effect, index) => {
    if (!effect.scope) return
    if (effect.scope !== ANY_ROLL && !attributes.includes(effect.scope)) return
    // "Any roll" is only meaningful as a situational effect: never applied blindly
    if (effect.situational) offer(index, "dicePool")
    else if (effect.scope !== ANY_ROLL) always.push({
      type: "rollTests", label: effect.source, value: effect.value
    })
  })

  // Biggest first, penalties last
  offers.sort((a, b) => b.value - a.value)
  return {
    offers, always
  }
}
