import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5
} from "../../config.js"
import {
  penetrationModifier, protectionOf
} from "../../system/diseases.js"
import {
  radiationModifiers
} from "../../system/radiation.js"

//Add info for Resistance Roll
export default async function resistanceSimple(rollData, rollKey, actor){
  let subKey = rollKey.split("_").pop()
  let resistanceKey = rollKey.split("_").shift()
    
  //Iterate throught Resistant type to add title and dicepool composition
  switch (resistanceKey){
    case "physicalDamage":
      rollData.test.title = game.i18n.localize(SR5.characterResistances.physicalDamage)
      rollData.dicePool.composition = actor.system.resistances.physicalDamage.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
      rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.resistances.physicalDamage.modifiers)
      break
    case "directSpellMana":
      rollData.test.title = game.i18n.localize(SR5.characterResistances.directSpellMana)
      rollData.dicePool.composition = actor.system.resistances.directSpellMana.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
      rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.resistances.directSpellMana.modifiers)
      break
    case "directSpellPhysical":
      rollData.test.title = game.i18n.localize(SR5.characterResistances.directSpellPhysical)
      rollData.dicePool.composition = actor.system.resistances.directSpellPhysical.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
      rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.resistances.directSpellPhysical.modifiers)
      break
    case "toxin":
      rollData.test.title = game.i18n.localize(SR5.characterResistances.toxin) + " (" + game.i18n.localize(SR5.propagationVectors[subKey]) + ")"
      rollData.dicePool.composition = actor.system.resistances.toxin[subKey].modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
      rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.resistances.toxin[subKey].modifiers)
      break
    case "disease":
      rollData.test.title = game.i18n.localize(SR5.characterResistances.disease) + " (" + game.i18n.localize(SR5.propagationVectors[subKey]) + ")"
      rollData.dicePool.composition = actor.system.resistances.disease[subKey].modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
      rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.resistances.disease[subKey].modifiers)
      break
    case "specialDamage":
      rollData.test.title = game.i18n.localize(SR5.characterResistances.specialDamage) + " (" + game.i18n.localize(SR5.specialDamageTypes[subKey]) + ")"
      rollData.dicePool.composition = actor.system.resistances.specialDamage[subKey].modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
      rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.resistances.specialDamage[subKey].modifiers)
      break
    default:
      SR5_SystemHelpers.srLog(1, `Unknown '${resistanceKey}' Damage Resistance Type in roll`)
  }

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Add others informations
  rollData.test.type = "resistanceSimple"
  rollData.test.typeSub = rollKey

  return rollData
}
// A disease resistance test asked by the GM (Run Faster p. 111): the disease pool, the treatment, the penalty of a
// willing subject, and the penetration, which takes off only what protection systems give (Run Faster p. 112).
// The ledger reference rides on the card; the GM alone applies it (system/diseases.js)
export async function resistanceDisease(rollData, vector, actor, chatData){
  const disease = chatData?.disease
  if (!disease) return
  rollData = await resistanceSimple(rollData, `disease_${vector}`, actor)
  rollData.test.title = `${game.i18n.localize(SR5.characterResistances.disease)} : ${disease.name} (${disease.power})`
  const labels = {
    diseaseTreatment: "SR5.DISEASE_TreatmentModifier", diseaseVolunteer: "SR5.DISEASE_VolunteerModifier"
  }
  for (const m of disease.modifiers ?? []) rollData.dicePool.modifiers.push({
    type: m.type, label: game.i18n.localize(labels[m.type] ?? m.type), value: m.value
  })
  const penetration = penetrationModifier(disease.penetration, protectionOf(actor.system.resistances.disease[vector]?.modifiers))
  if (penetration) rollData.dicePool.modifiers.push({
    type: "diseasePenetration", label: game.i18n.localize("SR5.ToxinPenetration"), value: penetration
  })
  rollData.disease = {
    infectionId: disease.infectionId, token: disease.token
  }
  return rollData
}

// A radiation zone test asked by the GM (Run & Gun p. 164-165): Body + Willpower, with the radiation shielding
// and the Radiation tolerance; the ledger reference rides on the card, the GM alone applies it (system/radiation.js)
export async function resistanceRadiation(rollData, actor, chatData){
  const radiation = chatData?.radiation
  if (!radiation) return
  const attributes = actor.system.attributes
  rollData.test.title = `${game.i18n.localize("SR5.RADIATION_Title")} (${radiation.power})`
  rollData.test.typeSub = "radiation"
  rollData.dicePool.composition = [
    {
      source: game.i18n.localize("SR5.Body"), type: "linkedAttribute", value: attributes.body.augmented.value 
    },
    {
      source: game.i18n.localize("SR5.Willpower"), type: "linkedAttribute", value: attributes.willpower.augmented.value 
    },
  ]
  rollData.dicePool.base = attributes.body.augmented.value + attributes.willpower.augmented.value
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, radiationModifiers(actor.system))
  rollData.radiation = {
    exposureId: radiation.exposureId, token: radiation.token
  }
  return rollData
}
