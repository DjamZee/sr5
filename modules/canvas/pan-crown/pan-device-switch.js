// The owner switches a device's mode from its sheets (couronne du PAN, lot 6): the sheet of the item and the lists of
// the character's sheet, at the cost of the radial menu (pan-radial-menu.js, switchMode): silent is a simple action
// (SR5 p. 236, Q7), the wireless switch costs what it costs on the sheet (SR5 p. 165, 167 and 424).

import {
  modeSwitchCost, modeUpdate
} from "./pan-actions.js"
import {
  deviceModeOf, hasDeviceMode, isMasterDevice, ownDeviceMode
} from "./pan-device-mode.js"
import {
  droneOf
} from "./pan-graph.js"
import {
  SR5_ActorHelper
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5Combat
} from "../../system/srcombat.js"

// The items whose switch is being written: a second click before the counters come back would pass on the old count
const switching = new Set()

// The world actors and those of the scene's tokens, where a deployed drone is looked up (pan-graph.js, droneOf)
function knownActors(){
  const actors = [...(game.actors ?? [])]
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) if (token.actor && !token.document?.actorLink) actors.push(token.actor)
  return actors
}

/**
 * What the sheets show of an item's mode, or null when it has none.
 * @param {Item} item
 * @return {{mode: String, silentFrom: String|null, own: String, master: Boolean, drone: Boolean, modes: Array}|null}
 */
export function deviceModeView(item){
  if (!hasDeviceMode(item)) return null
  const actor = item.parent ?? null
  const drone = actor ? droneOf(item, actor, knownActors()) : null
  const panOwner = item.system?.isSlavedToPan && item.system?.panMaster ? SR5_EntityHelpers.getRealActorFromID(item.system.panMaster) : null
  const master = isMasterDevice(item)
  return {
    ...deviceModeOf(item, {
      actor, panOwner, drone
    }),
    own: ownDeviceMode(item, actor, drone),
    master,
    drone: !!drone,
    // The master's wireless goes through the character's sheet, which throws a hacker in VR out (SR5 p. 231)
    modes: master ? ["active", "silent"] : ["active", "silent", "offline"],
  }
}

const MODE_ICONS = {
  active: "fa-wifi", silent: "fa-user-secret", offline: "fa-power-off"
}
const MODE_LABELS = {
  active: "SR5.DeviceModeActive", silent: "SR5.DeviceModeSilent", offline: "SR5.DeviceModeOffline"
}
const MODE_SWITCHES = {
  active: "SR5.PanMenuModeActive", silent: "SR5.PanMenuModeSilent", offline: "SR5.PanMenuModeOffline"
}

/**
 * The mode of an item for its sheet: one button per mode, the own mode lit, and what its master passes on.
 * @param {Item} item   an item held by an actor (a world item has no PAN, and no mode)
 * @return {Object|null}
 */
export function deviceModeSheetContext(item){
  if (!item?.isEmbedded) return null
  const view = deviceModeView(item)
  if (!view) return null
  const locked = view.drone || !item.parent?.isOwner
  const notes = []
  if (view.silentFrom === "master") notes.push(game.i18n.localize("SR5.DeviceModeSilentFromMaster"))
  if (view.drone) notes.push(game.i18n.localize("SR5.WirelessHeldByDeployedDrone"))
  return {
    mode: view.mode,
    silentFrom: view.silentFrom,
    locked,
    note: notes.join(" · "),
    buttons: view.modes.map(mode => ({
      mode,
      icon: MODE_ICONS[mode],
      current: mode === view.own,
      title: mode === view.own ? game.i18n.localize(MODE_LABELS[mode]) : game.i18n.localize(MODE_SWITCHES[mode]),
    })),
  }
}

/**
 * Switch an item to a mode, spending the action it costs in combat.
 * @param {Item} item
 * @param {String} mode   "active", "silent" or "offline"
 */
export async function switchDeviceMode(item, mode){
  const holder = item?.parent ?? null
  if (!item || !holder?.isOwner) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_PanNotOwner"))
  const view = deviceModeView(item)
  if (!view || !view.modes.includes(mode)) return
  // A deployed drone holds its own switches, on its sheet
  if (view.drone) return void ui.notifications.info(game.i18n.localize("SR5.WirelessHeldByDeployedDrone"))
  if (switching.has(item.uuid)) return
  const actions = modeSwitchCost(view.own, mode, turningOn => SR5_ActorHelper.wirelessSwitchActionType(turningOn,
    game.settings.get("sr5", "sr5WifiRequiresDNI"), holder.system?.hasDNI))
  if (!actions.length) return
  if (!SR5Combat.hasActionsLeft(holder, actions)) return
  switching.add(item.uuid)
  try {
    if (view.master) {
      // The master's silent mode is its user's box, which carries the -2 (SR5 p. 236)
      await holder.update({
        "system.matrix.runningSilent": mode === "silent"
      })
      if (item.system.isSilent) await item.update({
        "system.isSilent": false
      })
      // The item itself did not change: its open sheet is drawn again for its button
      else if (item.sheet?.rendered) item.sheet.render()
    } else {
      await item.update(modeUpdate(mode))
      // The accessories of a weapon or an armor follow its wireless, as on the character's sheet
      const wireless = mode !== "offline"
      const accessories = (item.system.accessory ?? []).map(a => holder.items?.get(a?._id)).filter(a => a && a.system?.wirelessTurnedOn !== wireless)
      if (accessories.length) await holder.updateEmbeddedDocuments("Item", accessories.map(a => ({
        _id: a.id, "system.wirelessTurnedOn": wireless
      })))
    }
    await SR5Combat.changeActionInCombat(holder.isToken ? holder.token.id : holder.id, actions)
  } finally {
    switching.delete(item.uuid)
  }
}
