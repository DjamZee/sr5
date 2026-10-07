import {
  ActorSheetSR5 
} from "./baseSheet.js"
import {
  HOST_ATTRIBUTES, hostTypeLayout
} from "./host-type.js"

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

    return context
  }

  // A typed host (Kill Code p. 48-52): an attribute the type sets is not swapped; before a swap of two free ones, the
  // values the type dealt are saved, so that the swap is made on what the sheet shows and not on older saved values
  async _onDrop(event) {
    const matrix = this.actor.system.matrix
    if (this.actor.type === "actorDevice" && matrix.deviceType === "host" && hostTypeLayout(matrix.hostType)) {
      let dropData = null
      try {
        dropData = JSON.parse(event.dataTransfer.getData('text/plain'))
      } catch {
        dropData = null
      }
      const dropZone = event.target.closest('[data-dropmatrixattribute]')
      if (dropData?.valueFromAttribute && dropZone) {
        const fixed = Object.keys(hostTypeLayout(matrix.hostType).fixed).map(key => `system.matrix.attributes.${key}.base`)
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
        if (Object.keys(updates).length) await this.actor.update(updates)
      }
    }
    return super._onDrop(event)
  }

  // The masters a device can be slaved to (SR5 p. 234, couronne du PAN lot 7): the hosts of the world, and the master
  // devices of a PAN (commlink, cyberdeck, rigger command console) of the world's actors. A host is slaved to nothing.
  _panMasterOptions(actor) {
    if (actor.system.matrix.deviceType === "host" || actor.system.matrix.deviceType === "ice") return null
    const hosts = []
    const devices = []
    for (const other of game.actors ?? []) {
      if (other.id === actor.id) continue
      if (other.type === "actorDevice" && other.system.matrix?.deviceType === "host") {
        hosts.push({
          value: other.uuid, label: other.name
        })
        continue
      }
      const master = other.items.find(i => i.type === "itemDevice" && i.system.isActive &&
        ["commlink", "cyberdeck", "riggerCommandConsole"].includes(i.system.type))
      if (master) devices.push({
        value: master.uuid, label: `${other.name} — ${master.name}`
      })
    }
    const byLabel = (a, b) => a.label.localeCompare(b.label)
    const current = actor.system.matrix.panMaster
    const known = [...hosts, ...devices].some(o => o.value === current)
    return {
      hosts: hosts.sort(byLabel),
      devices: devices.sort(byLabel),
      // A master that is gone stays shown, so that saving the sheet does not erase it silently
      unknown: current && !known ? current : null,
    }
  }

  _prepareItems(actor) {
    const externalEffects = []

    // Iterate through items, allocating to containers
    for (let i of actor.items) {
      if (i.type === "itemEffect") externalEffects.push(i)
    }

    actor.externalEffects = externalEffects
  }

  /** @override */
  async _onDropItemCreate(itemData) {
    switch(itemData.type){
      case "itemEffect":
        return super._onDropItemCreate(itemData)
      default:
        ui.notifications.info(game.i18n.localize('SR5.INFO_ForbiddenItemType'))
        return
    }
  }
}
