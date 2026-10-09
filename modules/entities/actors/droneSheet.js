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
import {
  openVehicleRepair
} from "../../system/vehicle-repair-apply.js"
import {
  rccAutosoftRows, droneAutopilot
} from "./rcc.js"
import {
  workshopContext, dropModOnWorkshop, openModInstall, fitModDirectly, openWorkshopShop
} from "../../system/vehicle-workshop-apply.js"

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
      width: 900, height: 618 
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
    //Computed in prepareDerivedData, not a schema field: toObject() leaves it out (SR5 p. 267, every drone has the interface)
    context.system.hasRiggerInterface = this.actor.system.hasRiggerInterface
    //Same for the right to jump in, which asks the controller's control rig (SR5 p. 243, 267)
    context.system.canJumpIn = this.actor.system.canJumpIn
    //And the swarm the drone is a body of (Rigger 5.0 p. 35, system/swarm.js)
    context.system.swarmState = this.actor.system.swarmState

    this._prepareItems(context.actor)

    context.rulesMatrixGrid = game.settings.get("sr5", "sr5MatrixGridRules")
    context.rulesCalledShot = game.settings.get("sr5", "sr5CalledShotsRules")
    context.rulesKillCode = game.settings.get("sr5", "sr5KillCodeRules")
    context.matrixActionsRigger5 = game.settings.get("sr5", "sr5Rigger5Actions")
    //The Chop Shop (Rigger 5.0 p. 153-156)
    context.workshop = workshopContext(this.actor)

    return context
  }

  _onRender(context, options) {
    super._onRender(context, options)
    this.element.querySelectorAll(".drone-wireless-toggle").forEach(el => el.addEventListener("click", this._onToggleDroneWireless.bind(this)))
    //Rigger 5.0 p. 33-34: repairing the vehicle (system/vehicle-repair-apply.js)
    this.element.querySelectorAll(".drone-repair").forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault()
      openVehicleRepair(this.actor)
    }))
    //Rigger 5.0 p. 153-154: the workshop's mods, installed or removed by the book, or by the gamemaster directly (Q7)
    const workshopMod = ev => this.actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId)
    const on = (selector, handler) => this.element.querySelectorAll(selector).forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault()
      const mod = workshopMod(ev)
      if (mod) handler(mod)
    }))
    on(".workshop-install", mod => openModInstall(this.actor, mod))
    on(".workshop-remove", mod => openModInstall(this.actor, mod, {
      removal: true
    }))
    on(".workshop-fit", mod => fitModDirectly(mod, true))
    on(".workshop-unfit", mod => fitModDirectly(mod, false))
    this.element.querySelectorAll(".workshop-shop").forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault()
      openWorkshopShop(this.actor)
    }))
  }

  //A mod dropped on the workshop is bought, moved aboard or fitted there (vehicle-workshop-apply.js); any other drop
  //stays the sheet's
  async _onDrop(event) {
    if (!event.target?.closest?.(".sr5-workshop-drop")) return super._onDrop(event)
    event.preventDefault()
    event.stopPropagation()
    return dropModOnWorkshop(this.actor, foundry.applications.ux.TextEditor.implementation.getDragEventData(event))
  }

  //The deployed drone holds its vehicle's wireless switch (N83): switching it costs the drone an action (N91).
  //Turning it off is always free (SR5 p. 424). Its owner turns a switched-off drone back on, at the book's cost: the
  //drone itself may do it (p. 424), its rigger reaches it by direct connection (p. 234) (arbitrage de DjamZ, 08/10)
  async _onToggleDroneWireless(event) {
    event.preventDefault()
    if (this._spendingWirelessAction) return
    const actor = this.actor
    const oldValue = actor.system.wirelessTurnedOn !== false
    if (!SR5_ActorHelper.droneWirelessToggleAllowed(game.user?.isGM, !oldValue, actor.isOwner)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_DroneWirelessOnGMOnly"))
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
    const gears = []
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
      else if (i.type === "itemGear") gears.push(i)
    }

    actor.weapons = weapons
    actor.armors = armors
    actor.programs = programs
    // The files it stores (SR5 p. 228)
    actor.files = Array.from(actor.items).filter(i => i.type === "itemFile")
    //The console's autosofts, and whether this drone uses them (SR5 p. 269)
    actor.rccAutosofts = rccAutosoftRows(actor.system, actor.items)
    actor.autopilotCap = droneAutopilot(actor.system, actor.items)
    //Autopilot faced with the unexpected: Device Rating x 2 (SR5 p. 271)
    actor.autopilotUnforeseenPool = (actor.system.attributes.pilot.augmented.value || 0) * 2
    actor.marks = marks
    actor.ammunitions = ammunitions
    actor.vehiclesMod = vehiclesMod
    //Vehicle equipment (Rigger 5.0 p. 154-156): carried aboard, not built in
    actor.gears = gears
    actor.externalEffects = externalEffects
  }

  /** @override */
  async _onDropItemCreate(item) {
    switch(item.type){
      case "itemWeapon":
        //A melee weapon is mounted on the vehicle or held by a drone arm (Rigger 5.0 p. 129, 182)
        if (item.system.category !== "rangedWeapon" && item.system.category !== "meleeWeapon") {
          ui.notifications.info(game.i18n.localize('SR5.INFO_ForbiddenItemType'))
          return
        }
        this._activeUnlessOneIs(item, i => i.type === "itemWeapon" && i.system.category === item.system.category)
        return super._onDropItemCreate(item)
      case "itemArmor":
      case "itemProgram":
      case "itemMark":
      case "itemFile":
      case "itemAmmunition":
      case "itemVehicleMod":
      case "itemGear":
      case "itemEffect":
        return super._onDropItemCreate(item)
      default:
        ui.notifications.info(game.i18n.localize('SR5.INFO_ForbiddenItemType'))
        return
    }
  }
}
