import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_Toxins
} from "../items/toxins.js"
import {
  applyDrugQuality, drugAddictionThreshold, effectiveDrugQuality, crashSinceIntake
} from "../items/drug-stat.js"
import {
  longHaulDoseKind
} from "../items/drug-damage.js"
import {
  computeCustomDrug, customDrugShot
} from "../items/drug-designer.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"

// Drugs: addiction and doses.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
export class SR5_CharacterDrugsUtility {

  // Generate Drug addiction
  // focusRating: for a focus, the total Force of the active foci (SR5 p. 416), its own Force by default
  static generateDrugAddiction(item, focusRating = item.system.itemRating) {
    let addiction = [], drugTaken

    if (item.type === "itemDrug") {
      drugTaken = {
        "name": item.name,
        //A drug's addiction: the dice of Drug Tolerance are for it alone (rollData-Addiction.js)
        "kind": "drug",
        "shot": {
          "value": 0,
          "base": 1,
          "modifiers": []
        },
        //Pharmaceutical drugs: threshold -1 (Chrome Flesh p. 194)
        "addiction": {
          ...item.system.addiction, "threshold": drugAddictionThreshold(item.system)
        },
        "weekAddiction": {
          "value": 0,
          "base": 11 - item.system.addiction.rating,
          "modifiers": []
        },
      }
    }

    if (item.type === "itemFocus") {
      drugTaken = {
        "name": item.name,
        "shot": {
          "value": 0,
          "base": 1,
          "modifiers": []
        },
        // Foci (SR5 p. 416): the rating is the total Force of the active foci, threshold 2. A nested
        // object, so that the sheet and the addiction test read it (dotted keys stayed dotted in the array)
        "addiction": {
          "type": "psychological", "rating": focusRating, "threshold": 2
        },
        "weekAddiction": {
          "value": 0,
          "base": Math.max(1, 11 - focusRating),
          "modifiers": []
        },
      }
    }
    SR5_EntityHelpers.updateValue(drugTaken.shot)
    SR5_EntityHelpers.updateValue(drugTaken.weekAddiction)
    addiction.push(drugTaken)
    return addiction
  }

  // Handle drug stats
  //`consumer`: who takes it. The sheet passes a copy of the item, without a parent (Liesel's D4)
  //The doses counted (Soothsayer) are read by the sheet on its working list (entities/items/drug-damage.js, M7 D1)
  static async handleDrugShots(item, drugType, actorData, consumer = item.parent) {
    let drugStat
    let roll, rollRoll, rollSpeed, rollRollSpeed, duration, effect

    switch (drugType.value) {
      case "bliss":
        duration = Math.max(6 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "cram":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 10,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "deepweed":
        duration = Math.max(6 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "jazz":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413-414), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "kamikaze":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413-414), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "longHaul": {
        roll = new Roll(`8d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 10,
          "speedType": "SR5.Minutes",
          "duration": 4,
          "durationType": "day",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "hour",
        }
        //SR5 p. 413: a second dose taken after the first one wore off (in its crash) keeps awake (1D6/2) days more,
        //(12 × 1D6) hours, then 10S unresisted and the same crash (drug-damage.js). No further dose keeps awake. Counted
        //for the actor, the same pile taken during its own crash or another Long Haul item (Eudoxie's review, D1)
        const kind = longHaulDoseKind(item, consumer)
        if (kind === "noMore") {
          ui.notifications.warn(game.i18n.localize("SR5.DrugLongHaulNoMore"))
          //One Combat Turn, the shortest the drug clock counts (0 is never counted): back to its crash at once
          drugStat.duration = 1
          drugStat.durationType = "combatTurn"
          drugStat.longHaulNoMore = true
        } else if (kind === "second") {
          rollSpeed = new Roll(`1d6 * 12`)
          rollRollSpeed = await rollSpeed.evaluate()
          drugStat.duration = rollRollSpeed.total
          drugStat.durationType = "hour"
          drugStat.longHaulSecondDose = true
          ui.notifications.info(`${item.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.DrugLongHaulSecondDose")}`)
        }
        break
      }
      //KAMI+, custom drug of the Megapack (Chrome Flesh p. 194-196): base duration (10 × 1D6) minutes, base Speed of
      //3 Combat Turns brought to 1 by its two Speed enhancers; crash 10S (drug-damage.js)
      case "kamiPlus":
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": rollRoll.total,
          "durationType": "minute",
        }
        break
      //A drug made with the designer (Chrome Flesh p. 194-196): Speed, (10 × ND6) minutes and crash worked out from its
      //recipe (drug-designer.js), the crash damage carried by the stat (drug-damage.js)
      case "customDrug": {
        const recipe = item.system?.designer?.recipe
        roll = new Roll(`${computeCustomDrug(recipe).durationDice}d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = customDrugShot(recipe, rollRoll.total)
        break
      }
      case "nitro":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": rollRoll.total,
          "durationType": "minute",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "novacoke":
        duration = Math.max(10 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "psyche":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 10,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "zen":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413-414), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 5,
          "speedType": "SR5.Minutes",
          "duration": rollRoll.total,
          "durationType": "minute",
        }
        break
      case "aexd":
        roll = new Roll(`2d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "aisa":
        roll = new Roll(`2d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 20 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "animalTongue":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        rollSpeed = new Roll(`3d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "ayaosWill":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 2,
          "speedType": "SR5.CombatTurns",
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "betel":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "betameth":
        duration = Math.max(9 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "cereprax":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "crimsonOrchid":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "dopadrine":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "eX":
        duration = Math.max(8 - actorData.attributes.body.augmented.value, 1)
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          //Chrome Flesh p. 186: disorientation as long as the effect, and -2 social Limit for (Body) hours
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
          "socialLimitContrecoup": actorData.attributes.body.augmented.value,
        }
        break
      case "forgetMeNot":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "galak":
        duration = Math.max(9 - actorData.attributes.body.augmented.value, 3)
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          //Chrome Flesh p. 186, as eX: disorientation as long as the effect, and -2 social Limit for (Body) hours
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
          "socialLimitContrecoup": actorData.attributes.body.augmented.value,
        }
        break
      case "g3":
        duration = Math.max(15 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "guts":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "hecatesBlessing":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
          "durationContrecoup": 2 * duration,
          "durationContrecoupType": "minute",
        }
        break
      case "hurlg":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        rollSpeed = new Roll(`2d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "immortalFlower":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        //Its 2D6 Physical at the crash, for the characters with implants, are in entities/items/drug-damage.js
        drugStat = {
          "name": drugType.value,
          "speed": 16,
          "speedType": "SR5.CombatTurns",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "k10":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 5 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "laes":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 20 * rollRoll.total
        effect = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
          "effectDuration": effect,
          "effectDurationType": "SR5.Hours",
        }
        break
      //Stolen Souls p. 192 rather than Chrome Flesh p. 190 (arbitrage de DjamZ, H20): Power 10, and drowsiness
      //rather than unconsciousness, which the book does not quantify. Stolen Souls gives no duration: 5 × 1D6
      //minutes stays the one of Chrome Flesh p. 190
      case "leal":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 5 * rollRoll.total
        effect = Math.max(120 - actorData.attributes.body.augmented.value, 100)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
          "drowsy": true,
          "effectDuration": effect,
          "effectDurationType": "SR5.Minutes",
        }
        break
      case "littleSmoke":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        rollSpeed = new Roll(`2d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "memoryFog":
        duration = Math.max(14 - actorData.attributes.body.augmented.value, 2)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "nightwatch":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 20 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "noPaint":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "hour",
        }
        break
      case "oneiro":
        roll = new Roll(`3d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          //Chrome Flesh p. 190: disorientation "pour une durée égale à celle de l'effet de la drogue"
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "oxygenatedFluorocarbons":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRoll.total,
          "speedType": "SR5.Hours",
          "duration": 1,
          "durationType": "week",
          "durationContrecoup": actorData.attributes.body.augmented.value,
          "durationContrecoupType": "day",
        }
        break
      case "overdrive":
        duration = Math.max(10 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      //Chrome Flesh p. 191: +1 Charisma and Perception, Pain Tolerance 1, memory loss; no damage, on taking or after
      case "pixieDust":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          "effectDuration": rollRollSpeed.total,
          "effectDurationType": "SR5.Minutes",
        }
        break
      case "push":
        duration = Math.max(15 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "redMescaline":
        duration = Math.max(18 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "ripper":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "rockLizardBlood":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": 30,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "shade":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "slab":
        duration = Math.max(10 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 2,
          "speedType": "SR5.CombatTurns",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": Math.floor(duration / 2),
          "durationContrecoupType": "hour",
        }
        break
      case "snuff":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "minute",
          "durationContrecoup": duration * 2,
          "durationContrecoupType": "minute",
        }
        break
      case "soberTime":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "soothsayer": {
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        //Its 8S on intake, 1 less per application already made, are in entities/items/drug-damage.js
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "hour",
        }
        break
      }
      case "trance":
        duration = Math.max(6 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "woad":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 5 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
          //Chrome Flesh p. 187: "une durée 10 fois supérieure à la durée de l'effet", which is in minutes
          "durationContrecoup": 10 * duration,
          "durationContrecoupType": "minute",
        }
        break
      case "wuduAku":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        rollSpeed = new Roll(`2d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          //Chrome Flesh p. 193: "une fois la drogue ingérée", -2 dice to the other spirits "pendant une durée de 24 heures",
          //counted from the intake: the crash holds what is left of them once the speed and the effect are over
          "sinceIntake": 24 * 60,
        }
        break
      case "zero":
        duration = Math.max(20 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "zombieDust":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": 2,
          "speedType": "SR5.CombatTurns",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "zone":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
        }
        break
      //Chrome Flesh p. 194: speed "Immédiate", 48 hours, no crash
      case "psychochip":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 48,
          "durationType": "hour",
        }
        break
      //Bullets & Bandages p. 19: (30 - Body) minutes, no speed given
      case "cryo":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": Math.max(30 - actorData.attributes.body.augmented.value, 1),
          "durationType": "minute",
        }
        break
      //Bullets & Bandages p. 19: (Body) Combat Turns
      case "hemoSynth":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": Math.max(actorData.attributes.body.augmented.value, 1),
          "durationType": "combatTurn",
        }
        break
      //Bullets & Bandages p. 19-20: 24 hours
      case "nanoScan":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 24,
          "durationType": "hour",
        }
        break
      //Bullets & Bandages p. 20: 1D6 × 10 minutes, one die times ten. A BTL program (SR5 p. 414): speed "Immédiate",
      //duration "typically (10 × 1D6) minutes", the same die; its rebound (p. 415) has no figure, so no crash
      case "neostigmine":
      case "ondansetron":
      case "btl":
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
        }
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${drugType.value}' drug type in handleDrugShots()`)
        return
    }
    //"ESS + 1D6 heures" (Chrome Flesh p. 191-193) gives 9.9 hours with a datajack: the book rounds up when it does not
    //say otherwise (SR5 p. 50, written for divisions: its use for a sum is a reading). Rounded to the hundredth first, or an Essence of 5 stored as 5.0000001 would give one hour more
    if (typeof drugStat.duration === "number") drugStat.duration = Math.ceil(Math.round(drugStat.duration * 100) / 100)
    //An antitoxin divides the duration of the effect by its rating (Chrome Flesh p. 154)
    const antitoxin = SR5_Toxins.antitoxinRating(actorData)
    if (antitoxin > 1) drugStat.duration = SR5_Toxins.drugDuration(drugStat.duration, antitoxin)
    //The quality of the drug changes the duration of its crash (Chrome Flesh p. 194)
    applyDrugQuality(drugStat, effectiveDrugQuality(item.system, consumer))
    //After the quality: 24 hours from the intake are not a crash the quality lengthens
    if (drugStat.sinceIntake) Object.assign(drugStat, crashSinceIntake(drugStat))
    return drugStat
  }
}
