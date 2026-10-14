import {
  SR5
} from "../config.js"
import {
  SR5Shop
} from "../interface/shop.js"
import {
  SR5ShopCatalog
} from "../interface/shop-catalog.js"
import {
  SR5ShopVendor
} from "../interface/shop-vendor.js"
import {
  vendorTemplate, templateBanners
} from "../interface/shop-vendor-templates.js"
import {
  SR5_UtilityItem
} from "../entities/items/utilityItem.js"
import {
  refuseByRule
} from "./rule-locks.js"
import {
  TOOL_LEVELS
} from "./vehicle-workshop.js"
import {
  WORKSHOP_FAMILIES, workshopFamily, weaponSlots, slotLines, slotRefusal, accessorySlot, accessoryKind, toolsFor, installNeedsTest,
  capacityGauge, capacityRefusal, workshopTotals, DEFAULT_INSTALL
} from "./item-workshop.js"

// The Foundry side of an item's workshop (lot 12, C9; Armurerie, Personnalisation, Clinique, Établi): the tab of
// the item sheet, the drop of an accessory (bought at the shop's till, taken from the inventory, or fitted by the
// gamemaster), its removal, and the extended test that installs a weapon accessory in play (RG p. 67). The rules are
// in item-workshop.js. The accessories stay what the system has always made of them: copies of the actor's items in
// `system.accessory`, the item itself marked `isPlugged` (itemSheet.js, #onAccessoryChoice)

const L = k => game.i18n.localize(k)
const yen = n => `${(Number(n) || 0).toLocaleString()} ¥`
const availabilityLabel = (availability, legality) => availability || legality ? `${availability || ""}${legality ?? ""}` : "—"
const list = v => Array.isArray(v) ? v : Object.values(v ?? {
})

/** A weapon accessory waiting for its installation test (RG p. 67): inactive until the test is over */
export function installPending(item) {
  return item?.flags?.sr5?.installPending === true
}

/** The price of a part on this host: a weapon accessory priced as a multiple of the weapon's price (a modification,
 *  utilityItem.js _handleItemBasedWeaponAccessory) costs that multiple of this weapon's base price, else its own */
export function priceOnHost(source, host) {
  const multiplier = Number(source?.system?.weaponAccessory?.priceMultiplier) || 0
  if (host?.type === "itemWeapon" && multiplier > 0) return multiplier * (Number(host.system?.price?.base) || 0)
  return SR5ShopCatalog.describe(source).price
}

/** Whether an item of the inventory fits this host as an accessory, as the "+" of the accessory list chooses them */
export function fitsAsAccessory(host, item) {
  const s = item?.system ?? {
  }
  if (item.id && item.id === host.id) return false
  // A weapon accessory is one by its category; the other accessories are marked
  if (host.type === "itemWeapon") return item.type === "itemWeapon" && s.category === "weaponAccessory"
  if (!s.isAccessory) return false
  switch (host.type) {
    case "itemArmor": return item.type === "itemArmor" || item.type === "itemGear"
    default: return item.type === host.type
  }
}

/** The Capacity an accessory takes, on the actor's live item when there is one (its prepared value) */
function capacityOf(entry, live) {
  return Number(live?.system?.capacityTaken?.value ?? entry?.system?.capacityTaken?.value) || 0
}

/** The banner of a workshop: the first of a vendor template in the banner folder (the Megapack's), else none. Used by
 *  the item workshops, the vehicles' Atelier ("tuner") and the dealership ("ordinaryCars", "droneDealer") */
export async function vendorBanner(templateKey) {
  const template = vendorTemplate(templateKey)
  const folder = SR5ShopVendor.bannerFolder
  if (!template || !folder) return ""
  try {
    const files = await SR5ShopVendor.bannerFiles()
    if (files.length) return templateBanners(template, files)[0] ?? ""
  } catch {
    // A player may not browse the folder: the first banner by its usual name below
  }
  // The template's first banner as the Megapack names them ("Prefix-1", or "Prefix 1" for a name with spaces); the
  // picture hides itself when it is not there
  return `${folder}/${template.banners}${template.banners.includes(" ") ? " " : "-"}1.webp`
}

/** The data the "Workshop" tab renders */
export async function itemWorkshopContext(item) {
  const family = workshopFamily(item)
  if (!family) return null
  const f = WORKSHOP_FAMILIES[family]
  const actor = item.actor ?? null
  const s = item.system
  // A catalogue entry (the old form of a weapon accessory) is named by its key: shown by its label
  const entries = list(s.accessory).filter(a => a && typeof a === "object").map(a => a.system ? a : {
    ...a, key: a.name, name: L(SR5.weaponAccessories?.[a.name] ?? a.name ?? "")
  })
  const creation = !!actor && SR5Shop.creationModeFor(actor)
  const rows = entries.map((a, index) => {
    const live = actor?.items?.get(a._id) ?? null
    const d = live ? SR5ShopCatalog.describe(live) : {
      price: Number(a.price) || 0, availability: 0, legality: ""
    }
    const slot = accessorySlot(a)
    return {
      index, id: a._id ?? "", name: a.name, img: live?.img ?? a.img ?? "",
      slot: slot ? L(SR5.weaponAccessorySlots[slot] ?? slot) : "",
      kind: family === "weapon" ? L(SR5.weaponAccessoryTypes[accessoryKind(a)] ?? "") : "",
      capacity: family === "weapon" ? 0 : capacityOf(a, live),
      // A weapon's accessory is priced on the weapon (its multiplier reads the weapon's price, utilityItem.js)
      price: family === "weapon" ? (Number(a.price) || 0) : d.price,
      availability: d.availability, legality: d.legality, free: a.isFree === true,
      pending: installPending(live), needsTest: family === "weapon" && installNeedsTest(a),
      tools: family === "weapon" ? L(SR5.vehicleModTools[toolsFor(a)]) : "",
    }
  })
  const described = SR5ShopCatalog.describe(item)
  const totals = workshopTotals({
    price: described.price, availability: described.availability, legality: described.legality
  }, rows, {
    hostIncludes: family === "weapon"
  })
  const inventory = actor ? actor.items.filter(i => fitsAsAccessory(item, i) && !i.system.isPlugged).map(i => ({
    id: i.id, name: i.name, img: i.img
  })) : []
  return {
    family, label: L(f.label), icon: f.icon, banner: await vendorBanner(f.banner),
    owned: !!actor, canEdit: item.isOwner && !!actor, creation, isGM: game.user.isGM,
    slots: family === "weapon" ? slotLines(s.type, entries).map(l => ({
      ...l, label: L(SR5.weaponAccessorySlots[l.key])
    })) : null,
    // RG p. 67: the special weapons' slots are the gamemaster's; so are a bow's and a crossbow's (SR5 p. 419)
    gmSlots: family === "weapon" && weaponSlots(s.type) === null,
    capacity: family === "weapon" ? null : capacityGauge(s.capacity?.value, rows.map(r => r.capacity)),
    rows, inventory,
    totals: {
      hostLabel: yen(totals.host), accessoriesLabel: yen(totals.accessories), totalLabel: yen(totals.total),
      availability: availabilityLabel(totals.availability, totals.legality),
    },
    balanceLabel: actor && !creation ? yen(SR5Shop.balance(actor)) : "",
  }
}

/** Why an accessory cannot go on this host, warned: true when the rule locks stop it (lot B13) */
function mountRefused(host, accessory) {
  const family = workshopFamily(host)
  const entries = list(host.system.accessory).filter(a => a && typeof a === "object")
  if (family === "weapon") {
    const refusal = slotRefusal(host.system.type, entries, accessory)
    if (!refusal) return false
    // A trait comes with the weapon from the factory: never added afterwards (RG p. 67), whatever the locks
    if (refusal === "trait") {
      ui.notifications.warn(game.i18n.format("SR5.WARN_ItemWorkshopTrait", {
        name: accessory.name
      }))
      return true
    }
    return refuseByRule("objects", `SR5.WARN_ItemWorkshop_${refusal}`, {
      name: accessory.name, weapon: host.name, slot: L(SR5.weaponAccessorySlots[accessorySlot(accessory)] ?? "")
    })
  }
  const taken = entries.map(a => capacityOf(a, host.actor?.items?.get(a._id)))
  const refusal = capacityRefusal(host.system.capacity?.value, taken, accessory.system?.capacityTaken?.value)
  return !!refusal && refuseByRule("objects", "SR5.WARN_ItemWorkshopCapacity", {
    name: accessory.name, host: host.name, needed: refusal.needed, free: refusal.free
  })
}

/** Put one of the actor's items on the host, as the "+" of the accessory list does. A weapon accessory that asks for
 *  the test of RG p. 67 waits for it, inactive, in play; at creation it is fitted at once, the test only shown */
export async function mountAccessory(host, accessory, {
  direct = false, checked = false
} = {
}) {
  if (!host.isOwner || accessory?.parent?.id !== host.actor?.id) return false
  //`checked`: refused or allowed on the source already, before the payment
  if (!checked && mountRefused(host, accessory)) return false
  //`direct`: the gamemaster's fitting, without the test (as on a vehicle, Q7 of DjamZ)
  const pending = !direct && workshopFamily(host) === "weapon" && installNeedsTest(accessory) && !SR5Shop.creationModeFor(host.actor)
  const copy = accessory.toObject()
  copy.isActive = !pending
  copy.isFree = false
  const mounted = foundry.utils.deepClone(list(host.system.accessory))
  mounted.push(copy)
  await host.update({
    "system.accessory": mounted
  })
  await accessory.update({
    "system.isActive": pending ? false : host.system.isActive,
    "system.wirelessTurnedOn": host.system.wirelessTurnedOn,
    "system.isPlugged": true,
    "flags.sr5.installPending": pending,
  })
  if (pending) ui.notifications.info(game.i18n.format("SR5.INFO_ItemWorkshopPending", {
    name: accessory.name, weapon: host.name
  }))
  return true
}

/** Take an accessory off: back in the inventory, free to be put elsewhere */
export async function removeAccessory(host, index) {
  if (!host.isOwner) return false
  const mounted = foundry.utils.deepClone(list(host.system.accessory))
  const [gone] = mounted.splice(index, 1)
  if (!gone) return false
  await host.update({
    "system.accessory": mounted
  })
  const live = host.actor?.items?.get(gone._id)
  if (live && installPending(live)) await live.update({
    "flags.sr5.installPending": false
  })
  if (gone._id) await SR5_UtilityItem.unplugRemovedAccessory(host.actor, gone._id)
  return true
}

/** The shop of the tab's button, on the family's shelf, for the carrier of the item */
export function openItemWorkshopShop(host) {
  const f = WORKSHOP_FAMILIES[workshopFamily(host)]
  if (!f) return
  game.sr5?.shop?.open({
    actor: host.actor ?? null, shelf: f.shelf, sub: f.sub
  })
}

/** An item dropped on the tab: one of the inventory is put on at once; one of a compendium is bought at the shop's
 *  till then put on, or fitted by the gamemaster without payment */
export async function dropOnItemWorkshop(host, dropData) {
  if (dropData?.type !== "Item" || !dropData.uuid) return false
  const actor = host.actor
  if (!actor) return ui.notifications.warn(L("SR5.WARN_ItemWorkshopNotOwned"))
  if (!host.isOwner) return ui.notifications.warn(L("SR5.WARN_ShopNotOwner"))
  const source = await fromUuid(dropData.uuid)
  if (!source) return false
  if (source.parent?.id === actor.id) {
    if (!fitsAsAccessory(host, source)) return ui.notifications.warn(game.i18n.format("SR5.WARN_ItemWorkshopNotAccessory", {
      name: source.name, host: host.name
    }))
    if (source.system.isPlugged) return ui.notifications.warn(game.i18n.format("SR5.WARN_ItemWorkshopPlugged", {
      name: source.name
    }))
    return mountAccessory(host, source)
  }
  // Checked on the source before any payment: the slot, the trait, the Capacity
  const probe = {
    name: source.name, type: source.type, system: source.system, toObject: () => source.toObject()
  }
  if (!fitsAsAccessory(host, {
    ...probe, id: null
  })) return ui.notifications.warn(game.i18n.format("SR5.WARN_ItemWorkshopNotAccessory", {
    name: source.name, host: host.name
  }))
  if (mountRefused(host, probe)) return false

  const d = {
    ...SR5ShopCatalog.describe(source), price: priceOnHost(source, host)
  }
  const creation = SR5Shop.creationModeFor(actor)
  const buttons = []
  if (source.pack || !source.parent) buttons.push({
    action: "buy", label: creation ? L("SR5.ItemWorkshopTake") : game.i18n.format("SR5.ItemWorkshopBuy", {
      price: yen(d.price)
    }), default: true
  })
  if (game.user.isGM) buttons.push({
    action: "fit", label: L("SR5.ItemWorkshopFit")
  })
  if (!buttons.length) return false
  buttons.push({
    action: "cancel", label: L("SR5.Cancel")
  })
  const family = workshopFamily(host)
  const test = family === "weapon" ? (installNeedsTest(probe) ? game.i18n.format("SR5.ItemWorkshopTestHint", {
    tools: L(SR5.vehicleModTools[toolsFor(probe)])
  }) : L("SR5.ItemWorkshopNoTestHint")) : ""
  const content = `<div class="sr5-item-workshop-drop">
    <p><strong>${source.name}</strong></p>
    <ul>
      <li>${L("SR5.Price")}${L("SR5.Colons")} ${yen(d.price)} · ${L("SR5.AvailabilityShort")} ${availabilityLabel(d.availability, d.legality)}</li>
      ${family === "weapon" ? `<li>${L("SR5.WeaponSlot")}${L("SR5.Colons")} ${accessorySlot(probe) ? L(SR5.weaponAccessorySlots[accessorySlot(probe)]) : "—"}</li>` :
    `<li>${L("SR5.Capacity")}${L("SR5.Colons")} ${Number(source.system.capacityTaken?.value) || 0}</li>`}
      ${creation ? "" : `<li>${game.i18n.format("SR5.VehicleModWorkshopBuyer", {
    buyer: actor.name, balance: yen(SR5Shop.balance(actor))
  })}</li>`}
    </ul>
    ${test ? `<p class="hint">${creation ? L("SR5.ItemWorkshopCreationHint") : test}</p>` : ""}
  </div>`
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: `${L(WORKSHOP_FAMILIES[family].label)}${L("SR5.Colons")} ${host.name}`
    },
    content, buttons, rejectClose: false,
  })
  if (!choice || choice === "cancel") return false

  const before = new Set(actor.items.map(i => i.id))
  if (choice === "buy") {
    const done = await SR5Shop.checkout(actor, [{
      uuid: source.uuid, quantity: 1, name: source.name
    }], {
      // Priced on this weapon when its price is a multiple of the weapon's (the till's own option, as for a vehicle mod)
      priceOn: s => priceOnHost(s, host)
    })
    if (!done) return false
  } else {
    //The gamemaster's direct fitting: no payment, no test (as on a vehicle, Q7 of DjamZ)
    const data = source.toObject()
    delete data._id
    await actor.createEmbeddedDocuments("Item", [data])
  }
  // The item the till or the gamemaster just added; none when the purchase went to a delayed order (SR5 p. 420)
  const added = actor.items.find(i => !before.has(i.id) && i.name === source.name && fitsAsAccessory(host, i))
  if (!added) return ui.notifications.info(game.i18n.format("SR5.INFO_ItemWorkshopOrdered", {
    name: source.name
  }))
  return mountAccessory(host, added, {
    direct: choice === "fit", checked: true
  })
}

/** "Install" on a weapon accessory waiting for it: the extended Armorer + Logic [Mental] test of RG p. 67 */
export async function openAccessoryInstall(host, index) {
  const entry = list(host.system.accessory)[index]
  const accessory = host.actor?.items?.get(entry?._id)
  if (!accessory) return
  const actor = host.actor
  if (!(actor.system.skills?.armorer?.rating?.value > 0)) return ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleRepairNoSkill", {
    actor: actor.name, skill: L(SR5.skills.armorer)
  }))
  const required = toolsFor(entry)
  const toolOptions = ["none", ...TOOL_LEVELS].map(k => `<option value="${k}" ${k === required ? "selected" : ""}>${L(k === "none" ? "SR5.VehicleModToolsNone" : SR5.vehicleModTools[k])}</option>`).join("")
  const intervals = ["minute", "hour", "day"].map(k => `<option value="${k}" ${k === DEFAULT_INSTALL.interval ? "selected" : ""}>${L(SR5.extendedIntervals?.[k] ?? k)}</option>`).join("")
  const content = `<div class="sr5-vehicle-repair">
    <p>${game.i18n.format("SR5.ItemWorkshopInstallIntro", {
    name: accessory.name, weapon: host.name, tools: L(SR5.vehicleModTools[required])
  })}</p>
    <div class="form-group"><label>${L("SR5.Threshold")}</label><input type="number" name="threshold" min="1" value="${DEFAULT_INSTALL.threshold}"></div>
    <div class="form-group"><label>${L("SR5.Interval")}</label><select name="interval">${intervals}</select></div>
    <div class="form-group"><label>${L("SR5.VehicleModToolsAvailable")}</label><select name="availableTools">${toolOptions}</select></div>
    <p class="hint">${L("SR5.ItemWorkshopInstallHint")}</p>
  </div>`
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: `${L("SR5.ItemWorkshopInstall")}${L("SR5.Colons")} ${accessory.name}`
    },
    content,
    ok: {
      label: L("SR5.ItemWorkshopInstall"),
      callback: (event, button) => ({
        threshold: Math.max(1, Math.floor(Number(button.form.elements.threshold.value) || 1)),
        interval: button.form.elements.interval.value, availableTools: button.form.elements.availableTools.value,
      }),
    },
    rejectClose: false,
  })
  if (!choice) return
  return actor.rollTest("accessoryInstall", {
    ...choice, tools: required, hostUuid: host.uuid, hostName: host.name, accessoryUuid: accessory.uuid, accessoryName: accessory.name,
  })
}

/** The card's button once the threshold is reached: the accessory works, on the weapon it was put on */
export async function applyAccessoryInstall(install) {
  const accessory = install?.accessoryUuid ? await fromUuid(install.accessoryUuid) : null
  const host = install?.hostUuid ? await fromUuid(install.hostUuid) : null
  if (!accessory || !host) {
    ui.notifications.warn(game.i18n.format("SR5.WARN_VehicleModGone", {
      mod: install?.accessoryName ?? ""
    }))
    return false
  }
  if (!accessory.isOwner) {
    ui.notifications.warn(L("SR5.WARN_ShopNotOwner"))
    return false
  }
  await accessory.update({
    "system.isActive": host.system.isActive, "flags.sr5.installPending": false
  })
  ui.notifications.info(game.i18n.format("SR5.INFO_ItemWorkshopInstalled", {
    name: accessory.name, weapon: host.name
  }))
  return true
}
