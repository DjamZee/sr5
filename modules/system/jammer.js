import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  SR5_EffectArea
} from "./effectArea.js"
import {
  jammerRating, jammerNoiseAt, jammerSpares, isWithinConeAngle
} from "./jammerRules.js"

// The physical jammer of SR5 p. 443 (rules in jammerRules.js). It reuses the noise of the Jam Signals action: one
// signalJammed effect per jammer and per target, carrying the noise in system.matrix.noise. Its ownerID is the
// jammer ITEM's uuid, where the action uses the jamming actor's id, so the two never take one another's effect.
export class SR5_Jammer {

  static isJammer(item){
    return item?.type === "itemGear" && !!item.system?.jammer?.type
  }

  static isOn(item){
    return SR5_Jammer.isJammer(item) && !!item.system.jammer.isActive && jammerRating(item.system) > 0
  }

  // A hardware jammer's effect, told apart from the action's by its owner: an item uuid
  static isHardwareJammedEffect(item){
    return item.system?.type === "signalJammed" && String(item.system.ownerID ?? "").includes(".Item.")
  }

  // Where the token ends up. While a move is animated, Foundry V13 makes the document's x and y follow the
  // animation on the client that draws it (measured on 2026-10-04: x read 1500 in the updateToken hook of a
  // move to 4000), so the source data is read: it holds the destination as soon as the update is made.
  static tokenCenter(token, scene){
    const size = scene.grid?.size ?? 100
    const x = token._source?.x ?? token.x, y = token._source?.y ?? token.y
    return {
      x: x + (token.width ?? 1) * size / 2, y: y + (token.height ?? 1) * size / 2
    }
  }

  // Area and directional jammers turned on, on one scene, each with the point its noise is measured from
  static sceneSources(scene){
    let sources = new Map()
    for (let token of scene.tokens){
      for (let item of token.actor?.items ?? []){
        if (!SR5_Jammer.isOn(item) || sources.has(item.uuid)) continue
        let type = item.system.jammer.type
        if (type === "area") sources.set(item.uuid, {
          item, carrier: token.actor, origin: SR5_Jammer.tokenCenter(token, scene)
        })
        else if (type === "directional"){
          let template = scene.templates.find(t => t.flags?.sr5?.jammerUuid === item.uuid)
          if (template) sources.set(item.uuid, {
            item, carrier: token.actor, origin: {
              x: template.x, y: template.y
            }, template
          })
        }
      }
    }
    return [...sources.values()]
  }

  // Noise each jammer should give an actor, by jammer uuid. point is null for an actor with no token here.
  static desiredNoise(actor, point, sources, scene){
    let desired = new Map()
    //A cranial jammer works on its wearer only, wherever the wearer stands
    for (let item of actor.items){
      if (SR5_Jammer.isOn(item) && item.system.jammer.type === "cranial" && !jammerSpares(item.system, actor.id, actor.id)){
        desired.set(item.uuid, {
          name: item.name, noise: jammerRating(item.system)
        })
      }
    }
    if (!point) return desired
    for (let source of sources){
      let system = source.item.system
      if (jammerSpares(system, source.carrier.id, actor.id)) continue
      if (source.template){
        let t = source.template
        if (!isWithinConeAngle(source.origin, t.direction, t.angle, point)) continue
        if (SR5_SystemHelpers.getDistanceBetweenTwoPoint(source.origin, point, scene) > t.distance) continue
      }
      let meters = SR5_SystemHelpers.getDistanceInMetersBetweenTwoPoint(source.origin, point, scene)
      let noise = jammerNoiseAt(system.jammer.type, jammerRating(system), meters)
      if (noise > 0) desired.set(source.item.uuid, {
        name: source.item.name, noise
      })
    }
    return desired
  }

  // Bring an actor's hardware jammer effects to what is desired: a changed noise is lifted and given again
  static async syncActor(actor, desired){
    for (let effect of actor.items.filter(i => SR5_Jammer.isHardwareJammedEffect(i))){
      let want = desired.get(effect.system.ownerID)
      if (want && want.noise === effect.system.value){
        desired.delete(effect.system.ownerID)
        continue
      }
      await SR5_EffectArea.removeJammedEffect(actor, effect)
    }
    for (let [uuid, want] of desired){
      await SR5_EffectArea.createJammedEffect({
        id: uuid, name: want.name
      }, actor, want.noise)
    }
  }

  static async _refreshScene(scene){
    let sources = SR5_Jammer.sceneSources(scene)
    let done = new Set()
    for (let token of scene.tokens){
      let actor = token.actor
      if (!actor || done.has(actor.uuid)) continue
      done.add(actor.uuid)
      let desired = SR5_Jammer.desiredNoise(actor, SR5_Jammer.tokenCenter(token, scene), sources, scene)
      await SR5_Jammer.syncActor(actor, desired)
    }
  }

  // Lift every effect one jammer gave, on every scene and every world actor (turned off, deleted)
  static async _purge(uuid){
    let actors = new Map()
    for (let actor of game.actors ?? []) actors.set(actor.uuid, actor)
    for (let scene of game.scenes ?? []) for (let token of scene.tokens) if (token.actor) actors.set(token.actor.uuid, token.actor)
    for (let actor of actors.values()){
      for (let effect of actor.items.filter(i => i.system?.type === "signalJammed" && i.system.ownerID === uuid)){
        await SR5_EffectArea.removeJammedEffect(actor, effect)
      }
    }
  }

  // Every refresh runs after the previous one: the hooks that start them are not awaited, and two of them at
  // once would each find no effect yet and each give one
  static QUEUE = Promise.resolve()
  static enqueue(fn){
    SR5_Jammer.QUEUE = SR5_Jammer.QUEUE.catch(() => {}).then(fn)
    return SR5_Jammer.QUEUE
  }

  static refreshScene(scene){
    if (!game.user?.isGM || !scene) return
    return SR5_Jammer.enqueue(() => SR5_Jammer._refreshScene(scene))
  }

  // A jammer changed (turned on or off, rating, type, spared actors, deleted): lift what it gave, then measure again
  // on every scene its carrier stands on, and for a cranial one on its wearer
  static refreshItem(item){
    if (!game.user?.isGM || item?.type !== "itemGear") return
    let uuid = item.uuid, actor = item.parent
    return SR5_Jammer.enqueue(async () => {
      await SR5_Jammer._purge(uuid)
      if (!actor) return
      let scenes = new Set()
      for (let found of SR5_EffectArea.getJammerTokens(actor, actor.isToken ? actor.token?.id : actor.id)) scenes.add(found.scene)
      for (let scene of scenes) await SR5_Jammer._refreshScene(scene)
      if (!scenes.size) await SR5_Jammer.syncActor(actor, SR5_Jammer.desiredNoise(actor, null, [], null))
    })
  }

  // Turn a jammer on or off from the actor's sheet. A directional one is aimed when it is turned on: its cone is
  // placed like a grenade's template, and stays where it was put.
  static async toggle(item){
    let on = !item.system.jammer.isActive
    if (!on){
      let scene = item.parent?.isToken ? item.parent.token?.parent : null
      for (let s of scene ? [scene] : game.scenes ?? []){
        let ids = s.templates.filter(t => t.flags?.sr5?.jammerUuid === item.uuid).map(t => t.id)
        if (ids.length) await s.deleteEmbeddedDocuments("MeasuredTemplate", ids)
      }
    }
    await item.update({
      "system.jammer.isActive": on
    })
    if (on && item.system.jammer.type === "directional") await item.placeGabarit()
  }
}
