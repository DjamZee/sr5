import {
  SR5_Toxins
} from "../entities/items/toxins.js"
import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"
import {
  SR5_CharacterUtility
} from "../entities/actors/utilityActor.js"

// Better Than Bad p. 141: Blight cuts an Awakened from the manasphere, "sous quelque forme que ce soit" (decision of
// DjamZ after Victoire's review of séance H). When it strikes, what was running falls: sustained spells, active foci,
// astral perception and projection. Written by the active gamemaster. When it ends nothing comes back by itself: the
// player switches the foci on again.

// What Blight switches off on the actor: the item updates, the sustained effects to delete, the astral update
export function blightDrops(actor) {
  const items = [], sustained = [], spells = [], names = []
  for (const i of actor?.items ?? []) {
    if (!i.system?.isActive) continue
    if (i.type === "itemFocus") items.push({
      _id: i.id, "system.isActive": false
    })
    else if (i.type === "itemSpell") {
      sustained.push(...(i.system.targetOfEffect ?? []))
      spells.push(i.uuid)
      items.push({
        _id: i.id, "system.isActive": false, "system.targetOfEffect": []
      })
    }
    else continue
    names.push(i.name)
  }
  const astral = {
  }
  if (SR5_Toxins.blightBlocksAstral(actor)) {
    if (actor.system?.visions?.astral?.isActive) astral["system.visions.astral.isActive"] = false
    if (actor.system?.initiatives?.astralInit?.isActive) {
      astral["system.initiatives.astralInit.isActive"] = false
      astral["system.initiatives.physicalInit.isActive"] = true
    }
  }
  return {
    items, sustained, spells, astral, names
  }
}

// The templates a sustained area spell left on the scenes: they carry the spell's uuid (flags.sr5.itemUuid), as the
// sheet finds them when the spell is switched off there (Victoire's review)
export function spellTemplates(spellUuids, scenes = game.scenes) {
  const found = []
  for (const scene of scenes ?? []) {
    for (const t of scene.templates ?? []) if (spellUuids.includes(t.flags?.sr5?.itemUuid)) found.push(t)
  }
  return found
}

export async function blightStrikes(actor) {
  if (!game.users?.activeGM?.isSelf || !actor) return
  const {
    items, sustained, spells, astral, names
  } = blightDrops(actor)
  for (const uuid of sustained) await SR5_ActorHelper.deleteSustainedEffect(uuid)
  if (items.length) await actor.updateEmbeddedDocuments("Item", items)
  if (Object.keys(astral).length) {
    //Read before the update: Foundry rewrites the object it is given (measured 06/10, the key was gone afterwards)
    const leavesProjection = astral["system.initiatives.astralInit.isActive"] === false
    await actor.update(astral)
    //Out of astral projection: the status of the astral initiative goes too, as switchToInitiative does it for the
    //physical initiative (no action spent), or the body stays hidden to ordinary sight (Victoire's review)
    if (leavesProjection) {
      const status = actor.effects?.filter(e => e.origin === "initiativeMode").map(e => e.id) ?? []
      if (status.length) await actor.deleteEmbeddedDocuments("ActiveEffect", status)
    }
    names.push(game.i18n.localize("SR5.AstralPerception"))
    await SR5_CharacterUtility.handleAstralVision(actor)
  }
  //Last, and alone: a template deleted with no canvas drawn throws in the core after the deletion (measured 06/10)
  for (const t of spellTemplates(spells)) {
    try {
      await t.delete()
    }
    catch (e) {
      console.warn("SR5 | Blight: template", e)
    }
  }
  if (names.length) ui.notifications.info(game.i18n.format("SR5.INFO_BlightDrops", {
    actor: actor.name, list: names.join(", ")
  }))
}

// The Blight effect is laid on the actor, by whichever client: the active gamemaster switches off what was running
export function onBlightCreated(item) {
  if (item?.type !== "itemEffect" || item.system?.type !== "toxinEffectManasphereCut" || !(item.parent instanceof Actor)) return
  blightStrikes(item.parent).catch(e => console.error("SR5 | Blight", e))
}
