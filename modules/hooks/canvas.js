import {
  SR5_EffectArea
} from "../system/effectArea.js"
import {
  SR5_Jammer
} from "../system/jammer.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"

export function sr5HookCanvasReady(data) {
  for (let token of data.tokens.placeables.filter(t => t.isOwner)){
    if (token.document.actorLink && ((Number(token.scene.flags.sr5?.backgroundCountValue) || 0) !== 0)){
      token.document.actor.prepareData()
    }
  }
}

//The matrix noise and background count of a template only count on its own scene, and for a linked actor that
//scene is read from the canvas when the actor is prepared (SR5_EffectArea.isPreparedAreaEffectOffScene): on
//a scene change, prepare again the actors that carry one
export function sr5HookCanvasReadyAreaEffects() {
  for (let actor of game.actors ?? []){
    if (!actor.items.some(i => i.system?.type === "areaEffect" && SR5_EffectArea.templateSceneId(i))) continue
    actor.prepareData()
    if (actor.sheet?.rendered) actor.sheet.render()
  }
}

//Tokens placed before the vision ranges were converted to the scene's units keep a range in meters until
//their vision is switched again : fix those of the scene being shown, once, by a single GM
export async function sr5HookCanvasReadyVisionRanges(canvasData) {
  const designated = game.users?.activeGM
  if (designated ? !designated.isSelf : !game.user.isGM) return
  const scene = canvasData?.scene
  const updates = SR5_EntityHelpers.visionRangeUpdatesOfScene(scene)
  if (updates.length) await scene.updateEmbeddedDocuments("Token", updates)
}

export async function sr5HookDrawMeasuredTemplate(template) {
  if ( !game.user.isGM ) return
  await SR5_EffectArea.initiateTemplateEffect(template)
}

export async function sr5HookDeleteMeasuredTemplate(templateDocument) {
  if ( !game.user.isGM ) return
  if (templateDocument.flags?.sr5?.jammerUuid) return SR5_Jammer.refreshScene(templateDocument.parent)
  await SR5_EffectArea.removeTemplateEffect(templateDocument)
}

export async function sr5HookUpdateMeasuredTemplate(templateDocument) {
  if ( !game.user.isGM ) return
  if (templateDocument.flags?.sr5?.jammerUuid) return SR5_Jammer.refreshScene(templateDocument.parent)
  await SR5_EffectArea.checkUpdatedTemplateEffect(templateDocument)
}

//The cone of a directional jammer (SR5 p. 443), on whatever scene it was placed, viewed or not
export function sr5HookCreateMeasuredTemplate(templateDocument) {
  if (templateDocument.flags?.sr5?.jammerUuid) SR5_Jammer.refreshScene(templateDocument.parent)
}

export async function sr5HookUpdateScene(data) {
  //relaunch prepare Data of all actor when a scene is modified, so background count and other effect are correctly applied without needing to manualy refresh an actor
  if (!game.user.isGM) return
  for (let token of data.tokens){
    token.actor.prepareData()
    if (token.actor.sheet.rendered) token.actor.sheet.render()
  }
}
