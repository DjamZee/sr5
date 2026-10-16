import {
  SR5
} from "../config.js"
import {
  MECHANIC_SKILLS, mechanicSkillFor, repairState, partsCost, nanomaintenanceRating, repairedMonitor
} from "./vehicle-repair.js"

// The Foundry side of the vehicle repair (Rigger 5.0 p. 33-34, p. 167): the window of the "Repair" button of
// the drone sheet, and the repaired boxes taken off the monitor from the chat card. The rules are in vehicle-repair.js

const REPAIRER_TYPES = ["actorPc", "actorGrunt"]

/** The mechanic: the selected token, else the user's character, else the owner of the vehicle (also the one who
 *  installs a mod, vehicle-workshop-apply.js) */
export function findRepairer(vehicle){
  const candidates = [
    ...(canvas?.tokens?.controlled ?? []).map(t => t.actor),
    game.user.character,
    game.actors.get(vehicle.system.vehicleOwner?.id),
  ]
  return candidates.find(a => a && a.id !== vehicle.id && REPAIRER_TYPES.includes(a.type) && a.isOwner) ?? null
}

/** Opened by the "Repair" button of the drone sheet */
export async function openVehicleRepair(vehicle){
  const state = repairState(vehicle.system.conditionMonitors?.condition)
  if (state.wrecked) return ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairWrecked", {
    vehicle: vehicle.name
  }))
  if (!state.repairable) return ui.notifications.info(game.i18n.format("SR5.INFO_VehicleRepairNothing", {
    vehicle: vehicle.name
  }))

  const repairer = findRepairer(vehicle)
  const nanoRating = nanomaintenanceRating(vehicle.items)
  if (!repairer && !nanoRating) return ui.notifications.warn(game.i18n.localize("SR5.WARN_VehicleRepairNoMechanic"))

  const defaultSkill = mechanicSkillFor(vehicle.system)
  const skillOptions = MECHANIC_SKILLS.map(k => `<option value="${k}" ${k === defaultSkill ? "selected" : ""}>${game.i18n.localize(SR5.skills[k])}</option>`).join("")
  const L = k => game.i18n.localize(k)
  const modes = []
  if (repairer) modes.push(`<option value="mechanic">${L("SR5.VehicleRepairModeMechanic")}</option>`)
  if (nanoRating) modes.push(`<option value="nanomaintenance">${game.i18n.format("SR5.VehicleRepairModeNano", {
    rating: nanoRating
  })}</option>`)

  const content = `<div class="sr5-vehicle-repair">
    <p>${game.i18n.format("SR5.VehicleRepairIntro", {
    damage: state.damage, cost: partsCost(vehicle.system.price, state.damage).toLocaleString()
  })}</p>
    <div class="form-group"><label>${L("SR5.VehicleRepairMode")}</label><select name="mode">${modes.join("")}</select></div>
    ${repairer ? `<div class="form-group"><label>${L("SR5.VehicleRepairMechanic")}</label><span>${repairer.name}</span></div>
    <div class="form-group"><label>${L("SR5.Skill")}</label><select name="skillKey">${skillOptions}</select></div>` : ""}
    <div class="form-group"><label>${L("SR5.VehicleRepairBoxes")}</label><input type="number" name="boxes" min="1" max="${state.damage}" value="${state.damage}"></div>
    <div class="form-group"><label>${L("SR5.VehicleRepairMissingParts")}</label><input type="number" name="missingParts" min="0" max="${state.damage}" value="0"></div>
    ${nanoRating ? `<div class="form-group"><label>${game.i18n.format("SR5.VehicleRepairNanoAssist", {
    rating: nanoRating
  })}</label><input type="checkbox" name="nanoAssist"></div>` : ""}
    <p class="hint">${L("SR5.VehicleRepairHint")}</p>
  </div>`

  const choice = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: `${L("SR5.VehicleRepair")}${L("SR5.Colons")} ${vehicle.name}`
    },
    content,
    ok: {
      label: L("SR5.VehicleRepair"),
      callback: (event, button) => {
        const f = button.form.elements
        return {
          mode: f.mode.value,
          skillKey: f.skillKey?.value,
          boxes: Math.min(state.damage, Math.max(1, Number(f.boxes.value) || state.damage)),
          missingParts: Number(f.missingParts.value) || 0,
          nanoAssist: f.nanoAssist?.checked ? nanoRating : 0,
        }
      },
    },
    rejectClose: false,
  })
  if (!choice) return

  const options = {
    ...choice, vehicleUuid: vehicle.uuid, vehicleName: vehicle.name, nanoRating
  }
  //R5 p. 167, autonomous repair: rolled by the vehicle itself
  if (choice.mode === "nanomaintenance") return vehicle.rollTest("vehicleRepair", options)

  //SR5 p. 146-147: the Mechanic skills have no defaulting
  if (!(repairer.system.skills?.[choice.skillKey]?.rating?.value > 0)) return ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairNoSkill", {
    actor: repairer.name, skill: L(SR5.skills[choice.skillKey])
  }))
  return repairer.rollTest("vehicleRepair", options)
}

/** The "Repair" button of the chat card. A GM or an owner of the vehicle writes its monitor */
export async function applyVehicleRepair(repair){
  const vehicle = repair?.vehicleUuid ? await fromUuid(repair.vehicleUuid) : null
  if (!vehicle) return false
  if (!vehicle.isOwner) {
    ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairNotOwner", {
      vehicle: vehicle.name
    }))
    return false
  }
  const monitor = vehicle.system.conditionMonitors.condition
  const update = repairedMonitor(monitor, repair.repaired)
  const updates = {
    "system.conditionMonitors.condition.actual.base": update.base
  }
  if (update.aggravated !== undefined) updates["system.conditionMonitors.condition.aggravated"] = update.aggravated
  await vehicle.update(updates)
  ui.notifications.info(game.i18n.format("SR5.INFO_VehicleRepaired", {
    vehicle: vehicle.name, boxes: update.repaired
  }))
}
