import {
  SR5
} from "../config.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_UtilityItem
} from "../entities/items/utilityItem.js"
import {
  SR5Shop
} from "../interface/shop.js"
import {
  MECHANIC_SKILLS, mechanicSkillFor
} from "./vehicle-repair.js"
import {
  findRepairer
} from "./vehicle-repair-apply.js"
import {
  isFactoryMod
} from "./vehicle-factory.js"
import {
  TOOL_LEVELS, slotGauges, modsByCategory, modCost, workshopCost, workshopImage
} from "./vehicle-workshop.js"
import {
  assembledVehicleData
} from "./vehicle-dealership.js"
import {
  usesModPoints, droneModRule, vehicleStats, modPointsCost, modPointsOnDrone, modPointsLines, modPointsGauge, modsTakingPoints, modPointsPrice,
  modPointsAvailability
} from "./drone-mod-points.js"

// The Foundry side of the workshop (Chop Shop, B12; Rigger 5.0 p. 153-156): the "Workshop" tab of the drone sheet and
// of the vehicle item, the drop of a mod, its purchase through the shop, the direct fitting by the gamemaster and the
// extended test that installs or removes it. The rules are in vehicle-workshop.js

const L = k => game.i18n.localize(k)

/** The vehicle item a deployed drone comes from: it knows the vehicle's category, the drone actor does not */
function sourceVehicleItem(drone){
  const owner = SR5_EntityHelpers.getRealActorFromID(drone.system.creatorId)
  return owner?.items?.get(drone.system.creatorItemId) ?? null
}

/** Who pays for a mod bought from the workshop: the rigger the drone was deployed by, or the carrier of the item */
export function workshopBuyer(vehicle){
  if (vehicle.documentName === "Item") return vehicle.parent ?? null
  return SR5_EntityHelpers.getRealActorFromID(vehicle.system.creatorId) ?? game.actors.get(vehicle.system.vehicleOwner?.id) ?? null
}

/** The attributes the price of a mod is multiplied by (handleVehiclePriceMultiplier), read on a drone or a vehicle item */
function priceMultipliers(vehicle){
  const s = vehicle.system
  if (vehicle.documentName === "Item") return {
    acceleration: s.attributes.acceleration, handling: s.attributes.handling, speed: s.attributes.speed,
    body: s.attributes.body, seating: s.seating, vehicle: s.price.base,
  }
  const a = s.attributes
  return {
    acceleration: a.acceleration.natural.base, handling: a.handling.natural.base, speed: a.speed.natural.base,
    body: a.body.natural.base, seating: a.seating.natural.base, vehicle: s.price,
  }
}

/** The data of a mod and its price once on this vehicle (R5 p. 156: some prices are multiplied by the vehicle's
 *  attributes or its price), worked out as the actor preparation does */
export function pricedModData(source, vehicle){
  const data = source.toObject()
  delete data._id
  data.system.vehiclePriceMultiplier = priceMultipliers(vehicle)
  const temp = new CONFIG.Item.documentClass(data)
  SR5_UtilityItem._handleItemPrice(temp.system)
  //Under the Modification Points, an attribute upgrade of a drone is priced by the book's formula (R5 p. 127-128)
  const points = usesModPoints(droneModRule(), vehicle.system.type)
  const pointsPrice = points ? modPointsPrice(temp.system, vehicleStats(vehicle.system)) : null
  return {
    data, price: pointsPrice ?? (Number(temp.system.price.value) || 0),
    //...and its availability too (R5 p. 127-128): null when the mod's own stands
    availability: points ? modPointsAvailability(temp.system, vehicleStats(vehicle.system)) : null,
    // The slots once prepared (a count multiplied by the rating): the stored data holds 0 (lot R9, the dealership)
    slots: Number(temp.system.slots?.value) || 0,
  }
}

/** The shop of the workshop's button, on its mods, for the workshop's buyer (Adrore's feedback C7c). A drone under the
 *  Modification Points opens on the drone mods (Rigger 5.0 p. 126); with slots, it takes the vehicle mods (p. 152) */
export function openWorkshopShop(vehicle){
  const drones = usesModPoints(droneModRule(), vehicle.system?.type)
  game.sr5?.shop?.open({
    actor: workshopBuyer(vehicle), shelf: drones ? "drones" : "vehicles", sub: "itemVehicleMod"
  })
}

/** The data the "Workshop" block renders, the same for the drone sheet and the vehicle item sheet */
export function workshopContext(vehicle){
  const isItem = vehicle.documentName === "Item"
  const s = vehicle.system
  const mods = isItem ? (s.vehiclesMod ?? []) : vehicle.items.filter(i => i.type === "itemVehicleMod")
  const capacity = isItem ?
    Object.fromEntries(["powerTrain", "protection", "weapons", "body", "electromagnetic", "cosmetic"].map(k => [k, Number(s.attributes.body) || 0])) :
    Object.fromEntries(Object.entries(s.modificationSlots).filter(([, v]) => typeof v === "object").map(([k, v]) => [k, v.base]))
  const category = isItem ? s.category : sourceVehicleItem(vehicle)?.system?.category
  const buyer = workshopBuyer(vehicle)
  //Under the optional Modification Points a drone has one pool of points (R5 p. 126-128); vehicles keep their slots
  const points = usesModPoints(droneModRule(), s.type)
  const stats = vehicleStats(s)
  const priceOf = points ? m => modPointsCost(m, stats) : modCost
  //The free +1 is once per drone: one line takes it, not each upgrade (review 40)
  const pointLines = points ? modPointsLines(mods, undefined, stats) : []
  const row = (m, index) => {
    const ms = m.system ?? {
    }
    const factory = isFactoryMod(m)
    const fitted = factory || ms.isActive === true
    return {
      id: m._id ?? m.id, index, name: `${m.name}${ms.isWeaponMounted && ms.surname ? ms.surname : ""}`, img: m.img,
      rating: ms.itemRating && !m.name.includes(`(${ms.itemRating})`) ? ms.itemRating : 0,
      //A factory mod takes neither slots nor points (R5 p. 191): its column shows 0, like the gauge
      slots: factory ? 0 : points ? pointLines[index] : Number(ms.slots?.value) || 0, threshold: Number(ms.threshold?.value) || 0,
      tools: ms.tools ? L(SR5.vehicleModTools[ms.tools] ?? ms.tools) : "", price: priceOf(m).toLocaleString(),
      factory, fitted, pending: !fitted,
    }
  }
  const rows = mods.map(row)
  const byId = new Map(rows.map(r => [r.index, r]))
  const gauges = points ? [{
    ...modPointsGauge(stats, modsTakingPoints(mods)), label: L("SR5.DroneModPoints")
  }] : slotGauges(capacity, mods).map(g => ({
    ...g, label: L(SR5.vehicleModType[g.key])
  }))
  const cost = workshopCost(isItem ? s.price?.base : s.price, mods, priceOf)
  const yen = n => `${n.toLocaleString()} ¥`
  return {
    isItem, isGM: game.user.isGM, canTest: !isItem && vehicle.isOwner,
    name: vehicle.name, img: workshopImage(vehicle.img, {
      type: s.type, category
    }),
    gauges, gaugesLeft: gauges.slice(0, 3), gaugesRight: gauges.slice(3), points,
    slotsShort: L(points ? "SR5.DroneModPointsShort" : "SR5.VehicleModSlotsShort"),
    slotsFull: L(points ? "SR5.DroneModPoints" : "SR5.VehicleModSlotsFull"),
    modPoints: s.modPoints ?? "",
    groups: modsByCategory(mods.map((m, index) => ({
      ...m, system: m.system, name: m.name, index
    }))).map(g => ({
      key: g.key, label: g.key ? L(SR5.vehicleModType[g.key]) : L("SR5.VehicleModWorkshopOther"),
      mods: g.mods.map(m => byId.get(m.index)),
    })),
    cost: {
      ...cost, vehicleLabel: yen(cost.vehicle), modsLabel: yen(cost.mods), totalLabel: yen(cost.total)
    },
    buyer: isItem ? "" : (buyer?.name ?? ""), balanceLabel: buyer ? yen(SR5Shop.balance(buyer)) : "",
    // The shop, open on its vehicles shelf, to drag a mod onto the workshop: a drone's buyer buys there, only the
    // gamemaster fits a mod on a vehicle item (dropModOnWorkshop; Adrore's feedback C7c)
    canShop: isItem ? game.user.isGM : !!buyer,
  }
}

/** A mod dropped on the workshop of a drone: the price on this vehicle is shown first, then the shop debits it (Q10 of
 *  DjamZ), or the gamemaster fits it directly (Q7); one taken from an inventory waits on the vehicle to be installed */
export async function dropModOnWorkshop(vehicle, dropData){
  if (dropData?.type !== "Item") return false
  const source = await fromUuid(dropData.uuid)
  if (source?.type !== "itemVehicleMod") return ui.notifications.warn(L("SR5.WARN_WorkshopNotAMod"))
  if (source.parent?.uuid === vehicle.uuid) return false
  if (!vehicle.isOwner) return ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairNotOwner", {
    vehicle: vehicle.name
  }))
  const isItem = vehicle.documentName === "Item"
  const {
    data, price, slots, availability
  } = pricedModData(source, vehicle)
  const owned = source.parent?.documentName === "Actor"
  const buyer = workshopBuyer(vehicle)
  const s = source.system
  const buttons = []
  if (!owned && !isItem && buyer) buttons.push({
    action: "buy", label: game.i18n.format("SR5.VehicleModWorkshopBuy", {
      price: price.toLocaleString()
    }), default: true
  })
  if (owned && source.parent.isOwner && !isItem) buttons.push({
    action: "move", label: L("SR5.VehicleModWorkshopMove"), default: true
  })
  if (game.user.isGM) buttons.push({
    action: "fit", label: L("SR5.VehicleModWorkshopFit")
  })
  if (!buttons.length) return ui.notifications.warn(L(isItem ? "SR5.WARN_WorkshopItemGMOnly" : "SR5.WARN_WorkshopNoBuyer"))
  buttons.push({
    action: "cancel", label: L("SR5.Cancel")
  })

  const content = `<div class="sr5-workshop-drop-dialog">
    <p><strong>${source.name}</strong> — ${L(SR5.vehicleModType[s.type] ?? "SR5.VehicleModWorkshopOther")}</p>
    <ul>
      <li>${usesModPoints(droneModRule(), vehicle.system.type) ?
    //What the line will cost once fitted, beside the drone's mods (the free +1 is once per drone): not "as if alone"
    `${L("SR5.DroneModPoints")}${L("SR5.Colons")} ${modPointsOnDrone(isItem ? (vehicle.system.vehiclesMod ?? []) :
      vehicle.items.filter(i => i.type === "itemVehicleMod"), {
      ...s, slots: {
        value: slots
      }
    }, vehicleStats(vehicle.system))}` :
    `${L("SR5.VehicleModSlotsShort")}${L("SR5.Colons")} ${s.slots?.value ?? 0}`}</li>
      ${availability ? `<li>${L("SR5.ShopAvailability")}${L("SR5.Colons")} ${availability.availability}${availability.legality}</li>` : ""}
      <li>${L("SR5.Threshold")}${L("SR5.Colons")} ${s.threshold?.value ?? 0}${s.tools ? `, ${L(SR5.vehicleModTools[s.tools] ?? s.tools)}` : ""}</li>
      <li>${game.i18n.format("SR5.VehicleModWorkshopPriceOn", {
    price: price.toLocaleString(), vehicle: vehicle.name
  })}</li>
      ${buyer && !isItem ? `<li>${game.i18n.format("SR5.VehicleModWorkshopBuyer", {
    buyer: buyer.name, balance: `${SR5Shop.balance(buyer).toLocaleString()} ¥`
  })}</li>` : ""}
    </ul>
    ${buttons.some(b => b.action === "buy" || b.action === "move") ? `<p class="hint">${L("SR5.VehicleModWorkshopDropHint")}</p>` : ""}
  </div>`
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: `${L("SR5.VehicleModWorkshop")}${L("SR5.Colons")} ${vehicle.name}`
    },
    content, buttons, rejectClose: false,
  })
  if (!choice || choice === "cancel") return false

  if (choice === "buy") return SR5Shop.checkout(buyer, [{
    uuid: source.uuid, quantity: 1, name: source.name
  }], {
    recipient: vehicle, priceOn: () => price, availabilityOn: availability ? () => availability : null
  })
  if (choice === "move"){
    data.system.isActive = false
    const created = await vehicle.createEmbeddedDocuments("Item", [data])
    if (created?.length) await source.delete()
    return !!created?.length
  }
  //The gamemaster's direct fitting: no test, no payment (Q7 of DjamZ)
  data.system.isActive = true
  //On the vehicle item the mod stays raw data: it carries its prepared slots, or the workshop's gauge reads 0 (lot R9)
  if (isItem){
    data.img = new CONFIG.Item.documentClass(data).img
    const built = assembledVehicleData({
      system: {
        vehiclesMod: vehicle.system.vehiclesMod ?? []
      }
    }, [{
      data, price, slots, fitted: true
    }], foundry.utils.randomID)
    return vehicle.update({
      "system.vehiclesMod": built.system.vehiclesMod
    })
  }
  const created = await vehicle.createEmbeddedDocuments("Item", [data])
  return !!created?.length
}

/** The gamemaster takes a mod off the vehicle item directly */
export async function removeModFromVehicleItem(item, index){
  if (!game.user.isGM) return
  const mods = [...(item.system.vehiclesMod ?? [])]
  if (!mods[index]) return
  mods.splice(index, 1)
  return item.update({
    "system.vehiclesMod": mods
  })
}

/** Fit (or take off) a mod on a drone. A factory mod taken off is no longer one, but it was paid with the vehicle and
 *  stays free. The slots refusal, when there is one, is the item's (R5 p. 154): the update then leaves the mod as it was */
async function setFitted(mod, fitted){
  const updates = {
    "system.isActive": fitted
  }
  if (!fitted && isFactoryMod(mod)) Object.assign(updates, {
    "system.isFactory": false, "flags.sr5.isFactory": false, "flags.sr5.wasFactory": true
  })
  await mod.update(updates)
  return mod.system.isActive === fitted
}

/** The gamemaster's direct fitting or removal, from the workshop (Q7 of DjamZ) */
export async function fitModDirectly(mod, fitted){
  if (!game.user.isGM || !mod) return false
  return setFitted(mod, fitted)
}

/** Opened by "Install by the book" or "Remove by the book" on a mod of the workshop (R5 p. 153-154) */
export async function openModInstall(vehicle, mod, {
  removal = false
} = {
}){
  const mechanic = findRepairer(vehicle)
  if (!mechanic) return ui.notifications.warn(L("SR5.WARN_VehicleRepairNoMechanic"))
  //No slot or point left: refused before the hours of the extended test, not after (R5 p. 153-154, Lancelot E3)
  if (!removal) {
    const {
      modFitRefused
    } = await import("../entities/items/entityItem.js")
    if (modFitRefused(mod)) return
  }
  const category = sourceVehicleItem(vehicle)?.system?.category
  const defaultSkill = mechanicSkillFor({
    category, pilotSkill: vehicle.system.pilotSkill
  })
  const skillOptions = MECHANIC_SKILLS.map(k => `<option value="${k}" ${k === defaultSkill ? "selected" : ""}>${L(SR5.skills[k])}</option>`).join("")
  const required = mod.system.tools
  const toolOptions = ["none", ...TOOL_LEVELS].map(k => `<option value="${k}" ${k === (required || "none") ? "selected" : ""}>${L(k === "none" ? "SR5.VehicleModToolsNone" : SR5.vehicleModTools[k])}</option>`).join("")
  const threshold = Number(mod.system.threshold?.value) || 0
  const content = `<div class="sr5-vehicle-repair">
    <p>${game.i18n.format(removal ? "SR5.VehicleModRemoveIntro" : "SR5.VehicleModInstallIntro", {
    mod: mod.name, threshold: removal ? Math.max(1, Math.ceil(threshold / 2)) : Math.max(1, threshold),
    tools: required ? L(SR5.vehicleModTools[required]) : "—"
  })}</p>
    <div class="form-group"><label>${L("SR5.VehicleRepairMechanic")}</label><span>${mechanic.name}</span></div>
    <div class="form-group"><label>${L("SR5.Skill")}</label><select name="skillKey">${skillOptions}</select></div>
    <div class="form-group"><label>${L("SR5.VehicleModToolsAvailable")}</label><select name="availableTools">${toolOptions}</select></div>
    <p class="hint">${L("SR5.VehicleModInstallHint")}</p>
  </div>`
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: `${L(removal ? "SR5.VehicleModRemove" : "SR5.VehicleModInstall")}${L("SR5.Colons")} ${mod.name}`
    },
    content,
    ok: {
      label: L(removal ? "SR5.VehicleModRemove" : "SR5.VehicleModInstall"),
      callback: (event, button) => ({
        skillKey: button.form.elements.skillKey.value, availableTools: button.form.elements.availableTools.value
      }),
    },
    rejectClose: false,
  })
  if (!choice) return
  //SR5 p. 146-147: the Mechanic skills have no defaulting
  if (!(mechanic.system.skills?.[choice.skillKey]?.rating?.value > 0)) return ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairNoSkill", {
    actor: mechanic.name, skill: L(SR5.skills[choice.skillKey])
  }))
  return mechanic.rollTest("vehicleModInstall", {
    ...choice, vehicleUuid: vehicle.uuid, vehicleName: vehicle.name, modUuid: mod.uuid, modName: mod.name,
    threshold, tools: required, removal, specialSkill: mod.system.skill && !MECHANIC_SKILLS.includes(mod.system.skill) ? L(SR5.skills[mod.system.skill] ?? mod.system.skill) : "",
  })
}

/** The buttons of the chat card. A gamemaster or an owner of the vehicle changes the mod */
export async function applyVehicleModInstall(install, button){
  const mod = install?.modUuid ? await fromUuid(install.modUuid) : null
  if (!mod) {
    ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleModGone", {
      mod: install?.modName ?? ""
    }))
    return false
  }
  if (!mod.isOwner) {
    ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairNotOwner", {
      vehicle: install.vehicleName
    }))
    return false
  }
  //R5 p. 153: the parts of a critical glitch are lost for good
  if (button === "lostVehicleModParts") {
    await mod.delete()
    return true
  }
  const done = await setFitted(mod, button === "installVehicleMod")
  if (done) ui.notifications.info(game.i18n.format(button === "installVehicleMod" ? "SR5.INFO_VehicleModInstalled" : "SR5.INFO_VehicleModRemoved", {
    mod: mod.name, vehicle: install.vehicleName
  }))
  return done
}
