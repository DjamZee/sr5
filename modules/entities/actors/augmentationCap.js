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
