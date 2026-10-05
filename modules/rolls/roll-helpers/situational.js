// Situational effects (SR5 p. 462, Chrome Flesh p. 160-172): bonuses or penalties an item grants only
// in a given situation ("against inhaled toxins", "at night"). Such an effect is not applied on the
// sheet: it leaves a zero-valued marker in the modifiers of its target, and the roll that reads that
// target offers it as a box to tick in the roll dialog, unticked by default.
// Effects aimed at "system.rollTests.*" (Pushed, Qualia: "+1 die to tests linked to Logic") have no
// object on the sheet: they are matched against the attributes the roll uses, again whenever the
// attribute is changed in the dialog.

export const SITUATIONAL_PREFIX = "situational:"
export const ROLL_TESTS_PREFIX = "system.rollTests."
export const ROLL_TESTS_TYPE = "rollTests_"
export const ANY_ROLL = "anyRoll"

// The targets a roll dialog reads the modifiers of: a situational effect anywhere else (an augmented
// attribute, initiative dice, a condition monitor, armor...) would never be offered
const READ_BY_ROLLS = [
  /^system\.skills\.[^.]+\.(test|limit)$/,
  /^system\.skills\.perception\.perceptionType\.[^.]+\.(test|limit)$/,
  /^system\.limits\.[^.]+$/,
  // Not the active defenses: an opposed defense adds them up in getActiveDefenseValue, past the markers
  /^system\.defenses\.(?!(dodge|block|parryBlades|parryClubs)$)[^.]+$/,
  /^system\.resistances\.[^.]+(\.[^.]+)?$/,
  /^system\.derivedAttributes\.[^.]+$/,
  /^system\.movements\.[^.]+\.(test|limit)$/,
  /^system\.weightActions\.[^.]+\.test$/,
  /^system\.matrix\.(actions|resonanceActions)\.[^.]+\.(test|limit|defense)$/,
  /^system\.matrix\.resistances\.[^.]+$/,
  // Forbidden Arcana p. 90-95 (mentor spirits): spell categories, Drain, and the spirit types a summoning,
  // binding or banishing picks in the dialog (offered hidden, shown for that type: spiritTypeOffers)
  /^system\.skills\.(spellcasting|ritualSpellcasting|alchemy)\.spellCategory\.[^.]+$/,
  /^system\.skills\.(summoning|binding|banishing)\.spiritType\.[^.]+$/,
  /^system\.magic\.drainResistance$/,
]

// The skills whose dice pool depends on a spirit type picked in the dialog or read off the target
export const SPIRIT_TYPE_SKILLS = ["summoning", "binding", "banishing"]
const ATTRIBUTE_TARGET = /^system\.attributes\.([^.]+)\.(augmented|natural)$/

// The attribute a situational effect on an attribute is turned into: "tests linked to that attribute"
export function attributeRedirect(target){
  return typeof target === "string" ? (target.match(ATTRIBUTE_TARGET)?.[1] ?? null) : null
}

// Whether the "Situational" box makes sense for this target
export function situationalReadable(target){
  if (typeof target !== "string") return false
  return isRollTestsTarget(target) || attributeRedirect(target) !== null || READ_BY_ROLLS.some(r => r.test(target))
}

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

// Attribute keys of the linked attributes a dice pool is made of, found by their label, plus the
// secondary attribute picked in the dialog
export function rollAttributes(composition, attributeLabels, secondary){
  let keys = []
  for (let m of composition || []){
    if (m.type !== "linkedAttribute") continue
    for (let [key, label] of Object.entries(attributeLabels)){
      if (label === m.source && !keys.includes(key)) keys.push(key)
    }
  }
  if (secondary && secondary !== "none" && !keys.includes(secondary)) keys.push(secondary)
  return keys
}

// The effects on "tests linked to an attribute", with their place in the actor's list
export function attributeEffects(effects){
  let list = []
  effects.forEach((effect, index) => {
    if (effect.scope && effect.scope !== ANY_ROLL) list.push({
      ...effect, index
    })
  })
  return list
}

// For the attributes in use: the modifiers applied without a box, and the boxes to show
export function attributeTestsState(scoped, attributes){
  let always = [], visible = []
  for (let effect of scoped){
    if (!attributes.includes(effect.scope)) continue
    if (effect.situational) visible.push(effect.index)
    else always.push({
      type: `${ROLL_TESTS_TYPE}${effect.index}`, label: effect.source, value: effect.value
    })
  }
  return {
    always, visible
  }
}

// Whether the list of boxes shows at all: not when every box is hidden (an attribute not in use)
export function situationalListShown(offers){
  return (offers || []).some(o => !o.hidden)
}

function offerOf(effect, index, kind){
  let offer = {
    key: `situational_${kind}_${index}`, kind, index, label: effect.source, when: effect.when || "",
    value: effect.value, isMalus: effect.value < 0
  }
  if (effect.targetMetatype) Object.assign(offer, {
    targetMetatype: effect.targetMetatype, targetMetatypeMode: effect.targetMetatypeMode
  })
  return offer
}

// Metatype families a situational effect can aim at (The Complete Trog p. 179: "non-ork, non-troll"),
// metavariants included since they share their metatype's key. A family of one is its metatype.
export const METATYPE_FAMILIES = {
  trog: ["ork", "troll"],
}

// The Complete Trog p. 179 ("+3 dice to Intimidation against non-ork, non-troll targets"): whether an
// effect's condition on the target's metatype is met. A family groups metatypes (SR5.metatypeFamilies),
// a metavariant shares the key of its metatype. null when there is no condition, or no metatype to
// read (no target, a spirit, a drone): the box is then left to the player.
export function targetMetatypeMet(effect, targetMetatype, families){
  if (!effect?.targetMetatype || !targetMetatype) return null
  let members = families?.[effect.targetMetatype] ?? [effect.targetMetatype]
  let inFamily = members.includes(targetMetatype)
  return effect.targetMetatypeMode === "isNot" ? !inFamily : inFamily
}

// Ticks the boxes whose condition on the target's metatype is met, as if the player had: the modifier
// goes into the roll, the box shows ticked and can still be unticked in the dialog
export function tickByTargetMetatype(rollData, targetMetatype, families){
  for (let offer of rollData.situational || []){
    if (offer.hidden || targetMetatypeMet(offer, targetMetatype, families) !== true) continue
    offer.checked = true
    if (offer.kind === "limit") rollData.limit.modifiers[offer.key] = {
      label: offer.label, value: offer.value
    }
    else rollData.dicePool.modifiers = (rollData.dicePool.modifiers || []).concat({
      type: offer.key, label: offer.label, value: offer.value
    })
  }
}

// Takes the situational markers out of a prepared roll and returns the boxes to offer, plus the
// roll-wide effects that apply without a box (a non situational Pushed). The boxes of the effects on
// "tests linked to an attribute" are all returned, hidden when the attribute is not in use, so that
// the dialog can show them when the attribute is changed.
export function extractSituational(rollData, effects, attributes, limitSource){
  let offers = [], seen = new Set()
  // A marker names its item: one copied from another actor's list (never seen, but cheap) is dropped
  let offer = (index, kind, source) => {
    let effect = effects[index]
    if (!effect || effect.scope || seen.has(`${kind}${index}`)) return
    if (source !== undefined && source !== effect.source) return
    seen.add(`${kind}${index}`)
    offers.push(offerOf(effect, index, kind))
  }

  for (let list of [rollData.dicePool.composition, rollData.dicePool.modifiers]){
    if (!Array.isArray(list)) continue
    for (let i = list.length - 1; i >= 0; i--){
      if (!isSituationalType(list[i].type)) continue
      offer(situationalIndex(list[i].type), "dicePool", list[i].source ?? list[i].label)
      list.splice(i, 1)
    }
  }
  for (let [key, m] of Object.entries(rollData.limit.modifiers || {
  })){
    if (!isSituationalType(key)) continue
    offer(situationalIndex(key), "limit", m?.label)
    delete rollData.limit.modifiers[key]
  }
  // A skill's limit is worked out from the actor's limit (Physical, Mental...) without copying its
  // modifiers: the markers left on that limit are read there
  for (let m of limitSource || []){
    if (isSituationalType(m.type)) offer(situationalIndex(m.type), "limit", m.source)
  }

  // "Any roll" is only meaningful as a situational effect: never applied blindly
  effects.forEach((effect, index) => {
    if (effect.scope === ANY_ROLL && effect.situational) offers.push(offerOf(effect, index, "dicePool"))
  })

  let scoped = attributeEffects(effects)
  let {
    always, visible
  } = attributeTestsState(scoped, attributes)
  for (let effect of scoped){
    if (!effect.situational) continue
    offers.push({
      ...offerOf(effect, effect.index, "dicePool"), attribute: effect.scope, hidden: !visible.includes(effect.index)
    })
  }

  // Biggest first, penalties last
  offers.sort((a, b) => b.value - a.value)
  return {
    offers, always, scoped
  }
}

// Forbidden Arcana p. 90-95 ("+2 dice to summon spirits of Air"): the spirit type of a summoning is only
// known in the dialog, so the boxes of every type are offered hidden, each tagged with its type, and
// spiritTypeVisible shows those of the type picked. spiritTypes is the skill's spiritType object.
export function spiritTypeOffers(spiritTypes, effects){
  let offers = [], seen = new Set()
  for (let [spiritType, data] of Object.entries(spiritTypes || {
  })){
    for (let m of data?.modifiers || []){
      if (!isSituationalType(m.type)) continue
      let index = situationalIndex(m.type), effect = effects[index]
      if (!effect || effect.scope || seen.has(index) || effect.source !== m.source) continue
      seen.add(index)
      offers.push({
        ...offerOf(effect, index, "dicePool"), spiritType, hidden: true
      })
    }
  }
  return offers
}

// Shows the boxes of the spirit type in use and hides the others; returns the keys of the boxes hidden
// while ticked, whose modifier the dialog must take out of the dice pool
export function spiritTypeVisible(offers, spiritType){
  let unticked = []
  for (let offer of offers || []){
    if (!offer.spiritType) continue
    offer.hidden = offer.spiritType !== spiritType
    if (offer.hidden && offer.checked){
      offer.checked = false
      unticked.push(offer.key)
    }
  }
  return unticked
}

// The modifiers of a spirit type, as copied into a dialog: the situational markers are left out, their
// boxes standing for them
export function withoutSituationalMarkers(modifiers){
  return (modifiers || []).filter(m => !isSituationalType(m.type))
}
