// The damage of the drugs: when it comes (on intake or at the crash) and how it is resisted, read off the drug key of
// the item and the addictions of the actor, never off a value written on the item or on a card.
// resist: "none" (no test), "body" (resisted with Body only), "toxin" (toxin resistance test, Body + Willpower, SR5 p. 409:
// "les drogues sont des toxines que l'on prend à dessein", SR5 p. 412)
export const DRUG_DAMAGE = {
  //SR5 p. 413-414: "sans test de résistance", when the effect wears off
  cram: {
    crash: {
      value: 6, resist: "none"
    }
  },
  kamikaze: {
    crash: {
      value: 6, resist: "none"
    }
  },
  nitro: {
    crash: {
      value: 9, resist: "none"
    }
  },
  //SR5 p. 413: a second dose taken after the first one wore off keeps awake (1D6/2) days, then 10 unresisted Stun
  //(drug-crash.js reads it on the dose, utilityActor.handleDrugShots sets it)
  longHaul: {
  },
  //Chrome Flesh p. 185-194, "non-résistés" when the effect wears off. Aisa: 4S more per extra dose taken at once
  aisa: {
    crash: {
      value: 2, resist: "none"
    }, extraDose: 4
  },
  betameth: {
    crash: {
      value: 6, resist: "none"
    }
  },
  cereprax: {
    crash: {
      value: 5, resist: "none"
    }
  },
  k10: {
    crash: {
      value: 18, resist: "none"
    }
  },
  ripper: {
    crash: {
      value: 2, resist: "none"
    }
  },
  overdrive: {
    crash: {
      value: 8, resist: "none"
    }
  },
  shade: {
    crash: {
      value: 10, resist: "none"
    }
  },
  rockLizardBlood: {
    crash: {
      value: 2, resist: "none"
    }
  },
  //Chrome Flesh p. 193: 2D6 Physical, unresisted, and only for the characters with implants, cyber or bio
  immortalFlower: {
    crash: {
      dice: "2d6", type: "physical", resist: "none", implantsOnly: true
    }
  },
  //Chrome Flesh p. 187: "9E (résistés avec Constitution)" when the effect wears off
  hurlg: {
    crash: {
      value: 9, resist: "body"
    }
  },
  //Chrome Flesh p. 186: the effect is the damage, "8E, résistés uniquement avec Constitution", 1 less per application
  //already made, whatever the time since
  soothsayer: {
    intake: {
      value: 8, resist: "body", lessPerDose: 1
    }
  },
  //Chrome Flesh p. 190 (Stolen Souls p. 192 for the Leäl, arbitrage de DjamZ H20): resisted on taking, a toxin of
  //Power 12 (Laés) or 10 (Leäl), penetration 0
  laes: {
    intake: {
      value: 12, resist: "toxin"
    }
  },
  leal: {
    intake: {
      value: 10, resist: "toxin"
    }
  },
  //Chrome Flesh p. 188-189 and Stolen Souls p. 192: Power 16, Stun damage, resisted on taking
  slab: {
    intake: {
      value: 16, resist: "toxin"
    }
  },
  //KAMI+ (custom drug of the Megapack, Chrome Flesh p. 195-196): its block 9 at level 3 crashes for 8S, unresisted
  kamiPlus: {
    crash: {
      value: 8, resist: "none"
    }
  },
}

//Chrome Flesh p. 197, 14+: "10P immédiats (résistés uniquement avec la Constitution)"
export const DRUG_INTERACTION_DAMAGE = {
  value: 10, type: "physical", resist: "body"
}

//SR5 p. 413: the crash of a second dose of Long Haul
export const LONG_HAUL_SECOND_DOSE_DAMAGE = 10

// Chrome Flesh p. 193, "implants, cyber ou bio"
const IMPLANT_TYPES = ["cyberware", "bioware", "culturedBioware", "nanocyber"]

// The drug key of an item system ("" when it has none)
export function drugKeyOf(system){
  const effects = system?.systemEffects
  const list = Array.isArray(effects) ? effects : Object.values(effects ?? {
  })
  return list.find(e => e?.category === "drug")?.value ?? ""
}

export function hasImplants(items){
  return [...(items ?? [])].some(i => i?.type === "itemAugmentation" && IMPLANT_TYPES.includes(i.system?.type) && i.system?.isActive !== false)
}

// The doses of a drug counted in the addictions of the actor, the one being taken included once written
export function dosesTaken(addictions, itemName){
  const entry = (Array.isArray(addictions) ? addictions : Object.values(addictions ?? {
  })).find(d => d?.name === itemName)
  return Number(entry?.shot?.value) || 0
}

// The damage of a drug on intake, { key, value, type, resist }, or null. `doses`: the doses counted, this one included
export function intakeDamageOf(key, doses = 1){
  const intake = DRUG_DAMAGE[key]?.intake
  if (!intake) return null
  let value = intake.value
  if (intake.lessPerDose) value = Math.max(intake.value - intake.lessPerDose * Math.max(doses - 1, 0), 0)
  if (value <= 0) return null
  return {
    key, value, type: "stun", resist: intake.resist
  }
}

// The damage of a drug at its crash, { key, value | dice, type, resist }, or null. `shot`: the dose (Long Haul second
// dose, Physical after an interaction 11-13); `items`: the items of the actor (implants)
export function crashDamageOf(key, shot = {
}, items = []){
  let crash = DRUG_DAMAGE[key]?.crash
  if (key === "longHaul" && shot?.longHaulSecondDose) crash = {
    value: LONG_HAUL_SECOND_DOSE_DAMAGE, resist: "none"
  }
  if (!crash) return null
  if (crash.implantsOnly && !hasImplants(items)) return null
  return {
    key, value: crash.value, dice: crash.dice, resist: crash.resist,
    type: shot?.crashPhysical ? "physical" : (crash.type ?? "stun"),
  }
}

// Does the drug deal damage at its crash, whoever takes it (used to know whether it has a crash at all)
export function drugHasCrashDamage(key, shot = {
}){
  return !!(DRUG_DAMAGE[key]?.crash || (key === "longHaul" && shot?.longHaulSecondDose))
}

// The Long Haul in its crash when a dose is taken (SR5 p. 413): the item itself, its phase not written yet by the sheet,
// or another Long Haul of the actor. Its system, or null
export function longHaulInCrash(item, consumer){
  if (item?.system?.phase === "crash") return item.system
  const other = [...(consumer?.items ?? [])].find(i => i?.type === "itemDrug" && (i.id ?? i._id) !== item?._id &&
    i.system?.phase === "crash" && drugKeyOf(i.system) === "longHaul")
  return other?.system ?? null
}

// The vector of a resisted drug: the item's own, injection first then ingestion (vectors no gear protects against,
// SR5 p. 409-410); ingestion when the item gives none
export function drugVector(system){
  const vector = system?.vector ?? {
  }
  return ["injection", "ingestion", "inhalation", "contact"].find(v => vector[v] === true) ?? "ingestion"
}

// The resistance test of a drug damage, called by the resistance card (rolls/roll-prepare-case/rollData-Resistance.js).
// Only for a damage the system works out itself, without a card: the value and the pool come from the drug key, the
// item and the addictions, not from what was handed in. Returns undefined to refuse
export function drugResistance(rollData, actor, chatData){
  const drug = chatData?.damage?.drug ?? {
  }
  if (chatData?.owner?.messageId || !actor?.system) return undefined
  let damage, item
  if (drug.interaction) damage = DRUG_INTERACTION_DAMAGE
  else {
    item = actor.items?.get?.(drug.itemId)
    if (!item || item.type !== "itemDrug") return undefined
    const key = drugKeyOf(item.system)
    if (drug.phase === "intake") damage = intakeDamageOf(key, dosesTaken(actor.system.addictions, item.name))
    else {
      damage = crashDamageOf(key, item.system.handleShot, actor.items)
      //The crash Physical after an interaction 11-13 can only make it worse
      if (damage && chatData.damage.type === "physical") damage.type = "physical"
    }
  }
  if (!damage || !["body", "toxin"].includes(damage.resist)) return undefined

  const attributes = actor.system.attributes
  const name = item?.name ?? game.i18n.localize("SR5.DrugInteraction")
  rollData.damage.base = damage.value
  rollData.damage.type = damage.type ?? "stun"
  rollData.damage.isAttack = false
  rollData.damage.element = ""
  rollData.combat.armorPenetration = 0
  rollData.test.title = `${game.i18n.localize("SR5.TakeOnDamageShort")} ${name} (${damage.value}${game.i18n.localize(damage.type === "physical" ? "SR5.DamageTypePhysicalShort" : "SR5.DamageTypeStunShort")})`
  if (damage.resist === "toxin") {
    const pool = actor.system.resistances?.toxin?.[drugVector(item?.system)]
    if (!pool) return undefined
    rollData.dicePool.composition = pool.modifiers
    rollData.dicePool.base = pool.dicePool
  } else {
    rollData.dicePool.composition = [{
      source: game.i18n.localize("SR5.Body"), type: "linkedAttribute", value: attributes.body.augmented.value
    }]
    rollData.dicePool.base = attributes.body.augmented.value
  }
  rollData.test.typeSub = "drugDamage"
  return rollData
}
