// Natural maximum of the mental and physical attributes by metatype (SR5 p. 68, table Attributs par métatype)
export const METATYPE_ATTRIBUTE_MAX = {
  human: {
    body: 6, agility: 6, reaction: 6, strength: 6, willpower: 6, logic: 6, intuition: 6, charisma: 6
  },
  elf: {
    body: 6, agility: 7, reaction: 6, strength: 6, willpower: 6, logic: 6, intuition: 6, charisma: 8
  },
  dwarf: {
    body: 8, agility: 6, reaction: 5, strength: 8, willpower: 7, logic: 6, intuition: 6, charisma: 6
  },
  ork: {
    body: 9, agility: 6, reaction: 6, strength: 8, willpower: 6, logic: 5, intuition: 6, charisma: 5
  },
  troll: {
    body: 10, agility: 5, reaction: 6, strength: 10, willpower: 6, logic: 5, intuition: 5, charisma: 4
  },
}

export const AUGMENTATION_CAP_MODES = ["bonus", "augmentedMax", "none"]

//Augmented maximum of an attribute: natural maximum of the metatype (SR5 p. 68), +1 with Exceptional
//Attribute (SR5 p. 68), + 4 (SR5 p. 290, 312). null for a metatype the table does not know.
export function augmentedMaximum(metatype, key, exceptional = 0) {
  const max = METATYPE_ATTRIBUTE_MAX[metatype]?.[key]
  return max === undefined ? null : max + exceptional + 4
}

//How many points of an attribute the cap takes away, and why.
//"bonus" (book, SR5 p. 96): augmentations add +4 at most to the natural rating.
//"augmentedMax" (arbitrage de DjamZ): only the augmented maximum binds.
//"none": no cap (arbitrage de DjamZ).
//gain is the sum of the positive modifiers only: penalties (wounds, encumbrance) are never cut, they
//apply in full under the cap. boostGain is the part of gain brought by the Increase Attribute spell
//or the Attribute Boost adept power: whatever the choice, even "none", the book bounds them at the
//augmented maximum (SR5 p. 290 and 312), and only their own points are cut for it.
export function augmentationCapExcess({
  mode, metatype, key, natural, gain, boostGain = 0, exceptional = 0
}) {
  const augMax = augmentedMaximum(metatype, key, exceptional)
  let cap = null
  if (mode === "bonus") cap = natural + 4
  else if (mode === "augmentedMax") cap = augMax
  const capExcess = cap === null ? 0 : Math.max(0, natural + gain - cap)
  const boostExcess = (augMax === null || boostGain <= 0) ? 0 :
    Math.min(boostGain, Math.max(0, natural + gain - capExcess - augMax))
  return {
    cap, augMax, capExcess, boostExcess, excess: capExcess + boostExcess,
    unknownMetatype: mode === "augmentedMax" && augMax === null
  }
}

//House rule (world setting, off by default = book, SR5 p. 167 and 169): reloading spends no action when the
//right rounds are in the inventory. Ejecting a clip alone still costs its action (arbitrage de DjamZ).
export function reloadIsFree({
  houseRule, option, hasAmmo
}) {
  return !!houseRule && option !== "remove" && !!hasAmmo
}

//Rating an attribute would have without the augmentation cap: the kept rating plus what the cap took away
//(its modifiers carry the cut as a negative value). For the Physical limit (forLimit), the modifiers marked
//poolOnly stay out, as in limitAttributeValue (Attribute Boost, SR5 p. 312).
export function uncappedRating(attribute, forLimit = false) {
  const augmented = attribute?.augmented
  if (!augmented) return 0
  const modifiers = augmented.modifiers ?? []
  if (forLimit && modifiers.some(m => m.poolOnly)) {
    return (augmented.base ?? 0) + modifiers
      .filter(m => !m.poolOnly && !m.isMultiplier && m.type !== "augmentationCap")
      .reduce((sum, m) => sum + (Number(m.value) || 0), 0)
  }
  const cut = modifiers.filter(m => m.type === "augmentationCap").reduce((sum, m) => sum + (Number(m.value) || 0), 0)
  return (augmented.value ?? 0) - cut
}

//Base of a limit (SR5 p. 52). rating(attribute) reads a mental or social rating, physical(attribute) a rating
//for the Physical limit. An AI on a device (Data Trails p. 160): Data Processing can replace the Mental limit
//and joins the Social limit. undefined for a key the formulas do not know.
export function limitBase(key, {
  attributes, essence, aiDataProcessing = null, rating, physical
}) {
  switch (key) {
    case "astralLimit":
      return Math.max(
        Math.ceil((rating(attributes.logic) * 2 + rating(attributes.intuition) + rating(attributes.willpower)) / 3),
        Math.ceil((rating(attributes.charisma) * 2 + rating(attributes.willpower) + essence) / 3)
      )
    case "mentalLimit": {
      const base = Math.ceil((rating(attributes.logic) * 2 + rating(attributes.intuition) + rating(attributes.willpower)) / 3)
      return aiDataProcessing !== null ? Math.max(base, aiDataProcessing) : base
    }
    case "physicalLimit":
      return Math.ceil((physical(attributes.strength) * 2 + physical(attributes.body) + physical(attributes.reaction)) / 3)
    case "socialLimit":
      if (aiDataProcessing !== null) return Math.ceil((rating(attributes.charisma) + aiDataProcessing + rating(attributes.willpower) + essence) / 3)
      return Math.ceil((rating(attributes.charisma) * 2 + rating(attributes.willpower) + essence) / 3)
    default:
      return undefined
  }
}

//The limits whose help tells what the cap cost (arbitrage de DjamZ: Physical, Mental, Social), and only
//when it did cost something: { kept, uncapped } or null.
export const CAP_NOTE_LIMITS = ["physicalLimit", "mentalLimit", "socialLimit"]
export function limitCapNote(kept, base, uncappedBase) {
  if (!(uncappedBase > base)) return null
  return {
    kept, uncapped: kept + uncappedBase - base
  }
}
