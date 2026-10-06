import {
  effectPhase
} from "./drug-phase.js"
import {
  distinctDrugs, drugCrashIsInstant, isSameDrug
} from "./drug-stat.js"

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
  //KAMI+, custom drug of the Megapack made by DjamZ (Chrome Flesh p. 194-196): base 1, block 2 level 1, block 6 level 3
  //(2S), block 9 level 3 (8S), two Speed enhancers. The crashes of the blocks add up (Wrecker's example, p. 195): 10S
  kamiPlus: {
    crash: {
      value: 10, resist: "none"
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

// What a dose of Long Haul is, counted for the actor and not for one item (SR5 p. 413): "second" when any Long Haul of
// the actor is in its crash (the item itself included, its phase not written yet by the sheet), "noMore" while a second
// dose (or a dose that kept no one awake) is still in its rise or its crash, whatever the item, "first" otherwise
export function longHaulDoseKind(item, consumer){
  const doses = [item?.system, ...[...(consumer?.items ?? [])]
    .filter(i => i?.type === "itemDrug" && (i.id ?? i._id) !== item?._id && drugKeyOf(i.system) === "longHaul")
    .map(i => i.system)].filter(s => s && ["rise", "crash"].includes(s.phase))
  if (doses.some(s => s.handleShot?.longHaulSecondDose || s.handleShot?.longHaulNoMore)) return "noMore"
  if (doses.some(s => s.phase === "crash")) return "second"
  return "first"
}

// Long Haul (SR5 p. 413): a dose may be taken during its crash, so the switch of the sheet takes a dose there instead of
// ending the crash (templates/actors/_partials/right-tabs/gear/variousGear.hbs)
export function drugTakesDoseInCrash(system){
  return drugKeyOf(system) === "longHaul"
}

// The vector of a resisted drug: the item's own, injection first then ingestion (vectors no gear protects against,
// SR5 p. 409-410); ingestion when the item gives none
export function drugVector(system){
  const vector = system?.vector ?? {
  }
  return ["injection", "ingestion", "inhalation", "contact"].find(v => vector[v] === true) ?? "ingestion"
}

// The addiction rating of a drug, the sum the overdose is made of (SR5 p. 417)
const addictionRating = system => Math.max(Number(system?.addiction?.rating) || 0, 0)

// What a drug acts on while under its effect: the targets of its effects of the rise (drug-phase.js)
function riseTargets(system){
  const list = Array.isArray(system?.customEffects) ? system.customEffects : Object.values(system?.customEffects ?? {
  })
  return new Set(list.filter(e => e?.target && effectPhase(e) === "rise").map(e => e.target))
}

// SR5 p. 417, Faire une surdose: a substance taken while still under its own effect, or under the effect of another one
// "qui partage avec elle un effet commun ou opposé" (Cram and Novacoke both on Reaction), deals Stun damage "dont la VD
// est égale à la somme des indices d'addiction des drogues redondantes (on double donc l'indice d'addiction d'une drogue
// dont on répète l'utilisation)", resisted with Body + Willpower. A common or opposed effect is read as an effect of the
// rise on the same target. `item`: the drug being taken; `consumer`: the actor, whose drugs under effect are read (the
// one being taken left out, so that the sum reads the same at the intake and at the resistance card). Each drug is
// counted once, however many copies of it are under effect
export function overdoseOf(item, consumer){
  if (!item?.system) return null
  const id = item.id ?? item._id
  //Under effect, as the interaction reads it (Chrome Flesh p. 196): in its rise, or in a crash that is not only damage.
  //It also keeps the sum the same at the resistance card when an interaction 7-9 started the crashes in between
  const underEffect = s => s?.isActive || (s?.wirelessTurnedOn && !drugCrashIsInstant(s))
  const others = [...(consumer?.items ?? [])].filter(d => d?.type === "itemDrug" && (d.id ?? d._id) !== id && underEffect(d.system))
  //Long Haul taken again in its crash has its own rule, the crash of a second dose (SR5 p. 413)
  const repeated = others.some(d => isSameDrug(d, item) && !(drugKeyOf(d.system) === "longHaul" && !d.system.isActive))
  const targets = riseTargets(item.system)
  const sharing = distinctDrugs(others.filter(d => !isSameDrug(d, item) && [...riseTargets(d.system)].some(t => targets.has(t))))
  if (!repeated && !sharing.length) return null
  const value = addictionRating(item.system) * (repeated ? 2 : 1) + sharing.reduce((sum, d) => sum + addictionRating(d.system), 0)
  if (value <= 0) return null
  return {
    key: drugKeyOf(item.system), value, type: "stun", resist: "bodyWill", phase: "overdose", itemId: id,
    drugs: [item.name, ...sharing.map(d => d.name)]
  }
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
    //Read again off the OTHER drugs under effect, the one taken left out of the sum as at the intake. Its own phase is not
    //read: an interaction 7-9 may have ended it in between (Cram, a crash of damage only, is over at once, measured 06/10).
    //A card asked for nothing only hurts the resisting actor, and its DV is still the sum the drugs give
    else if (drug.phase === "overdose") damage = overdoseOf(item, actor)
    else {
      damage = crashDamageOf(key, item.system.handleShot, actor.items)
      //The crash Physical after an interaction 11-13 can only make it worse
      if (damage && chatData.damage.type === "physical") damage.type = "physical"
    }
  }
  if (!damage || !["body", "toxin", "bodyWill"].includes(damage.resist)) return undefined

  const attributes = actor.system.attributes
  const name = drug.phase === "overdose" ? `${game.i18n.localize("SR5.DrugOverdose")} ${item.name}` : (item?.name ?? game.i18n.localize("SR5.DrugInteraction"))
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
  } else if (damage.resist === "bodyWill") {
    //SR5 p. 417: "un test de Constitution + Volonté", nothing else
    const body = attributes.body.augmented.value, willpower = attributes.willpower.augmented.value
    rollData.dicePool.composition = [{
      source: game.i18n.localize("SR5.Body"), type: "linkedAttribute", value: body
    }, {
      source: game.i18n.localize("SR5.Willpower"), type: "linkedAttribute", value: willpower
    }]
    rollData.dicePool.base = body + willpower
  } else {
    rollData.dicePool.composition = [{
      source: game.i18n.localize("SR5.Body"), type: "linkedAttribute", value: attributes.body.augmented.value
    }]
    rollData.dicePool.base = attributes.body.augmented.value
  }
  rollData.test.typeSub = "drugDamage"
  return rollData
}
