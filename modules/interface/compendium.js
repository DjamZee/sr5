import {
  SR5 
} from "../config.js"
import {
  SR5_SystemHelpers 
} from "../system/utilitySystem.js"

// The fields the line under each entry reads, fetched once with the pack's index (lot 34). One getDocument per
// entry was one server request per entry, and the server answers each by reading the whole pack: the Megapack's
// 5047 objects kept it busy about 8 minutes on the first opening.
export const COMPENDIUM_INFO_FIELDS = [
  "system.category", "system.type", "system.isAccessory", "system.armorValue.base", "system.deviceRating",
  "system.karmaCost", "system.sheetPreferences.tabBiography.critterBiography", "system.critterBiography.terrain",
]

export class SR5CompendiumInfo {
  static async onRenderCompendium(compendium, html, _compendiumData) {
    const pack = compendium.collection
    if (pack.metadata.system === "sr5") {
      const index = await pack.getIndex({
        fields: COMPENDIUM_INFO_FIELDS
      })
      html.querySelectorAll('.directory-item').forEach(el => {
        SR5CompendiumInfo.selectInfo(pack, index, el)
      })
    }
  }

  static selectInfo(pack, index, element){
    let itemId = element.dataset.documentId ?? element.dataset.entryId
    if (!itemId) {
      SR5_SystemHelpers.srLog(1, `Compendium selectInfo: element has no documentId or entryId in pack "${pack.metadata.label}" (${pack.metadata.id})`)
      return
    }
    // An index entry: the source data, which is all the line needs
    let item = index.get(itemId)
    if (!item) {
      SR5_SystemHelpers.srLog(1, `Compendium selectInfo: no index entry "${itemId}" in pack "${pack.metadata.label}" (${pack.metadata.id})`)
      return
    }
    let info

    switch (item.type){
      case "itemWeapon":
        if (item.system.category === "grenade") info = game.i18n.localize('SR5.Grenade')
        else info = game.i18n.localize(SR5.allWeaponsTypes[item.system.type])
        break
      case "itemArmor":
        if (item.system.isAccessory) info = game.i18n.localize('SR5.ArmorAccessory')
        else info = `${game.i18n.localize('SR5.ArmorRating')}${game.i18n.localize('SR5.Colons')} ${item.system.armorValue?.base ?? 0}`
        break
      case "itemDevice":
        info = `${game.i18n.localize(SR5.deckTypes[item.system.type])} (${item.system.deviceRating})`
        break
      case "itemAugmentation":
        info = `${game.i18n.localize(SR5.augmentationTypes[item.system.type])}`
        break
      case "itemProgram":
        info = `${game.i18n.localize(SR5.programTypes[item.system.type])}`
        break
      case "itemSpell":
        info = `${game.i18n.localize(SR5.spellCategories[item.system.category])}`
        break
      case "itemQuality":
        info = `${game.i18n.localize('SR5.KarmaCost')}${game.i18n.localize('SR5.Colons')} ${item.system.karmaCost}`
        break
      case "itemVehicle":
        info = `${game.i18n.localize(SR5.vehiclesCategories[item.system.category])}`
        break
      case "itemVehicleMod":
        info = `${game.i18n.localize(SR5.vehicleModType[item.system.type])}`
        break
      case "actorPc":
        if (item.system.sheetPreferences?.tabBiography?.critterBiography && item.system.critterBiography?.terrain) {
          info = `${game.i18n.localize('SR5.CritterTerrain')}${game.i18n.localize('SR5.Colons')} ${item.system.critterBiography.terrain}`
        }
        else info = ""
        break
      default:
        info = ""
    }
    if (info !== "") SR5CompendiumInfo.insertInfo(element, info)
  }

  static async insertInfo(element, info){
    element.children[1].insertAdjacentHTML('afterend', `<div class="grid SR-CompendiumSubType"><div class="col-12">${info}</div></div>`)
  }
}