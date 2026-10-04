import {
  SR5
} from "../config.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_CharacterUtility
} from "../entities/actors/utilityActor.js"
import {
  SR5_GrappleHelpers
} from "../rolls/roll-helpers/grapple.js"
export function sr5HookCanvasInit() {
  // Extend Diagonal Measurement
  //SquareGrid.prototype.measureDistances = measureDistances;
}

export function sr5HookDeleteCombatCumulativeDefense(combat) {
  if ( !game.user.isGM ) return
  for (let combatant of combat.combatants){
    let actor
    if (!combatant.actor.isToken) actor = SR5_EntityHelpers.getRealActorFromID(combatant.actorId)
    else actor = SR5_EntityHelpers.getRealActorFromID(combatant.tokenId)
    actor.unsetFlag("sr5", "cumulativeDefense")
    actor.unsetFlag("sr5", "cumulativeRecoil")
  }
}

//The end of the combat ends every hold among its fighters (grappling rules only)
export async function sr5HookDeleteCombatGrapple(combat) {
  if (!SR5_GrappleHelpers.isActive() || !SR5_GrappleHelpers.isKeeper()) return
  const actors = combat.combatants.map(c => SR5_EntityHelpers.getRealActorFromID(c.actor?.isToken ? c.tokenId : c.actorId))
  await SR5_GrappleHelpers.releaseActors(actors)
}

export async function sr5HookCreateCombatant(combatant) {
  if (game.user.isGM){
    let key = SR5_CharacterUtility.findActiveInitiative(combatant.actor.system)
    let actor
    if (!combatant.actor.isToken) actor = SR5_EntityHelpers.getRealActorFromID(combatant.actorId)
    else actor = SR5_EntityHelpers.getRealActorFromID(combatant.tokenId)

    actor.update({
      "flags.sr5.cumulativeDefense": 0,
      "flags.sr5.cumulativeRecoil": 0,
      "system.specialProperties.actions.free.current": actor.system.specialProperties.actions.free.value,
      "system.specialProperties.actions.simple.current": actor.system.specialProperties.actions.simple.value,
      "system.specialProperties.actions.complex.current": actor.system.specialProperties.actions.complex.value,
    })

    await combatant.update({
      "flags.sr5.seizeInitiative" : false,
      "flags.sr5.blitz" : false,
      "flags.sr5.hasPlayed" : combatant.isDefeated,
      "flags.sr5.cumulativeDefense" : 0,
      "flags.sr5.currentInitRating" : combatant.actor.system.initiatives[key].value,
      "flags.sr5.currentInitDice" : combatant.actor.system.initiatives[key].dice.value,
      "flags.sr5.actions.free": actor.system.specialProperties.actions.free.value,
      "flags.sr5.actions.simple": actor.system.specialProperties.actions.simple.value,
      "flags.sr5.actions.complex": actor.system.specialProperties.actions.complex.value,
    })
  }
}

export function sr5HookUpdateCombatant(combatant) {
  if (combatant.isDefeated && !combatant.flags.sr5.hasPlayed) combatant.update({
    "flags.sr5.hasPlayed": true
  })
}

export async function sr5HookDeleteCombatActions(combat) {
  if (game.user.isGM){
    //Reset actions to default values
    let actor
    for (let combatant of combat.combatants){
      if (!combatant.actor.isToken) actor = SR5_EntityHelpers.getRealActorFromID(combatant.actorId)
      else actor = SR5_EntityHelpers.getRealActorFromID(combatant.tokenId)

      //The prepared value carries the extra actions granted by effects: a copy of system would hold the stored one
      let actionsUpdate = {
      }
      for (let key of Object.keys(SR5.actionTypes)) {
        if (actor.system.specialProperties.actions[key]) {
          actionsUpdate[`system.specialProperties.actions.${key}.current`] = actor.system.specialProperties.actions[key].value
        }
      }
      await actor.update(actionsUpdate)
    }
  }
}

export function sr5HookCloseCombatantConfig(combatant) {
  combatant.document.update({
    "flags.sr5.baseCombatantInitiative": combatant.document.initiative
  })
}
