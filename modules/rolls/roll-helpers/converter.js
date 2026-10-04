import {
  SR5_BARRIER_RATINGS
} from "../../config.js"

export class SR5_ConverterHelpers {

  //Convert firing mode choice to  number of bullets
  static firingModeToBullet(mode){
    switch(mode){
      case "SS":
      case "SA":
        return 1
      case "SB":
      case "BF":
        return 3
      case "LB":
      case "FA":
        return 6
      case "FAc":
        return 10
      case "SF":
        return 20
      default: return 0
    }
  }

  //Convert firing mode choice to  number of bullets
  static firingModeToDefenseMod(mode){
    switch(mode){
      case "SS":
      case "SA":
        return 0
      case "SB":
      case "BF":
        return -2
      case "LB":
      case "FA":
        return -5
      case "FAc":
        return -9
      case "SF":
        return 0
      default: return 0
    }
  }

  //Resolve the firing mode code (SS, SA, BF, FA...) to preselect for a ranged weapon.
  //firingMode.value holds translated abbreviations for display ("CC", "TR", "TA" in French),
  //and rolls made before this fix saved such an abbreviation in firingMode.current.
  static firingModeToCode(firingMode, localize = key => game.i18n.localize(key)){
    const baseModes = {
      singleShot: "SS", semiAutomatic: "SA", burstFire: "BF", fullyAutomatic: "FA",
    }
    const enabled = Object.entries(baseModes).filter(([key]) => firingMode[key]).map(([, code]) => code)
    const current = firingMode.current
    if (current && this.firingModeToAction(current)) return current
    if (current) {
      const code = enabled.find(c => localize(`SR5.WeaponMode${c}Short`) === current)
      if (code) return code
    }
    return enabled[0]
  }

  //Action spent (1) or given back (-1) when the roll dialog changes the firing mode, 0 otherwise.
  //The weapon's saved mode is read through firingModeToCode, like the dialog's preselection:
  //an empty or translated firingMode.current must count as the mode the dialog opened on.
  static firingModeChangeCost(firingMode, selected, actionSpent, localize){
    const current = this.firingModeToCode(firingMode, localize)
    if (current !== selected && !actionSpent) return 1
    if (current === selected && actionSpent) return -1
    return 0
  }

  //Conver firing mode choice to action type
  static firingModeToAction(mode){
    switch(mode){
      case "SS":
      case "SA":
      case "BF":
      case "FA":
        return {
          type: "simple", value: 1, source: "attack"
        }
      case "SB":
      case "LB":
      case "FAc":
      case "SF":
        return {
          type: "complex", value: 1, source: "attack"
        }
      default: 
    }
  }      

  //SR5 p. 166-167: firing a bow or throwing a weapon is a simple action. A weapon with no firing mode
  //never shows the dialog's firing mode select, which counts the action of the others
  static rangedAttackAction(mode){
    return this.firingModeToAction(mode) ?? {
      type: "simple", value: 1, source: "attack"
    }
  }

  //SR5 p. 182 gives no default spread: an unset choke is the narrow spread the weapon sheet shows for it
  static chokeToCode(choke){
    return choke?.current || "narrow"
  }

  //Convert range  to environmental line
  static rangeToEnvironmentalLine(mode){
    switch(mode){
      case "short":
        return 0
      case "medium":
        return 1
      case "long":
        return 2
      case "extreme":
        return 3
      default: return 0
    }
  }

  //Convert active defense mode to dice mod value
  static activeDefenseToMod(defenseMode, defenseValue){
    switch(defenseMode){
      case "dodge": 
        return defenseValue.dodge
      case "block":
        return defenseValue.block
      case "parryClubs":
        return defenseValue.parryClubs
      case "parryBlades":
        return defenseValue.parryBlades
      default: 
        return 0
    }
  }

  //Convert active defense mode to initiative modifier value
  static activeDefenseToInitMod(defenseMode){
    switch(defenseMode){
      case "dodge": 
      case "block":
      case "parryClubs":
      case "parryBlades":
        return -5
      default: 
        return 0
    }
  }

  //convert matrix distance to dice mod
  //Noise by distance (SR5 p. 232), as in the VO: 0 up to 100 m, 1 up to 1 km. The VF prints 0 for 101 m-1 km,
  //and its errata ("jusqu'a 100 metres : 1") aims at that misprint, not at the 100 m row (DjamZ, 2026-10-04)
  static matrixDistanceToMod(distance){
    switch (distance){
      case "wired":
      case "upTo100m":
        return 0
      case "upTo1km":
        return -1
      case "upTo10km":
        return -3
      case "upTo100km":
        return -5
      case "farAway":
        return -8
    }
  }

  //convert matrix search info to interval multiplier for an extended test
  static matrixSearchTypeToTime(type){
    switch (type){
      case "general":
        return 1
      case "limited":
        return 30
      case "hidden":
        return 12
      default: return 1
    }
  }

  //convert matrix search info to interval multiplier for an extended test
  static matrixSearchTypeToUnitTime(type){
    switch (type){
      case "general":
      case "limited":
        return "minute"
      case "hidden":
        return "hour"
      default: return "minute"
    }
  }

  //Convert environmental modifier to dice pool modifier
  static environmentalLineToMod(modifier){
    switch (modifier){
      case 0:
        return 0
      case 1:
        return -1
      case 2:
        return -3
      case 3:
        return -6
      case 4:
        return -10
      default:
        return 0
    }
  }

  //Get signature modifier
  static signatureToMod(signature){
    switch (signature){
      case "vehicleLarge":
        return 3
      case "vehicleElectric":
        return -3
      case "metahuman":
        return -3
      case "drone":
        return -3
      case "droneMicro":
        return -6
      default:
        return 0
    }
  }

  static healingConditionToMod(condition){
    switch (condition){
      case "good":
        return 0
      case "average":
        return -1
      case "poor":
        return -2
      case "bad":
        return -3
      case "terrible":
        return -4
      default: return 0
    }
  }

  static restraintTypeToThreshold(type){
    switch (type){
      case "rope":
        return 2
      case "metal":
        return 3
      case "straitjacket":
        return 4
      case "containment":
        return 5
      default: return 2
    }
  }

  static perceptionTypeToThreshold(type){
    switch (type){
      case "opposed":
        return 0
      case "obvious":
        return 1
      case "normal":
        return 2
      case "obscured":
        return 3
      case "hidden":
        return 4
      default: return 0
    }
  }

  static weatherConditionToMod(type){
    switch (type){
      case "poor":
        return -1
      case "terrible":
        return -2
      case "extreme":
        return -4
      default: return 0
    }
  }

  static survivalTypeToThreshold(type){
    switch (type){
      case "mild":
        return 1
      case "moderate":
        return 2
      case "tough":
        return 3
      case "extreme":
        return 4
      default: return 0
    }
  }

  static socialAttitudeToMod(type){
    switch (type){
      case "friendly":
        return 2
      case "neutral":
        return 0
      case "suspicious":
        return -1
      case "prejudiced":
        return -2
      case "hostile":
        return -3
      case "enemy":
        return -4
      default: return 0
    }
  }

  static socialResultToMod(type){
    switch (type){
      case "advantageous":
        return 1
      case "ofNoValue":
        return 0
      case "annoying":
        return -1
      case "harmful":
        return -3
      case "disastrous":
        return -4
      default: return 0
    }
  }

  static workingConditionToMod(type){
    switch (type){
      case "distracting":
        return -1
      case "poor":
        return -2
      case "bad":
        return -3
      case "terrible":
        return -4
      case "superior":
        return 1
      default: return 0
    }
  }

  static toolsAndPartsToMod(type){
    switch (type){
      case "inadequate":
        return -2
      case "unavailable":
        return -4
      case "superior":
        return 1
      default: return 0
    }
  }

  static plansMaterialToMod(type){
    switch (type){
      case "available":
        return 1
      case "augmented":
        return 2
      default: return 0
    }
  }

  static coverToMod(type){
    switch (type){
      case "none":
        return 0
      case "partial":
        return 2
      case "full":
        return 4
      default: return 0
    }
  }

  static markToMod(type){
    switch (type){
      case "1":
        return 0
      case "2":
        return -4
      case "3":
        return -10
      default: return 0
    }
  }

  static triggerToMod(type){
    switch (type){
      case "command":
      case "time":
        return 2
      case "contact":
        return 1
      default: return 0
    }
  }

  static searchTypeToThreshold(type){
    switch (type){
      case "general":
        return 1
      case "limited":
        return 3
      case "hidden":
        return 6
      default: return 0
    }
  }

  //Collision damage table (Rigger 5 p. 179, update of SR5 p. 203): damage value from the initiator's Structure and the speed of the impact
  static collisionDamage(structure, speed){
    if (speed <= 0) return 0
    if (speed <= 2) return Math.ceil(structure/2)
    if (speed <= 4) return structure
    if (speed <= 6) return structure*2
    if (speed <= 8) return structure*3
    if (speed <= 10) return structure*5
    return structure*10
  }

  //Speed of the impact, depending on its angle (Rigger 5 p. 179): speed difference from the rear, initiator's speed on the side, sum of both head-on
  static rammingSpeed(angle, attackerSpeed, targetSpeed){
    switch(angle){
      case "rear":
        return Math.abs(attackerSpeed - targetSpeed)
      case "front":
        return attackerSpeed + targetSpeed
      default:
        return attackerSpeed
    }
  }

  //Damage taken by the initiator (Rigger 5 p. 179): half the attack's damage (rounded up) from the rear or the side, all of it head-on
  static rammingInitiatorDamage(damageValue, angle){
    if (angle === "front") return damageValue
    return Math.ceil(damageValue/2)
  }

  //Collision damage table in m/turn (SR5 p. 203): damage value from a Structure (or Body) and the relative speed
  static collisionDamageMeters(structure, metersPerTurn){
    if (metersPerTurn <= 0) return 0
    if (metersPerTurn <= 10) return Math.ceil(structure/2)
    if (metersPerTurn <= 50) return structure
    if (metersPerTurn <= 200) return structure*2
    if (metersPerTurn <= 300) return structure*3
    if (metersPerTurn <= 500) return structure*5
    return structure*10
  }

  //Vehicle movement rates (SR5 p. 203): 5 m walking and 10 m running at Speed 1, doubled at each Speed point
  static vehicleMetersPerTurn(speed, gait){
    if (!(speed > 0)) return 0
    return (gait === "run" ? 10 : 5) * 2**(speed - 1)
  }

  //Speed multiplier by locomotion (Rigger 5 p. 184). Rigger 5 p. 179 says x3 for "an aircraft": DjamZ chose the jet's x4 of p. 184.
  //Vector thrust x3 and airship x1 are not in the book: DjamZ's ruling (2026-10-04)
  static rammingLocomotionMultiplier(locomotion){
    switch(locomotion){
      case "naval": return 0.8
      case "rotor":
      case "vectorThrust": return 3
      case "jet": return 4
      default: return 1
    }
  }

  //Speed used for a collision (Rigger 5 p. 184). The book does not round x0.8: nearest, at least 1 when moving (DjamZ's ruling, 2026-10-04)
  static rammingEffectiveSpeed(speed, locomotion){
    if (!(speed > 0)) return 0
    return Math.max(1, Math.round(speed * this.rammingLocomotionMultiplier(locomotion)))
  }

  //What tells a vehicle's locomotion. The category is read on the vehicle's original item (creatorId, creatorItemId):
  //vehicleOwner.items follows the controller and is replaced or emptied when it changes
  static rammingLocomotionData(system, findItem){
    let item = (system.creatorId && system.creatorItemId) ? findItem(system.creatorId, system.creatorItemId) : null
    return {
      category: item?.system?.category,
      secondaryActive: system.isSecondaryPropulsionActivate,
      secondaryType: system.secondaryPropulsionType,
    }
  }

  //Locomotion of a vehicle, for the speed multiplier: active secondary propulsion, then category; ground (x1) when unknown, the safest
  static rammingLocomotion({
    category, secondaryActive, secondaryType
  } = {
  }){
    if (secondaryActive && secondaryType){
      if (secondaryType === "rotor") return "rotor"
      if (secondaryType.startsWith("amphibious")) return "naval"
      return "ground"
    }
    switch(category){
      case "boat":
      case "submarine": return "naval"
      case "rotorCraft": return "rotor"
      case "vectorThrustCraft": return "vectorThrust"
      case "fixedWingAircraft": return "jet"
      case "lta": return "lta"
      default: return "ground"
    }
  }

  //Relative speed in m/turn from the attacker's Speed and gait (SR5 p. 203), kept in step in both modes:
  //the defender's type, known only at defense, picks the table
  static rammingRefreshRelativeSpeed(ramming){
    ramming.relativeSpeed = this.vehicleMetersPerTurn(ramming.attackerSpeed || 0, ramming.gait)
    return ramming
  }

  //Speed of the impact: Rigger 5 p. 179 (Speed and angle) against a vehicle, SR5 p. 204 (m/turn) otherwise.
  //A card older than the relative speed has none: rebuilt from its speeds; only an explicit 0 means no impact
  static rammingImpactSpeed(ramming, targetIsVehicle = ramming.targetIsVehicle){
    if (!targetIsVehicle){
      if (ramming.relativeSpeed == null) return this.vehicleMetersPerTurn(this.rammingSpeed(ramming.angle, ramming.attackerSpeed || 0, ramming.targetSpeed || 0), ramming.gait)
      return Math.max(0, ramming.relativeSpeed)
    }
    return this.rammingSpeed(ramming.angle, this.rammingEffectiveSpeed(ramming.attackerSpeed || 0, ramming.attackerLocomotion), this.rammingEffectiveSpeed(ramming.targetSpeed || 0, ramming.targetLocomotion))
  }

  //Base damage value of a ramming attack, from the initiator's Structure
  static rammingAttackDamage(ramming, structure){
    let speed = this.rammingImpactSpeed(ramming)
    return ramming.targetIsVehicle ? this.collisionDamage(structure, speed) : this.collisionDamageMeters(structure, speed)
  }

  //Damage dealt to the target and to the initiator once the attack hits; the defender's actual type picks the table.
  //No relative speed, no damage, net hits included (DjamZ, 2026-10-04)
  static rammingDefenseDamages(ramming, {
    defenderIsVehicle, defenderBody, damageBase, netHits
  }){
    let speed = this.rammingImpactSpeed(ramming, defenderIsVehicle)
    if (speed <= 0) return {
      target: 0, initiator: 0
    }
    let target = damageBase + netHits
    //Rigger 5 p. 179 between two vehicles; SR5 p. 204 otherwise: the target's Body, halved (rounded up)
    let initiator = defenderIsVehicle ? this.rammingInitiatorDamage(target, ramming.angle) : Math.ceil(this.collisionDamageMeters(defenderBody, speed)/2)
    return {
      target, initiator
    }
  }

  // SR5 p. 198; an unknown material falls back on a heavy one, as before
  static barrierTypeToStructure(barrierType){
    return (SR5_BARRIER_RATINGS[barrierType] ?? SR5_BARRIER_RATINGS.heavy).structure
  }

  static barrierTypeToArmor(barrierType){
    return (SR5_BARRIER_RATINGS[barrierType] ?? SR5_BARRIER_RATINGS.heavy).armor
  }
}