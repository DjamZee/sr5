import {
  ActorSheetSR5 
} from "./baseSheet.js"
import {
  SR5_ActorHelper
} from "./entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_MiscellaneousHelpers
} from "../../rolls/roll-helpers/miscellaneous.js"
import {
  SR5Combat
} from "../../system/srcombat.js"

/**
 * An Actor sheet for drone type actors in the Shadowrun 5 system.
 */
export class SR5DroneSheet extends ActorSheetSR5 {
  constructor(...args) {
    super(...args)

    this._shownInactiveMatrixPrograms = true
    this._shownUntrainedSkills = false
    this._shownUntrainedGroups = false
    this._filters = {
      skills: ""
    }
  }

  static DEFAULT_OPTIONS = {
    classes: ["app", "window-app", "sr5", "actor", "drone"],
    position: {
      width: 800, height: 618 
    },
    window: {
      resizable: false 
    },
  }

  static PARTS = {
    sheet: {
      template: "systems/sr5/templates/actors/drone-sheet.hbs",
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

    return context
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this.element.querySelectorAll(".drone-wireless-toggle").forEach(el => el.addEventListener("click", this._onToggleDroneWireless.bind(this)))
  }

  //The deployed drone holds its vehicle's wireless switch (N83): switching it costs the drone an action (N91)
  async _onToggleDroneWireless(event) {
    event.preventDefault()
    if (this._spendingWirelessAction) return
    const actor = this.actor
    const oldValue = actor.system.wirelessTurnedOn !== false
    const owner = SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId)
    const actions = [{
      type: SR5_ActorHelper.droneWirelessActionType(game.settings.get("sr5", "sr5WifiRequiresDNI"), owner),
      value: 1,
      source: oldValue ? "turnOffWifi" : "turnOnWifi"
    }]
    if (!SR5Combat.hasActionsLeft(actor, actions)) return
    this._spendingWirelessAction = true
    try {
      const actionsLeft = SR5_MiscellaneousHelpers.spendActions(foundry.utils.deepClone(actor.system.specialProperties.actions), actions)
      await actor.update({
        "system.wirelessTurnedOn": !oldValue,
        "system.specialProperties.actions": actionsLeft,
      })
    } finally {
      this._spendingWirelessAction = false
    }
  }

  _prepareItems(actor) {
    const weapons = []
    const armors = []
    const programs = []
    const marks = []
    const ammunitions = []
    const vehiclesMod = []
    const externalEffects = []

    // Iterate through items, allocating to containers
    for (let i of actor.items) {
      if (i.type === "itemWeapon") weapons.push(i)
      else if (i.type === "itemArmor") armors.push(i)
      else if (i.type === "itemProgram") {
        if (i.system.isActive === true || this._shownInactiveMatrixPrograms) programs.push(i)
      }
      else if (i.type === "itemMark") marks.push(i)
      else if (i.type === "itemAmmunition") ammunitions.push(i)
      else if (i.type === "itemEffect") externalEffects.push(i)
      else if (i.type === "itemVehicleMod") vehiclesMod.push(i)
    }

    actor.weapons = weapons
    actor.armors = armors
    actor.programs = programs
    actor.marks = marks
    actor.ammunitions = ammunitions
    actor.vehiclesMod = vehiclesMod
    actor.externalEffects = externalEffects
  }

  /** @override */
  async _onDropItemCreate(item) {
    switch(item.type){
      case "itemWeapon":
        if (item.system.category !== "rangedWeapon") {
          ui.notifications.info(game.i18n.localize('SR5.INFO_ForbiddenItemType'))
          return
        }
        for (let i of this.actor.items){
          if (i.system.type === "itemWeapon" && i.system.isActive && (i.system.category === item.system.category)) {
            return super._onDropItemCreate(item)
          }
        }
        item.system.isActive = true
        return super._onDropItemCreate(item)
      case "itemArmor":
      case "itemProgram":
      case "itemMark":
      case "itemAmmunition":
      case "itemVehicleMod":
      case "itemEffect":
        return super._onDropItemCreate(item)
      default:
        ui.notifications.info(game.i18n.localize('SR5.INFO_ForbiddenItemType'))
        return
    }
  }
}
