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
      resizable: true 
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

  //The deployed drone holds its vehicle's wireless switch (N83): switching it costs the drone an action (N91).
  //Turning it off is always free (SR5 p. 424). Turning a switched-off drone back on stays a GM shortcut: the
  //drone itself may do it, but nobody can reach it wirelessly to ask it to (p. 424, direct connection p. 234)
  async _onToggleDroneWireless(event) {
    event.preventDefault()
    if (this._spendingWirelessAction) return
    const actor = this.actor
    const oldValue = actor.system.wirelessTurnedOn !== false
    if (!SR5_ActorHelper.droneWirelessToggleAllowed(game.user?.isGM, !oldValue)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_DroneWirelessOnGMOnly"))
    const owner = SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId)
    const actions = [{
      type: SR5_ActorHelper.droneWirelessActionType(game.settings.get("sr5", "sr5WifiRequiresDNI"), owner, !oldValue),
      value: 1,
      source: oldValue ? "turnOffWifi" : "turnOnWifi"
    }]
    if (!SR5Combat.hasActionsLeft(actor, actions)) return
    this._spendingWirelessAction = true
    try {
      const updates = {
        "system.wirelessTurnedOn": !oldValue
      }
      //Out of combat nothing is spent (baseSheet _spendsActionCounters)
      if (this._spendsActionCounters()){
        const actionsLeft = SR5_MiscellaneousHelpers.spendActions(foundry.utils.deepClone(actor.system.specialProperties.actions), actions)
        //The counters only: the prepared value and modifiers of the actions are not written in the source
        updates["system.specialProperties.actions.free.current"] = actionsLeft.free.current
        updates["system.specialProperties.actions.simple.current"] = actionsLeft.simple.current
        updates["system.specialProperties.actions.complex.current"] = actionsLeft.complex.current
      }
      await actor.update(updates)
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
        this._activeUnlessOneIs(item, i => i.type === "itemWeapon" && i.system.category === item.system.category)
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
