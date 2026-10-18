import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_Toxins
} from "../items/toxins.js"
import {
  SR5Combat
} from "../../system/srcombat.js"
import {
  SR5 
} from "../../config.js"
import {
  SR5_TOKEN_VISION_MODES, settleSensorVisions
} from "../../system/vision.js"
import {
  refuseByRule
} from "../../system/rule-locks.js"

// Vision: sensor, metatype, cybereyes and astral visions, and the tokens they apply to.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
export class SR5_CharacterVisionUtility {

  //The visions of a drone or a device are those of its sensors (SR5 p. 446-449)
  static handleSensorVision(actor) {
    settleSensorVisions(actor.system.visions)
  }

  //Handle vision types and environmental modifiers
  static async handleVision(actor) {
    let actorData = actor.system

    if (actor.type === "actorSpirit") {
      actorData.visions.astral.natural = true
      actorData.visions.astral.hasVision = true
      actorData.visions.astral.isActive = true
    }
    this.settleMetatypeVision(actor)
    //Astral initiative is astral sight: it was written on visions.augmented, a key nothing reads
    if (actorData.initiatives.astralInit.isActive) actorData.visions.astral.augmented = true
    if (actorData.visions.astral.natural || actorData.visions.astral.augmented) actorData.visions.astral.hasVision = true
    if (actorData.visions.astral.isActive) actorData.visions.astral.hasVision = true

    if (actorData.visions.astral.isActive) {
      SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.visibility, game.i18n.localize('SR5.AstralPerception'), "visionType", -4, false, false)
      SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.light, game.i18n.localize('SR5.AstralPerception'), "visionType", -4, false, false)
      SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.glare, game.i18n.localize('SR5.AstralPerception'), "visionType", -4, false, false)
      SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.wind, game.i18n.localize('SR5.AstralPerception'), "visionType", -4, false, false)
    }

    //Low-light vision takes no light row off : the roll treats partial and dim light as full light
    //for it (SR5 p. 177), and it is of no help in complete darkness (SR5 p. 447). Two rows taken off
    //here as well turned total darkness into partial light.
    if (actorData.visions.lowLight.natural || actorData.visions.lowLight.augmented) {
      actorData.visions.lowLight.hasVision = true
    }
    if (actorData.visions.thermographic.natural || actorData.visions.thermographic.augmented) {
      actorData.visions.thermographic.hasVision = true
      if (actorData.visions.thermographic.isActive) {
        SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.light, game.i18n.localize('SR5.ThermographicVision'), "visionType", -1, false, false)
        SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.visibility, game.i18n.localize('SR5.ThermographicVision'), "visionType", -1, false, false)
      }
    }
    if (actorData.visions.ultrasound.natural || actorData.visions.ultrasound.augmented) {
      actorData.visions.ultrasound.hasVision = true
      if (actorData.visions.ultrasound.isActive) {
        SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.visibility, `${game.i18n.localize('SR5.UltrasoundVision')}`, "visionType", -1, false, false)
        SR5_EntityHelpers.updateModifier(actorData.itemsProperties.environmentalMod.light, `${game.i18n.localize('SR5.UltrasoundVision')}`, "visionType", -3, false, false)
      }
    }
    //A vision the character has lost (cybereyes put in, goggles taken off) is no longer in use,
    //even if it was pinned : the dice read isActive, and the token and the pins must agree with them.
    //The stored pin is kept, so the vision comes back in use if the character gets it back.
    for (let key of ["lowLight", "thermographic", "ultrasound"]) {
      if (!actorData.visions[key].hasVision) actorData.visions[key].isActive = false
    }
    actorData.visions.hasActiveVision = Object.keys(SR5.visionActive).some(key => actorData.visions[key].isActive)

    //environmental modifiers
    if (actorData.itemsProperties?.environmentalMod) {
      for (let key of Object.keys(SR5.environmentalModifiers)) {
        SR5_EntityHelpers.updateValue(actorData.itemsProperties.environmentalMod[key])
      }
    }

    //martial arts modifiers
    if (actorData.itemsProperties?.martialArts) {
      for (let key of Object.keys(SR5.calledShotsMartialArts)) {
        if (actorData.itemsProperties.martialArts[key].modifier) {
          SR5_EntityHelpers.updateValue(actorData.itemsProperties.martialArts[key].modifier)
        }
      }
    }

    //called shots eased by any item
    if (actorData.itemsProperties?.calledShots) {
      for (let key of Object.keys(SR5.calledShotsItems)) {
        if (actorData.itemsProperties.calledShots[key]?.modifier) SR5_EntityHelpers.updateValue(actorData.itemsProperties.calledShots[key].modifier)
      }
    }
  }

  //Every token that shows this actor : a synthetic actor has its own token, a linked actor has
  //every linked token on every scene. A find on canvas.scene served the first token of the
  //viewed scene only, and left the others blind.
  static getTokensOfActor(actor) {
    if (actor.token) return [actor.token]
    return Array.from(game.scenes ?? []).flatMap((s) => s.tokens.filter((t) => t.actorId === actor.id && t.actorLink))
  }

  //Give the tokens the vision their actor is currently using
  static async applyVisionToToken(actor) {
    for (let token of this.getTokensOfActor(actor)) {
      const tokenData = await SR5_EntityHelpers.getVisionData(foundry.utils.duplicate(token), actor, token.parent)
      await token.update(tokenData)
    }
  }

  //Serve the tokens again when the vision in use changed under them, without a pin being touched :
  //cybereyes that take the pinned vision away, or give it back. Only called by the user who made
  //the change, and a token already in the right mode is left alone.
  static async refreshVisionOfTokens(actor) {
    //A drone or a device sees with its sensors: a sensor item added or removed changes its token too
    if (!["actorPc", "actorGrunt", "actorDrone", "actorDevice"].includes(actor?.type)) return
    const mode = SR5_TOKEN_VISION_MODES[SR5_EntityHelpers.getActiveVisionType(actor)] ?? "basic"
    if (this.getTokensOfActor(actor).every(t => t.sight?.visionMode === mode)) return
    await this.applyVisionToToken(actor)
  }

  //Handle astral vision
  static async handleAstralVision(actor) {
    let actorData = actor.system

    if (actorData.visions.astral.isActive) {
      await SR5_EntityHelpers.addEffectToActor(actor, "astralVision")
      //No early return on the vision mode alone : getVisionData also settles the range, the
      //colour, the look and the detection modes, so a token whose document already carried
      //'astralvision' kept a range of 0 and no astral detection mode. An update that changes
      //nothing costs nothing.
    } else await SR5_EntityHelpers.deleteEffectOnActor(actor, "astralVision")
    await this.applyVisionToToken(actor)
  }

  static async switchVision(actor, vision) {
    let actorData = foundry.utils.duplicate(actor.system),
      currentVision

    for (let key of Object.keys(SR5.visionActive)) {
      if (actorData.visions[key].isActive) currentVision = key
    }
    //Better Than Bad p. 141: cut from the manasphere by Blight, no astral perception (decision of DjamZ); leaving it stays free
    //The "magic" rule lock lifted (B13), the switch goes and the gamemaster hears of it
    if (vision === "astral" && currentVision !== "astral" && SR5_Toxins.blightBlocksAstral(actor) && refuseByRule("magic", "SR5.WARN_BlightNoSpell", null, {
      actor
    })) return
    if ((vision === "astral" || currentVision === "astral") && !SR5Combat.hasActionsLeft(actor, [{
      type: "simple", value: 1, source: "switchPerception"
    }])) return

    for (let key of Object.keys(SR5.visionActive)) {
      if (key === vision && key === currentVision) actorData.visions[key].isActive = false
      else if (key === vision) actorData.visions[key].isActive = true
      else actorData.visions[key].isActive = false
    }

    await actor.update({
      'system': actorData 
    })
    if (vision === "astral" || currentVision === "astral") {
      if (actor.isToken) SR5Combat.changeActionInCombat(actor.token.id, [{
        type: "simple", value: 1, source: "switchPerception" 
      }])
      else SR5Combat.changeActionInCombat(actor.id, [{
        type: "simple", value: 1, source: "switchPerception" 
      }])
      this.handleAstralVision(actor)
    } else await this.applyVisionToToken(actor)
  }

  //Return the cybereyes the character wears, if any. Cybereyes are the only eyeware that
  //holds a Capacity : everything else in that category plugs into them (SR5 p. 456). The pin
  //of an implant says it is worn : unpinned eyes took the vision away without their effects.
  static getCyberEyes(actor) {
    return actor.items?.find(i => i.type === "itemAugmentation" &&
      i.system.isActive &&
      i.system.category === "eyeware" &&
      !i.system.isAccessory &&
      Number(i.system.capacity?.base ?? 0) > 0) ?? null
  }

  //Grant a vision the character owes to its metatype. Cybereyes take it away : it has to be bought
  //again as an enhancement of the eyes (SR5 p. 96). A world setting, on by default, lets a table
  //keep it anyway.
  static grantMetatypeVision(actor, vision) {
    let actorData = actor.system
    const cyberEyes = actorData.visions?.cyberEyes
    if (cyberEyes?.hasCyberEyes && game.settings.get("sr5", "sr5CyberEyesReplaceNaturalVision")) {
      if (!cyberEyes.replacedNaturalVision.includes(vision)) cyberEyes.replacedNaturalVision.push(vision)
      return
    }
    actorData.visions[vision].natural = true
  }

  //The cybereyes of the companion compendiums carry their own effects that switch every natural
  //vision off, and item effects are applied after the metatype. Left alone, they overrule the
  //world setting : unticked, the elf still lost its low-light vision. What becomes of the vision
  //of the metatype under cybereyes is the setting's call, so it is settled again here.
  static settleMetatypeVision(actor) {
    const visions = actor.system?.visions
    if (!visions?.cyberEyes?.hasCyberEyes) return
    const vision = {
      elf: "lowLight", ork: "lowLight", dwarf: "thermographic", troll: "thermographic"
    }[this.getMetatype(actor)]
    if (!vision) return
    visions[vision].natural = !visions.cyberEyes.replacedNaturalVision.includes(vision)
  }
}
