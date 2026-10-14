import {
  SR5
} from "../../config.js"
import {
  SR5_CompendiumUtility
} from "./utilityCompendium.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  insectRacePowers
} from "../items/insect-races.js"

// A race chosen (or changed) on an insect spirit's sheet: the powers of the former race go, those of the new one come,
// and a caste power the former race took away comes back (Dark Terrors p. 22-34). Done by the client that made the
// change, which owns the actor.
async function syncInsectRace(actor, changes, userId) {
  if (actor.type !== "actorSpirit" || userId !== game.user.id) return
  if (changes.system?.insectRace === undefined) return
  const baseType = SR5_SpiritTypes.baseType(actor.system.type) || actor.system.type
  const race = actor.system.insectRace
  const powers = await SR5_CompendiumUtility.getCategoryItems("creaturePowers")

  const keysOf = item => SR5_CompendiumUtility.spiritPowerKeys(item)
  const {
    removed 
  } = insectRacePowers(baseType, race)
  const toDelete = actor.items.filter(i => i.flags?.sr5?.insectRace || (i.type === "itemPower" && keysOf(i).some(k => removed.includes(k))))
    .map(i => i.id)

  // Caste powers to bring back: the official list of the caste, less what this race takes away
  const casteKeys = Object.keys(SR5[`spiritBasePowers${baseType}`] ?? {
  }).filter(k => !removed.includes(k))
  const kept = actor.items.filter(i => !toDelete.includes(i.id))
  const owned = new Set(kept.flatMap(i => keysOf(i)))
  const toCreate = []
  for (const key of casteKeys) {
    if (owned.has(key)) continue
    const found = powers.find(i => keysOf(i).includes(key))
    if (found) {
      toCreate.push(SR5_CompendiumUtility.givenItem(found))
      owned.add(key)
    }
  }
  for (const item of SR5_CompendiumUtility.insectRacePowerItems(powers, baseType, race)) {
    if (keysOf(item).some(k => owned.has(k))) continue
    toCreate.push(item)
  }
  if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete)
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate)
}

export function registerInsectRaceHooks() {
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    syncInsectRace(actor, changes, userId).catch(e => SR5_SystemHelpers.srLog(1, `Insect race not applied: ${e}`))
  })
}
