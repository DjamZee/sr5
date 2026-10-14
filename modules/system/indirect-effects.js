// Indirect effects on the canvas: who is targeted, which auras reach the roller (roll-helpers/indirect.js
// holds the rules, this file only reads Foundry)
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  SR5
} from "../config.js"
import {
  rollKinds, gatherIndirectOffers, applyOffer
} from "../rolls/roll-helpers/indirect.js"
import {
  illusionOffer
} from "./illusion.js"
import {
  tacnetOfferFor
} from "./tacnet.js"
import {
  maneuverOffersFor
} from "./combat-maneuvers.js"
import {
  swarmOffersFor
} from "./swarm.js"
import {
  targetDeviceBonus, targetDeviceOffer
} from "../rolls/roll-helpers/electronic-warfare.js"

export const INDIRECT_DISPLAY_SETTING = "sr5IndirectEffectDisplay"

// What the roller sees of an effect another actor carries. The books never hide it: shown by default
export function registerIndirectEffectSetting() {
  game.settings.register("sr5", INDIRECT_DISPLAY_SETTING, {
    name: "SR5.SETTINGS_IndirectDisplay_T",
    hint: "SR5.SETTINGS_IndirectDisplay_D",
    scope: "world",
    config: true,
    type: String,
    default: "name",
    choices: {
      name: "SR5.SETTINGS_IndirectDisplayName",
      neutral: "SR5.SETTINGS_IndirectDisplayNeutral",
      hidden: "SR5.SETTINGS_IndirectDisplayHidden",
    },
  })
}

// The slaves of a rigger's PAN: the uuids its active master devices hold (pan-graph.js)
function masterContentOf(riggerId){
  const rigger = game.actors?.get(riggerId) ?? game.scenes?.viewed?.tokens?.get(riggerId)?.actor
  if (!rigger) return []
  return rigger.items.filter(i => i.type === "itemDevice" && i.system.isActive).flatMap(i => (Array.isArray(i.system.pan?.content) ? i.system.pan.content : []).map(e => e?.uuid))
}

function targetDeviceOfferFor(rollData, actor, targetActor){
  if (!actor || !targetActor || targetActor === actor) return null
  const bonus = targetDeviceBonus(targetActor.items, actor, {
    weaponUuid: rollData.owner?.itemUuid, masterContentOf
  })
  return targetDeviceOffer(bonus, game.i18n.format("SR5.TargetDeviceBonus", {
    name: bonus?.ownerName ?? ""
  }))
}

function rollerToken(actor){
  if (!actor) return null
  if (actor.isToken) return actor.token?.object ?? null
  return actor.getActiveTokens?.()[0] ?? null
}

// Adds to a prepared roll the boxes of the effects carried by its target and by the auras around the roller,
// already ticked and already counted in the pool or the limit
export function addIndirectEffects(rollData, actor){
  const kinds = rollKinds(rollData.test, SR5.socialSkills)
  // A device targeted as an item of its owner (a commlink) is not its owner: the persona's effects stay out
  const targetToken = game.user.targets.first?.() ?? Array.from(game.user.targets)[0]
  let target = null
  if (targetToken?.actor && targetToken.actor !== actor && !rollData.target?.itemUuid){
    target = {
      name: targetToken.name, effects: targetToken.actor.indirectEffects, playerOwned: !!targetToken.actor.hasPlayerOwner
    }
  }
  const roller = rollerToken(actor)
  let auras = []
  if (roller && globalThis.canvas?.tokens){
    const meters = SR5_SystemHelpers.getSceneUnitInMeters()
    for (let t of canvas.tokens.placeables){
      if (!t.actor?.indirectEffects?.length) continue
      const isBearer = t === roller || t.actor === actor
      auras.push({
        key: t.actor.uuid, playerOwned: !!t.actor.hasPlayerOwner, name: t.name, effects: t.actor.indirectEffects, isBearer, disposition: t.document.disposition,
        // The documents' positions, not the placeables': a token still sliding to its new place is already there
        distance: isBearer ? 0 : SR5_SystemHelpers.getDistanceBetweenTwoPoint(roller.document.getCenterPoint(), t.document.getCenterPoint()) * meters,
      })
    }
  }
  const offers = gatherIndirectOffers({
    kinds, target, auras, rollerDisposition: roller?.document?.disposition,
    display: game.settings.get("sr5", INDIRECT_DISPLAY_SETTING),
    labels: {
      targeter: game.i18n.localize("SR5.IndirectTargeterShort"), aura: game.i18n.localize("SR5.IndirectAuraShort"),
      neutral: game.i18n.localize("SR5.IndirectNeutral"),
    },
  })
  //Invisibility the roller has not seen through (SR5 p. 294), the RP-Tac network he is a member of (Run & Gun p. 119)
  const blindFire = illusionOffer(kinds, actor, target ? targetToken.actor : null, targetToken?.name)
  if (blindFire) offers.push(blindFire)
  const tacnet = tacnetOfferFor(rollData, actor)
  if (tacnet) offers.push(tacnet)
  //The combat maneuver he takes part in: its bonus, or his penalty out of place (Run & Gun p. 113)
  offers.push(...maneuverOffersFor(rollData, actor))
  //A swarm's action: the number of drones minus one, to the pool and the limit (Rigger 5.0 p. 35)
  offers.push(...swarmOffersFor(rollData, actor))
  //A device a rigger tracks for his slaved attackers (Rigger 5.0 p. 34)
  const tracked = kinds.has("attack") ? targetDeviceOfferFor(rollData, actor, targetToken?.actor) : null
  if (tracked) offers.push(tracked)
  //An unticked box (a situational effect) is counted only once ticked in the dialog
  for (let offer of offers) if (offer.checked !== false) applyOffer(rollData, offer)
  rollData.situational = (rollData.situational || []).concat(offers)
}
