import {
  SR5 
} from "../../config.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_ConverterHelpers 
} from "./converter.js"
import {
  _getSRStatusEffect 
} from "../../system/effectsList.js"

export class SR5_CombatHelpers {

  // SR5 p. 176: environmental modifiers "reflect the conditions surrounding the action". The action happens
  // where the tokens stand and where the distance is measured, which is the scene on the canvas - not the
  // active scene, which the GM may not be showing.
  // sceneId: the scene an attack card was rolled on. A defense is clicked later, maybe by a player looking at
  // another scene, and must read the conditions where the attack took place; if that scene is gone, fall back
  // to the canvas, and say so: those may not be the conditions of the attack.
  static environmentScene(sceneId = null){
    const scene = sceneId ? globalThis.game?.scenes?.get(sceneId) : null
    if (scene) return scene
    const canvasScene = globalThis.canvas?.scene ?? null
    if (sceneId && canvasScene) globalThis.ui?.notifications?.warn(game.i18n.localize("SR5.WARN_AttackSceneGone"))
    return canvasScene
  }

  // SR5 p. 188: "if both fighters have the same vision systems and therefore the same penalties, the GM may
  // decide to ignore all environmental modifiers". A world setting, off by default (the modifier applies to
  // everyone). Each side's modifier is worked out for that fighter, with their own vision.
  static meleeEnvironmentBalanced(ownMod, otherMod){
    if (!globalThis.game?.settings?.get?.("sr5", "sr5MeleeEnvironmentBalanced")) return false
    if (!Number.isFinite(ownMod) || !Number.isFinite(otherMod)) return false
    return ownMod === otherMod
  }

  // The same option seen from the defense, against the attack card. Both fighters or neither: an attack rolled
  // with no designated target had no one to compare with and kept its modifier, so the defense keeps its own.
  static meleeDefenseEnvironmentBalanced(defenseMod, attackCard){
    if (!attackCard?.target?.hasTarget) return false
    return SR5_CombatHelpers.meleeEnvironmentBalanced(defenseMod, attackCard.combat?.environmentalMod)
  }

  // The melee modifier (Light and Visibility, SR5 p. 188) of an actor who can see, or null for one who has no
  // environmental data (a device, a sprite).
  static meleeEnvironmentalMod(scene, actor){
    if (!scene || !actor?.system?.itemsProperties?.environmentalMod || !actor.system.visions) return null
    return SR5_CombatHelpers.handleEnvironmentalModifiers(scene, actor.system, true, undefined, true)
  }

  //Handle environmental modifiers
  //noWind: ignore the wind column (perception, melee); melee: SR5 p. 188, only the Light and Visibility columns apply
  //weaponLight: light rows taken off by a flashlight on the weapon being used (SR5_UtilityItem.getWeaponLightCompensation)
  //weaponLightCap: light row a standard flashlight on that weapon brings the scene down to (SR5_UtilityItem.getWeaponLightCap)
  static handleEnvironmentalModifiers(scene, actor, noWind, areaEffect = {
    visibility:0, light:0, glare:0, wind:0
  }, melee = false, weaponLight = 0, weaponLightCap = null){
    // With no scene there are no conditions to read: say so rather than roll as if all were normal.
    if (!scene) {
      globalThis.ui?.notifications?.warn(game.i18n.localize("SR5.WARN_NoSceneForEnvironment"))
      return 0
    }
    let actorData = actor.itemsProperties.environmentalMod
    // A scene whose SR5 tab was never saved has no flags, and an area effect may set a single column: a
    // missing value is the "normal" row of its column (0, SR5 p. 176). Left as NaN, it made Math.max return
    // NaN, which environmentalLineToMod turns into 0 - the whole modifier vanished, darkness included.
    const row = value => parseInt(value) || 0
    const sceneRow = key => row(scene.getFlag("sr5", key))
    let visibilityMod = Math.min(Math.max(sceneRow("environModVisibility") + row(areaEffect.visibility) + row(actorData.visibility.value), 0), 4)
    let sceneLight = sceneRow("environModLight") + row(areaEffect.light)
    // A standard flashlight on the weapon brings the light where it points down to partial light (Run & Gun p. 69)
    if (Number.isFinite(weaponLightCap)) sceneLight = Math.min(sceneLight, weaponLightCap)
    let lightMod = Math.min(Math.max(sceneLight + row(actorData.light.value) + weaponLight, 0), 4)
    // SR5 p. 177: low-light vision treats partial light (1) and dim light (2) as full light; it does nothing in total darkness (3)
    if (actor.visions.lowLight.isActive && sceneLight > 0 && sceneLight <= 2) lightMod = 0
    let glareMod = Math.min(Math.max(sceneRow("environModGlare") + row(areaEffect.glare) + row(actorData.glare.value), 0), 4)
    let windMod = Math.min(Math.max(sceneRow("environModWind") + row(areaEffect.wind) + row(actorData.wind.value), 0), 4)

    // SR5 p. 176: Light and Glare are a single column of the Environmental Modifiers table,
    // "LUMIERE / EBLOUISSEMENT", with one row per degree. The scene keeps them as two flags, so the
    // worst of the two is that column's value.
    let lightGlareMod = Math.max(lightMod, glareMod)

    // Only then can the "equally severe" rule be applied, since it counts conditions and not flags:
    // with light and glare listed apart, one condition was counted twice and dim light in moderate
    // glare came out one row too far.
    // Once the column is whole, the melee case is the same as noWind: p. 188 keeps Light and
    // Visibility, and Glare belongs to the Light column, so there is nothing left for melee to drop.
    let arrayMod = [visibilityMod, lightGlareMod, windMod]
    if (melee || noWind) arrayMod = [visibilityMod, lightGlareMod]
    let finalMod = Math.max(...arrayMod)

    if (finalMod > 0 && finalMod < 4) {
      let nbrOfMaxValue = 0
      for (let i = 0; i < arrayMod.length; i++) {
        if (arrayMod[i] === finalMod) nbrOfMaxValue++
      }
      if (nbrOfMaxValue > 1) finalMod++
    }

    if (finalMod > 4) finalMod = 4
    let dicePoolMod = SR5_ConverterHelpers.environmentalLineToMod(finalMod)
    return dicePoolMod
  }

  //Apply Full defense effect to an actor
  static async applyFullDefenseEffect(actor){
    let effect = await _getSRStatusEffect("fullDefense")
    actor.createEmbeddedDocuments("ActiveEffect", [effect])
  }

  //Handle grenade scatter
  static async rollScatter(cardData){
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId)
    let item = actor.items.find(i => i.id === cardData.owner.itemId)
    let itemData = item.system

    if (!canvas.scene) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoActiveScene")}`)

    let distanceMod = cardData.roll.hits
    let gridUnit = canvas.scene.grid.size
    
    let template = canvas.scene.templates.find((t) => t.flags.sr5.item === cardData.owner.itemId)
    if (template === undefined) return ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoTemplateInScene")}`)
    
    let distanceDice = 1
    if (itemData.aerodynamic) distanceDice = 2

    if (cardData.combat.ammo.effects?.scatterDice) {
      distanceDice = cardData.combat.ammo.effects.scatterDice
    } else if (itemData.ammunition.type){
      switch(itemData.ammunition.type){
        case "fragmentationRocket":
        case "highlyExplosiveRocket":
        case "antivehicleRocket":
          distanceDice = 5
          break
        case "fragmentationMissile":
        case "highlyExplosiveMissile":
        case "antivehicleMissile":
          distanceDice = 4
          break
      }
    }
        
    let directionRoll = new Roll(`1d8`)
    await directionRoll.evaluate()
    
    let distanceFormula = `${distanceDice}d6 - ${distanceMod}`
    let distanceRoll= new Roll(distanceFormula)
    await distanceRoll.evaluate()

    if (distanceRoll.total < 1) return ui.notifications.info(`${game.i18n.localize("SR5.INFO_NoScattering")}`)
    else ui.notifications.info(`${game.i18n.format("SR5.INFO_ScatterDistance", {
      distance: distanceRoll.total
    })}`)
        
    let coordinate = {
      x:0, y:0
    }
    switch(directionRoll.total){
      case 1:
        coordinate = {
          x: 0, 
          y: distanceRoll.total*gridUnit,
        }
        break
      case 2:
        coordinate = {
          x: -(distanceRoll.total*gridUnit)/2, 
          y: (distanceRoll.total*gridUnit)/2, 
        }
        break
      case 3:
        coordinate = {
          x: -distanceRoll.total*gridUnit, 
          y: 0,
        }
        break
      case 4:
        coordinate = {
          x: -(distanceRoll.total*gridUnit)/2, 
          y: -(distanceRoll.total*gridUnit)/2, 
        }
        break
      case 5:
        coordinate = {
          x: 0, 
          y: -distanceRoll.total*gridUnit,
        }
        break
      case 6:
        coordinate = {
          x: (distanceRoll.total*gridUnit)/2, 
          y: -(distanceRoll.total*gridUnit)/2, 
        }
        break
      case 7:
        coordinate = {
          x: distanceRoll.total*gridUnit, 
          y: 0,
        }
        break
      case 8:
        coordinate = {
          x: (distanceRoll.total*gridUnit)/2, 
          y: (distanceRoll.total*gridUnit)/2, 
        }
        break
    }
    
    let newPosition = foundry.utils.duplicate(template)
    newPosition.x += coordinate.x
    newPosition.y += coordinate.y
    
    template.update(newPosition)
  }

  static async chooseDamageType(){
    let dialogData = {
      list: SR5.PCConditionMonitors
    }
    const dlg = await foundry.applications.handlebars.renderTemplate("systems/sr5/templates/interface/chooseDamageType.hbs", dialogData)
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('SR5.ChooseDamageType') 
      },
      content: dlg,
      buttons: [
        {
          action: "ok",
          label: "Ok",
          default: true,
          callback: (event, button, dialog) => ({
            action: "ok", element: dialog.element 
          }),
        },
        {
          action: "cancel",
          label: "Cancel",
          callback: () => ({
            action: "cancel" 
          }),
        },
      ],
      rejectClose: false,
    })
    if (!result || result.action !== "ok") return
    return result.element.querySelector("[name=damageType]").value
  }

  static async chooseToxinVector(vectors){
    let dialogData = {
      list: vectors
    }
    const dlg = await foundry.applications.handlebars.renderTemplate("systems/sr5/templates/interface/chooseVector.hbs", dialogData)
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('SR5.ChooseToxinVector') 
      },
      content: dlg,
      buttons: [
        {
          action: "ok",
          label: "Ok",
          default: true,
          callback: (event, button, dialog) => ({
            action: "ok", element: dialog.element 
          }),
        },
        {
          action: "cancel",
          label: "Cancel",
          callback: () => ({
            action: "cancel" 
          }),
        },
      ],
      rejectClose: false,
    })
    if (!result || result.action !== "ok") return
    return result.element.querySelector("[name=vector]").value
  }

  static async getToxinEffect(effecType, info, actor){
    let itemEffects = []
    let toxinType = info.damage.toxin.type
    let hasEffect

    let effect = {
      name: game.i18n.localize(SR5.toxinTypes[toxinType]),
      type: "itemEffect",
    }

    switch (effecType){
      case "disorientation":
        hasEffect = actor.items.find(i => i.system.type === "toxinEffectDisorientation")
        if (!hasEffect){
          effect = foundry.utils.mergeObject(effect, {
            "system.target": game.i18n.localize("SR5.GlobalPenalty"),
            "system.type": "toxinEffectDisorientation",
            "system.value": -2,
            "system.duration": 10,
            "system.durationType": "minute",
            "system.customEffects": {
              "0": {
                "category": "penaltyTypes",
                "target": "system.penalties.special.actual",
                "type": "value",
                "value": -2,
                "forceAdd": true,
              }
            },
            "system.gameEffect": game.i18n.localize("SR5.ToxinEffectDisorientation_GE"),
          })
          itemEffects.push(effect)
        }
        break
      case "nausea":
        hasEffect = actor.items.find(i => i.system.type === "toxinEffectNausea")
        if (!hasEffect){
          effect = foundry.utils.mergeObject(effect, {
            "system.target": game.i18n.localize("SR5.PenaltyDouble"),
            "system.type": "toxinEffectNausea",
            "system.value": "x2",
            "system.duration": 10,
            "system.durationType": "minute",
            "system.customEffects": {
              "0": {
                "category": "specialProperties",
                "target": "system.specialProperties.doublePenalties",
                "type": "boolean",
                "value": "true",
                "forceAdd": true,
              }
            },
            "system.gameEffect": game.i18n.localize("SR5.ToxinEffectNausea_GE"),
          })
          itemEffects.push(effect)
        }
        break
      case "paralysis":
        hasEffect = actor.items.find(i => i.system.type === "toxinEffectParalysis")
        if (!hasEffect){
          effect = foundry.utils.mergeObject(effect, {
            "system.target": game.i18n.localize("SR5.GlobalPenalty"),
            "system.type": "toxinEffectParalysis",
            "system.value": -2,
            "system.duration": 1,
            "system.durationType": "hour",
            "system.customEffects": {
              "0": {
                "category": "penaltyTypes",
                "target": "system.penalties.special.actual",
                "type": "value",
                "value": -2,
                "forceAdd": true,
              }
            },
            "system.gameEffect": game.i18n.localize("SR5.ToxinEffectParalysis_GE"),
          })
          itemEffects.push(effect)
        }
        break
      case "agony":
        hasEffect = actor.items.find(i => i.system.type === "toxinEffectAgony")
        if (!hasEffect){
          effect = foundry.utils.mergeObject(effect, {
            "system.target": game.i18n.localize("SR5.GlobalPenalty"),
            "system.type": "toxinEffectAgony",
            "system.value": 1,
            "system.duration": 10,
            "system.durationType": "minute",
            "system.gameEffect": game.i18n.localize("SR5.ToxinEffectAgony_GE"),
          })
          itemEffects.push(effect)
        }
        break
      case "arcaneInhibitor": {
        let value = info.damage.base
        hasEffect = actor.items.find(i => i.system.type === "toxinEffectArcaneInhibitor")
        if (!hasEffect){
          effect = foundry.utils.mergeObject(effect, {
            "system.target": game.i18n.localize("SR5.Magic"),
            "system.type": "toxinEffectArcaneInhibitor", 
            "system.itemRating": value,                       
            "system.value": "",
            "system.duration": "",
            "system.durationType": "special",
            "system.customEffects": {
              "0": {
                "category": "characterSpecialAttributes",
                "target": "system.specialAttributes.magic.augmented",
                "type": "rating",
                "multiplier": -1,
                "forceAdd": true,
              }
            },
            "system.gameEffect": game.i18n.localize("SR5.ToxinEffectArcaneInhibitor_GE"),
          })
          itemEffects.push(effect)
        }
        break
      }
      default:
    }
    
    return itemEffects
  }

  //create sensor lock effect
  static async lockTarget(cardData, drone, target){
    let value = cardData.roll.hits - cardData.previousMessage.hits
    let effect = {
      name: game.i18n.localize("SR5.EffectSensorLock"),
      type: "itemEffect",
      "system.type": "sensorLock",
      "system.ownerID": drone.id,
      "system.ownerName": drone.name,
      "system.durationType": "permanent",
      "system.target": game.i18n.localize("SR5.Defense"),
      "system.value": value,
    }
    target.createEmbeddedDocuments("Item", [effect])
    let statusEffect = await _getSRStatusEffect("sensorLock")
    await target.createEmbeddedDocuments('ActiveEffect', [statusEffect])
  }
}