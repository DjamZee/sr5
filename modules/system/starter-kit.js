// Starting kit of a player character (relecture djamz.13, R8; décision d'Élise du 15/10 sur la demande de DjamZ):
// a backpack and a locker to store gear in, and a standard credstick. Run Faster p. 222-223 puts a backpack (20 ¥)
// and a standard credstick in every runner pack; the standard credstick costs 5 ¥ and holds 5 000 ¥ at most
// (SR5 p. 443). The locker is the table's convenience, a storage of the Stash kind.
// Given once, when a player character is created (by hand, from a compendium, from a JSON file, by the Concepteur),
// by the active gamemaster alone; never to the actors already in the world. World setting "Starting kit", on by default.

export const STARTER_KIT_SETTING = "sr5StarterKit"

/** The credstick of the kit: empty, certified up to 5 000 ¥ (SR5 p. 443). */
export const STARTER_CREDSTICK_MAX = 5000

/**
 * What the kit adds to an actor just created: only what it lacks, so that an actor that brings its own backpack,
 * stash or credstick (a copy, the Concepteur's packs) never gets a second one.
 * @param {string} actorType
 * @param {{type: string, system?: object}[]} items  the items the actor was created with
 * @param {boolean} enabled  the world setting
 * @param {(key: string) => string} localize
 * @returns {object[]} item data to create
 */
export function starterKitPlan(actorType, items, enabled, localize = key => key) {
  if (!enabled || actorType !== "actorPc") return []
  const list = [...(items ?? [])]
  const hasStorage = kind => list.some(i => i?.type === "itemStorage" && i.system?.type === kind)
  const hasCredstick = list.some(i => i?.type === "itemGear" && i.system?.isCredstick)
  const plan = []
  if (!hasStorage("backpack")) plan.push({
    name: localize("SR5.StarterKit_Backpack"), type: "itemStorage",
    system: {
      type: "backpack", price: {
        base: 20
      }, source: "runFaster", page: "222"
    },
  })
  if (!hasStorage("stash")) plan.push({
    name: localize("SR5.StarterKit_Locker"), type: "itemStorage",
    system: {
      type: "stash"
    },
  })
  if (!hasCredstick) plan.push({
    name: localize("SR5.StarterKit_Credstick"), type: "itemGear",
    img: "systems/sr5/assets/img/items/itemNuyen.svg",
    system: {
      isCredstick: true, funds: {
        value: 0, max: STARTER_CREDSTICK_MAX
      }, price: {
        base: 5
      }, source: "core", page: "443"
    },
  })
  return plan
}

export function registerStarterKitSetting() {
  game.settings.register("sr5", STARTER_KIT_SETTING, {
    name: "SR5.SETTINGS_StarterKit_T",
    hint: "SR5.SETTINGS_StarterKit_D",
    scope: "world", config: true, default: true, type: Boolean,
  })
}

const given = new Set()

/** The active gamemaster gives the kit to a player character just created in the world. */
export async function giveStarterKit(actor) {
  if (!game.users?.activeGM?.isSelf || !actor || actor.isToken || actor.pack || given.has(actor.id)) return
  const plan = starterKitPlan(actor.type, actor.items?.contents ?? [...(actor.items ?? [])],
    game.settings.get("sr5", STARTER_KIT_SETTING), key => game.i18n.localize(key))
  if (!plan.length) return
  given.add(actor.id)
  await actor.createEmbeddedDocuments("Item", plan)
}

export function initStarterKit() {
  Hooks.on("createActor", actor => giveStarterKit(actor).catch(err => console.error("SR5 | starting kit not given", err)))
}
