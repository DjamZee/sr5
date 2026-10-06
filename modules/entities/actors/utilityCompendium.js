import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5 
} from "../../config.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  isAlwaysActive
} from "../items/always-active.js"

export class SR5_CompendiumUtility extends Actor {

  /** Actor sub types already reported as arriving with nothing. */
  static _warnedEmptyBaseItems = new Set()

  static _warnedMissingCompendiums = new Set()
  static _compendiumCache = new Map()
  static _compendiumChoices = {
  }

  // Compendiums used to build actors: each one can be chosen by the GM in the system settings.
  // "auto" reads the Megapack first (megapack-sr5-foundry-vtt, every kind of item in one pack), then the
  // sr5-compendiums packs of the world language as a fallback (arbitrage de DjamZ, séance H, H18).
  // Items are recognized by their systemEffects (KEY_CATEGORIES), never by their name.
  static MEGAPACK = {
    module: "megapack-sr5-foundry-vtt", pack: "megapack-sr5-foundry-vtt.sr5-megapack-items"
  }

  // The systemEffect categories that name what an item gives an actor. A spirit or sprite power key is
  // given once: the first item found with it wins, so a power the Megapack holds twice is not doubled.
  static KEY_CATEGORIES = ["baseOwnItem", "spiritPower", "spritePower"]
  static UNIQUE_CATEGORIES = ["spiritPower", "spritePower"]

  // What the index must carry to choose the items without loading them
  static INDEX_FIELDS = ["type", "system.systemEffects", "system.source"]

  // The order in which a compendium's items are read, so that "first found" is never left to the order of the
  // ids: the core rulebook first (a supplement's namesake gives way to it: Arme naturelle, SR5 p. 396, before
  // Dard caudal, Howling Shadows p. 188), then by name, then by id
  static inKeyOrder(index) {
    const core = entry => (entry.system?.source === "core" ? 0 : 1)
    return [...index].sort((a, b) => core(a) - core(b) ||
      String(a.name ?? "").localeCompare(String(b.name ?? ""), "fr") || String(a._id).localeCompare(String(b._id)))
  }

  static CATEGORIES = {
    creaturePowers: {
      setting: "compendium.creaturePowers", itemType: "itemPower", defaults: ["powers-creatures"]
    },
    spritePowers: {
      setting: "compendium.spritePowers", itemType: "itemSpritePower", defaults: ["powers-sprites"]
    },
    baseWeapons: {
      setting: "compendium.baseWeapons", itemType: "itemWeapon", defaults: ["weapons-melee", "weapons-ranged"]
    },
  }

  static registerSettings() {
    for (const [key, category] of Object.entries(SR5_CompendiumUtility.CATEGORIES)) {
      const label = key.charAt(0).toUpperCase() + key.slice(1)
      game.settings.register("sr5", category.setting, {
        name: `SR5.SETTINGS_Compendium${label}_T`,
        hint: `SR5.SETTINGS_Compendium${label}_D`,
        scope: "world",
        config: true,
        type: String,
        default: "auto",
        // Filled on ready, once compendiums are available
        choices: SR5_CompendiumUtility._compendiumChoices,
        onChange: () => SR5_CompendiumUtility._compendiumCache.clear()
      })
    }
  }

  static refreshCompendiumChoices() {
    const choices = SR5_CompendiumUtility._compendiumChoices
    for (const key of Object.keys(choices)) delete choices[key]
    choices.auto = game.i18n.localize("SR5.SETTINGS.CompendiumAuto")
    for (const pack of game.packs.filter(p => p.documentName === "Item")) {
      choices[pack.collection] = `${pack.title} (${pack.collection})`
    }
    // Keep a saved choice selectable even if its compendium is no longer available
    for (const category of Object.values(SR5_CompendiumUtility.CATEGORIES)) {
      const value = game.settings.get("sr5", category.setting)
      if (!(value in choices)) choices[value] = game.i18n.format("SR5.SETTINGS.CompendiumMissing", {
        name: value
      })
    }
  }

  // The compendiums read for a category, in order: the first that provides a key wins
  static getCompendiumIds(categoryKey) {
    const category = SR5_CompendiumUtility.CATEGORIES[categoryKey]
    const chosen = game.settings.get("sr5", category.setting)
    if (chosen && chosen !== "auto") return [chosen]
    const ids = []
    const megapack = SR5_CompendiumUtility.MEGAPACK
    if (game.modules?.get(megapack.module)?.active) ids.push(megapack.pack)
    const language = game.settings.get("core", "language")
    if (!language) SR5_SystemHelpers.srLog(0, "Could not determine core language used in getCompendiumIds()")
    return ids.concat(category.defaults.map(name => `sr5-compendiums.${language}_${name}`))
  }

  //Get the items of a category from its configured compendium(s)
  //Return an array of items
  static async getCategoryItems(categoryKey) {
    // One actor creation asks for the same category several times: read the compendiums once
    const cached = SR5_CompendiumUtility._compendiumCache.get(categoryKey)
    if (cached && (Date.now() - cached.time < 10000)) return cached.documents

    const {
      itemType
    } = SR5_CompendiumUtility.CATEGORIES[categoryKey]
    const ids = SR5_CompendiumUtility.getCompendiumIds(categoryKey)
    const packs = ids.map(id => game.packs.get(id)).filter(Boolean)
    if (!packs.length) {
      // Tell the GM once per session: without it, actors are created without their base items/powers
      SR5_SystemHelpers.srLog(1, `No compendium among '${ids.join(", ")}' found, could not add items to actor`)
      SR5_CompendiumUtility.warnMissingCompendium(ids[0] ?? SR5_CompendiumUtility.MEGAPACK.pack)
      return []
    }

    const documents = []
    const provided = new Set()
    for (const [rank, pack] of packs.entries()) {
      // The Megapack holds every kind of item: read the index, load only the items that give something
      let index
      try {
        index = await pack.getIndex({
          fields: SR5_CompendiumUtility.INDEX_FIELDS
        })
      } catch (err) {
        SR5_SystemHelpers.srLog(1, `Compendium ${pack.collection} could not be indexed: ${err.message}`)
        continue
      }
      // Chosen on the index, then loaded in one request: one request per item took 26 s for the 85 creature powers
      // of a cold Megapack (measured), against half a second for the whole lot
      const chosen = []
      for (const entry of SR5_CompendiumUtility.inKeyOrder(index)) {
        if (entry.type !== itemType) continue
        const keys = SR5_CompendiumUtility.itemKeys(entry)
        if (!keys.length) continue
        // A fallback compendium only adds what the ones before it lack
        if (rank > 0 && keys.every(k => provided.has(k))) continue
        // A power is given once: first found wins
        if (keys.some(k => provided.has(k) && SR5_CompendiumUtility.UNIQUE_CATEGORIES.includes(k.split(":")[0]))) continue
        for (const k of keys) provided.add(k)
        chosen.push(entry._id)
      }
      if (!chosen.length) continue
      const loaded = new Map((await pack.getDocuments({
        _id__in: chosen
      })).map(d => [d.id ?? d._id, d]))
      for (const id of chosen) if (loaded.has(id)) documents.push(loaded.get(id))
    }
    SR5_CompendiumUtility._compendiumCache.set(categoryKey, {
      time: Date.now(), documents
    })
    return documents
  }

  //The data of an item given to a new spirit, sprite or creature: a power that is always active (always-active.js)
  //comes switched on (arbitrage de DjamZ, H39), so that its effects (Immunity, Armor, Toughness…) count without a click
  static givenItem(item) {
    const data = item.toObject(false)
    if (isAlwaysActive(data)) data.system.isActive = true
    return data
  }

  // The first spirit created after the world loads waited for the Megapack's index (more than 15 s, 4 900 items).
  // The active GM reads it once on ready, in the background: nothing waits for it
  static preloadIndexes() {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return null
    const ids = new Set(Object.keys(SR5_CompendiumUtility.CATEGORIES).flatMap(k => SR5_CompendiumUtility.getCompendiumIds(k)))
    const started = Date.now()
    return Promise.all([...ids].map(id => game.packs.get(id)?.getIndex({
      fields: SR5_CompendiumUtility.INDEX_FIELDS
    }).catch(() => null))).then(() => SR5_SystemHelpers.srLog(3, `Reference compendiums indexed in ${Date.now() - started} ms`))
  }

  //The "category:value" keys an item (or an index entry) carries in its systemEffects
  static itemKeys(item) {
    return Object.values(item.system?.systemEffects ?? {
    }).filter(e => SR5_CompendiumUtility.KEY_CATEGORIES.includes(e?.category) && e.value).map(e => `${e.category}:${e.value}`)
  }

  //Get base items
  static async getBaseItems(actorType, actorSubType, actorLevel) {
    let baseItems = []

    if (actorType === "actorPc" || actorType === "actorGrunt") {
      const weapons = await SR5_CompendiumUtility.getCategoryItems("baseWeapons")
      baseItems = await SR5_CompendiumUtility.findBaseItemInCompendium(baseItems, weapons, actorType)
    }

    if (actorType === "actorSpirit") {
      const weapons = await SR5_CompendiumUtility.getCategoryItems("baseWeapons")
      const powers = await SR5_CompendiumUtility.getCategoryItems("creaturePowers")
      // A custom type borrows the natural weapon of the type it is based on.
      const weaponType = SR5_SpiritTypes.baseType(actorSubType) || actorSubType
      baseItems = await SR5_CompendiumUtility.findBaseItemInCompendium(baseItems, weapons, weaponType)
      baseItems = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium(baseItems, powers, actorSubType)
      baseItems = await SR5_CompendiumUtility.modifyBaseSpiritWeapon(baseItems, actorLevel)
    }

    if (actorType === "actorSprite") {
      const spritePowers = await SR5_CompendiumUtility.getCategoryItems("spritePowers")
      baseItems = await SR5_CompendiumUtility.findBaseItemInCompendium(baseItems, spritePowers, actorSubType)
    }

    // A spirit or a sprite that comes with nothing at all is almost always a
    // missing or misdirected reference compendium, not a badly written type.
    // Nothing on screen used to say so.
    if (!baseItems.length && (actorType === "actorSpirit" || actorType === "actorSprite")) {
      SR5_CompendiumUtility.warnEmptyBaseItems(actorType, actorSubType)
    }

    return baseItems
  }

  /**
	 * Tell the game master, once per compendium, that a reference compendium
	 * could not be found. Players are not told: it is not theirs to fix.
	 */
  static warnMissingCompendium(compendiumName) {
    if (!game.user?.isGM) return
    if (SR5_CompendiumUtility._warnedMissingCompendiums.has(compendiumName)) return
    SR5_CompendiumUtility._warnedMissingCompendiums.add(compendiumName)
    ui.notifications.warn(game.i18n.format("SR5.WARN_MissingCompendium", {
      name: compendiumName
    }), {
      permanent: true
    })
  }

  /** Tell the game master, once per actor sub type, that nothing was found. */
  static warnEmptyBaseItems(actorType, actorSubType) {
    if (!game.user?.isGM) return
    const key = `${actorType}.${actorSubType}`
    if (SR5_CompendiumUtility._warnedEmptyBaseItems.has(key)) return
    SR5_CompendiumUtility._warnedEmptyBaseItems.add(key)
    ui.notifications.warn(game.i18n.localize("SR5.WARN_NoBaseItems"))
  }

  static async findBaseItemInCompendium(baseItems, compendium, actorType) {
    for (let i of compendium) {
      let systemEffects = i.system.systemEffects
      if (systemEffects.length) {
        for (let systemEffect of Object.values(systemEffects)) {
          if ((systemEffect.category === "baseOwnItem") && (systemEffect.value === actorType)) {
            let iObject = SR5_CompendiumUtility.givenItem(i)
            baseItems.push(iObject)
          }
        }
      }
    }
    return baseItems
  }

  //Modify weapons based on Force for Spirit
  static async modifyBaseSpiritWeapon(baseItems, force) {
    for (let i of baseItems) {
      if (i.type === "itemWeapon") {
        i.system.damageValue.base = force * 2
        i.system.armorPenetration.base = -force
        i.system.range.short.base = force
        i.system.range.medium.base = force * 2
        i.system.range.long.base = force * 3
        i.system.range.extreme.base = force * 4
      }
    }

    return baseItems
  }

  // Find base powers of a spirit
  static async findBaseSpiritPowersInCompendium(baseItems, compendium, spiritType) {
    let listName = `spiritBasePowers${spiritType}`
    let list
    for (let [key, value] of Object.entries(SR5)) {
      if (key === listName) list = value
    }
    if (!list) return baseItems

    for (let key of Object.keys(list)) {
      for (let i of compendium) {
        let systemEffects = i.system.systemEffects
        if (systemEffects.length) {
          for (let systemEffect of Object.values(systemEffects)) {
            if ((systemEffect.category === "spiritPower") && (systemEffect.value === key)) {
              let iObject = SR5_CompendiumUtility.givenItem(i)
              baseItems.push(iObject)
            }
          }
        }
      }
    }

    return baseItems
  }

  //Add optional powers to an array of existing powers based on an itemSpirit
  static async addOptionalSpiritPowersFromItem(baseItems, optionalPowers) {
    let powers = await SR5_CompendiumUtility.getCategoryItems("creaturePowers")

    for (let value of Object.values(optionalPowers)) {
      if (value) {
        for (let i of powers) {
          let systemEffects = i.system.systemEffects
          if (systemEffects.length) {
            for (let systemEffect of Object.values(systemEffects)) {
              if ((systemEffect.category === "spiritPower") && (systemEffect.value === value)) {
                let iObject = SR5_CompendiumUtility.givenItem(i)
                baseItems.push(iObject)
              }
            }
          }
        }
      }
    }

    return baseItems
  }

  //Add optional powers to an array of existing powers based on an itemSprite
  static async addOptionalSpritePowersFromItem(baseItems, optionalPowers) {
    //console.log("addOptionalSpritePowersFromItem ok !");
    //console.log("optionalPowers : " + JSON.stringify(optionalPowers));
    let powers = await SR5_CompendiumUtility.getCategoryItems("spritePowers")
    //console.log("powers : " + JSON.stringify(powers));

    for (let value of Object.values(optionalPowers)) {
      if (value) {
        for (let i of powers) {
          let systemEffects = i.system.systemEffects
          if (systemEffects.length) {
            for (let systemEffect of Object.values(systemEffects)) {
              if ((systemEffect.category === "spritePower") && (systemEffect.value === value)) {
                let iObject = SR5_CompendiumUtility.givenItem(i)
                baseItems.push(iObject)
              }
            }
          }
        }
      }
    }

    return baseItems
  }

  static async createItemFromArray(ItemArray) {
    let baseItems = []
    for (let i of ItemArray) {
      baseItems.push(i)
    }
    return baseItems
  }

  //Get a particular item from a particular compendium
  static async getWeaponFromCompendium(weapon, force) {
    let weapons = await SR5_CompendiumUtility.getCategoryItems("baseWeapons")
    for (let i of weapons) {
      let systemEffects = i.system.systemEffects
      if (systemEffects.length) {
        for (let systemEffect of Object.values(systemEffects)) {
          if (systemEffect.value === weapon) {
            let iObject = i.toObject(false)
            if (weapon === "corrosiveSpit") {
              iObject.system.damageValue.base = force * 2
              iObject.system.armorPenetration.base = -force
            }
            return iObject
          }
        }
      }
    }
  }
}