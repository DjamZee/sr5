import {
  ActorSheetSR5 
} from "./baseSheet.js"
import {
  HOST_ATTRIBUTES, hostTypeLayout
} from "./host-type.js"
import {
  hostMasterCandidates, hostNodesAllowed
} from "../../system/host-nodes.js"
import {
  hostChoices, isHostActor, panMasterChoices
} from "../../system/pan-candidates.js"
import {
  sceneCandidatesOf
} from "../../interface/scene-actors.js"

/**
 * An Actor sheet for device type actors in the Shadowrun 5 system.
 */
export class SR5AppareilSheet extends ActorSheetSR5 {
  constructor(...args) {
    super(...args)
  }

  static DEFAULT_OPTIONS = {
    classes: ["app", "window-app", "sr5", "actor", "device"],
    position: {
      width: 800, height: 448 
    },
    window: {
      resizable: true 
    },
  }

  static PARTS = {
    sheet: {
      template: "systems/sr5/templates/actors/device-sheet.hbs",
      root: true,
      scrollable: [".sr-panel"],
    },
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)

    this._prepareItems(context.actor)

    context.rulesMatrixGrid = game.settings.get("sr5", "sr5MatrixGridRules")
    context.rulesCalledShot = game.settings.get("sr5", "sr5CalledShotsRules")
    context.rulesKillCode = game.settings.get("sr5", "sr5KillCodeRules")
    context.matrixActionsRigger5 = game.settings.get("sr5", "sr5Rigger5Actions")
    context.panMasterOptions = this._panMasterOptions(context.actor)
    context.iceHostOptions = this._iceHostOptions(context.actor)

    return context
  }

  // A typed host (Kill Code p. 48-52): an attribute the type sets is not swapped; before a swap of two free ones, the
  // values the type dealt are saved, so that the swap is made on what the sheet shows and not on older saved values
  async _onDrop(event) {
    const matrix = this.actor.system.matrix
    // A host with no type, never arranged, shows the default order of SR5 p. 248 without having saved it
    const untypedDealt = !hostTypeLayout(matrix.hostType) && matrix.attributes?.firewall?.modifiers?.some(m => m.type === "hostType")
    if (this.actor.type === "actorDevice" && matrix.deviceType === "host" && (hostTypeLayout(matrix.hostType) || untypedDealt)) {
      let dropData = null
      try {
        dropData = JSON.parse(event.dataTransfer.getData('text/plain'))
      } catch {
        dropData = null
      }
      const dropZone = event.target.closest('[data-dropmatrixattribute]')
      if (dropData?.valueFromAttribute && dropZone) {
        const fixed = Object.keys(hostTypeLayout(matrix.hostType)?.fixed ?? {
        }).map(key => `system.matrix.attributes.${key}.base`)
        if (fixed.includes(dropData.valueFromAttribute) || fixed.includes(dropZone.dataset.dropmatrixattribute)) {
          event.preventDefault()
          event.stopPropagation()
          ui.notifications.info(game.i18n.localize('SR5.HostTypeLockedAttribute'))
          return
        }
        const updates = {
        }
        for (const key of HOST_ATTRIBUTES) {
          const shown = matrix.attributes[key].base
          if (this.actor._source.system.matrix.attributes[key].base !== shown) updates[`system.matrix.attributes.${key}.base`] = shown
        }
        // Saved, the default order is the gamemaster's own: its four values are no longer offered in the collection
        if (untypedDealt) for (let i = 1; i <= 4; i++) updates[`system.matrix.attributesCollection.value${i}isSet`] = true
        if (Object.keys(updates).length) await this.actor.update(updates)
      }
    }
    return super._onDrop(event)
  }

  // The masters a device can be slaved to (SR5 p. 234, couronne du PAN lot 7): the hosts, and the master devices of a PAN
  // (commlink, cyberdeck, rigger command console), among the actors of the device's scene, unlinked tokens included
  // (S1, ticket 4 d'Adrore), or of the whole world when "show everyone" is checked. A host is slaved to nothing, unless
  // the world setting sr5HostNodes is checked (host-nodes.js, arbitrage de DjamZ): then to another host only
  _panMasterOptions(actor) {
    if (actor.system.matrix.deviceType === "ice") return null
    const self = this.actor,
      candidates = sceneCandidatesOf(self, this._showAllMasters),
      current = actor.system.matrix.panMaster
    // A master that is gone, or stands on another scene, stays shown, so that saving the sheet does not erase it silently
    const unknownOf = options => {
      if (!current || options.some(o => o.value === current)) return null
      let found = null
      try {
        found = globalThis.fromUuidSync?.(current) ?? null
      } catch {
        found = null
      }
      return {
        value: current, label: found?.name ? `${found.parent?.name ? `${found.parent.name} — ` : ""}${found.name}` : current
      }
    }
    if (actor.system.matrix.deviceType === "host") {
      if (!hostNodesAllowed()) return null
      const others = candidates.filter(c => isHostActor(c.actor)).map(c => c.actor)
      const allowed = new Set(hostMasterCandidates(self, others, key => globalThis.fromUuidSync?.(key) ?? null))
      const hosts = hostChoices(candidates.filter(c => allowed.has(c.actor)), self)
      return {
        hosts, devices: [], unknown: unknownOf(hosts), showAll: !!this._showAllMasters,
      }
    }
    const {
      hosts, devices
    } = panMasterChoices(candidates, self)
    return {
      hosts, devices, unknown: unknownOf([...hosts, ...devices]), showAll: !!this._showAllMasters,
    }
  }

  // The hosts an IC can run in (SR5 p. 247-248, A6 of the API pour Matrice v1): those of its scene (S1), or of the world
  _iceHostOptions(actor) {
    if (actor.type !== "actorDevice" || actor.system.matrix.deviceType !== "ice") return null
    const hosts = hostChoices(sceneCandidatesOf(this.actor, this._showAllMasters), this.actor)
    const current = actor.system.matrix.hostUuid
    let found = null
    if (current && !hosts.some(o => o.value === current)) try {
      found = globalThis.fromUuidSync?.(current) ?? null
    } catch {
      found = null
    }
    return {
      hosts,
      // A host that is gone, or on another scene, stays shown, so that saving the sheet does not erase it silently
      unknown: current && !hosts.some(o => o.value === current) ? {
        value: current, label: found?.name ?? current
      } : null,
      showAll: !!this._showAllMasters,
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    // S1: "show everyone" gives back the world's actors in the selectors of the master and of the IC's host
    this.element.querySelectorAll("[data-sr5-show-all-masters]").forEach(box => box.addEventListener("change", event => {
      this._showAllMasters = event.currentTarget.checked
      this.render()
    }))
  }

  _prepareItems(actor) {
    const externalEffects = []
    const files = []

    // Iterate through items, allocating to containers
    for (let i of actor.items) {
      if (i.type === "itemEffect") externalEffects.push(i)
      else if (i.type === "itemFile") files.push(i)
    }

    actor.externalEffects = externalEffects
    actor.files = files
  }

  /** @override */
  async _onDropItemCreate(itemData) {
    // A host's files, a device's (SR5 p. 228)
    switch(itemData.type){
      case "itemEffect":
      case "itemFile":
        return super._onDropItemCreate(itemData)
      default:
        ui.notifications.info(game.i18n.localize('SR5.INFO_ForbiddenItemType'))
        return
    }
  }
}
