import {
  SR5
} from "../../config.js"

/**
 * Toxins as data (SR5 p. 409-412).
 *
 * A profile is { vector: [], speed, power, powerMagic, penetration, penetrationMagic, effect: [], damageType, special }.
 * powerMagic / penetrationMagic multiply the Magic of the weapon's owner (creature powers, SR5 p. 403):
 * when one is set, the toxin cannot be resolved without an actor.
 */
export class SR5_Toxins {

  /** The hard-coded toxins of the books, kept as the fallback for system.toxin.type */
  static BOOK = {
    airEngulf:          {
      vector: ["inhalation"], speed: 0, powerMagic: 2, penetrationMagic: -1, damageType: "stun" 
    },
    noxiousBreath:      {
      vector: ["inhalation"], speed: 0, powerMagic: 1, effect: ["nausea"], damageType: "stun" 
    },
    gamma:              {
      vector: ["injection"], speed: 0, power: 12, effect: ["paralysis"], damageType: null, special: "SR5.ToxinGammaTruthSerum"
    },
    csTearGas:          {
      vector: ["contact", "inhalation"], speed: 1, power: 8, effect: ["disorientation", "nausea"], damageType: "stun" 
    },
    pepperPunch:        {
      vector: ["contact", "inhalation"], speed: 1, power: 11, effect: ["nausea"], damageType: "stun" 
    },
    nauseaGas:          {
      vector: ["inhalation"], speed: 3, power: 9, effect: ["disorientation", "nausea"], damageType: null 
    },
    narcoject:          {
      vector: ["injection"], speed: 0, power: 15, damageType: "stun" 
    },
    neuroStunHeight:    {
      vector: ["contact", "inhalation"], speed: 1, power: 15, effect: ["disorientation"], damageType: "stun" 
    },
    neuroStunNine:      {
      vector: ["contact", "inhalation"], speed: 1, power: 15, effect: ["disorientation"], damageType: "stun" 
    },
    neuroStunTen:       {
      vector: ["contact", "inhalation"], speed: 1, power: 15, penetration: -2, effect: ["disorientation"], damageType: "stun" 
    },
    seven:              {
      vector: ["contact", "inhalation"], speed: 1, power: 12, penetration: -2, effect: ["disorientation", "nausea"], damageType: "physical" 
    },
    deathrattleVenom:   {
      vector: ["contact", "injection"], speed: 1, power: 10, penetration: -3, effect: ["disorientation", "nausea", "agony"], damageType: "physical" 
    },
    nagaVenom:          {
      vector: ["injection"], speed: 0, power: 8, damageType: "physical" 
    },
    novaScorpionVenom:  {
      vector: ["injection"], speed: 1, power: 12, penetration: -2, effect: ["nausea"], damageType: "physical" 
    },
    martichorasVenom:   {
      vector: ["injection"], speed: 1, power: 9, penetration: -2, effect: ["disorientation", "nausea"], damageType: "physical" 
    },
    snakeVenom:         {
      vector: ["injection"], speed: 1, power: 8, effect: ["nausea"], damageType: "physical" 
    },
    snowSnakeVenom:     {
      vector: ["injection"], speed: 1, power: 8, penetration: -1, effect: ["nausea", "disorientation"], damageType: "physical" 
    },
    spiderBeastVenom:   {
      vector: ["injection"], speed: 0, power: 6, penetration: -4, effect: ["nausea", "disorientation", "paralysis"], damageType: "physical" 
    },
    glowRatVenom:       {
      vector: ["contact"], speed: 0, power: 10, penetration: -6, effect: ["disorientation", "nausea", "agony"], damageType: "stun" 
    },
    flatwormViperVenom: {
      vector: ["injection"], speed: 2, power: 12, damageType: "physical" 
    },
    iridescentOwlVenom: {
      vector: ["contact", "injection"], speed: 0, power: 8, penetration: -6, effect: ["disorientation", "nausea", "agony"], damageType: "stun" 
    },
    kokoroCobraVenom:   {
      vector: ["contact", "injection"], speed: 0, power: 12, penetration: -6, effect: ["disorientation", "nausea", "agony"], damageType: "physical" 
    },
    montaukVenom:       {
      vector: ["injection"], speed: 1, power: 6, effect: ["nausea"], damageType: "physical" 
    },
    voidWaspVenom:      {
      vector: ["injection"], speed: 3, power: 10, penetration: -4, effect: ["arcaneInhibitor"], damageType: "stun" 
    },
    //Better Than Bad p. 141: cuts an Awakened from the manasphere
    blight:             {
      vector: ["injection"], speed: 0, power: 12, effect: ["manasphereCut"], damageType: null, special: "SR5.ToxinBlightSpecial"
    },
    //With DMSO it gains the contact vector, and the Awakened resist it with their Drain resistance
    blightDmso:         {
      vector: ["contact", "injection"], speed: 0, power: 12, effect: ["manasphereCut"], damageType: "stun", special: "SR5.ToxinBlightDmsoSpecial"
    },
  }

  /** Book toxins that are not substances a GM would hand out as an item */
  static NOT_AN_ITEM = ["airEngulf"]

  /** The profile a weapon's toxin resolves to: a dropped toxin item first, the book table otherwise */
  static profileOf(toxin) {
    if (toxin?.type === "custom") return toxin.custom ?? null
    return SR5_Toxins.BOOK[toxin?.type] ?? null
  }

  /**
   * Write a profile onto a weapon's toxin (derived data).
   * @returns {boolean} false when the profile needs a Magic value that is missing
   */
  static apply(toxin, profile, magic) {
    if (!profile) return false
    const needsMagic = profile.powerMagic || profile.penetrationMagic
    if (needsMagic && magic === undefined) return false
    const vectors = profile.vector ?? []
    const effects = profile.effect ?? []
    for (const key of Object.keys(SR5.propagationVectors)) toxin.vector[key] = vectors.includes(key)
    for (const key of Object.keys(SR5.toxinEffects)) toxin.effect[key] = effects.includes(key)
    toxin.speed = Number(profile.speed) || 0
    toxin.power = profile.powerMagic ? magic * profile.powerMagic : (Number(profile.power) || 0)
    toxin.penetration = profile.penetrationMagic ? magic * profile.penetrationMagic : (Number(profile.penetration) || 0)
    toxin.damageType = profile.damageType || null
    return true
  }

  /** The profile copied onto a weapon when a toxin item is dropped on it */
  static profileFromItem(item) {
    const system = item.system
    const keys = (obj, table) => Object.keys(table).filter(key => obj?.[key])
    return {
      name: item.name,
      uuid: item.uuid ?? "",
      vector: keys(system.vector, SR5.propagationVectors),
      speed: Number(system.speed) || 0,
      power: Number(system.power) || 0,
      powerMagic: system.powerFromMagic ? 1 : 0,
      penetration: Number(system.penetration) || 0,
      penetrationMagic: 0,
      effect: keys(system.effect, SR5.toxinEffects),
      damageType: system.damageType || null,
      special: system.special ?? "",
    }
  }

  /**
   * The antitoxin rating of a character. CF p. 154 ne tranche pas le cumul ; on retient le plus
   * haut indice, comme les autres bonus de SR5 (arbitrage de DjamZ)
   */
  static antitoxinRating(actorData) {
    const modifiers = actorData?.specialProperties?.antitoxin?.modifiers ?? []
    return Math.max(0, ...modifiers.map(m => Number(m.value) || 0))
  }

  /**
   * What makes a character immune to a vector (SR5 p. 409-410 and 439): the gas mask against inhalation, the
   * chemical seal against contact and inhalation, as long as the item is active (the GM unticks it once the
   * hour is over or the seal is damaged). Also used for pathogens (SR5 p. 410 table). Names of the sources, or [].
   */
  static immunitySources(actorData, vector) {
    const key = {
      contact: "toxinImmunityContact", inhalation: "toxinImmunityInhalation" 
    }[vector]
    const modifiers = key ? (actorData?.specialProperties?.[key]?.modifiers ?? []) : []
    return modifiers.filter(m => (Number(m.value) || 0) > 0).map(m => m.source ?? m.name ?? "")
  }

  /** The vectors of a toxin the character is not immune to */
  static openVectors(actorData, vectors = []) {
    return vectors.filter(v => !this.immunitySources(actorData, v).length)
  }

  /**
   * A drug's duration under an antitoxin (Chrome Flesh p. 154: "divisez la durée d'effet par l'indice de
   * l'antitoxine"), rounded up as any division (SR5 p. 50). The crash is not the effect: left as it is.
   */
  static drugDuration(duration, antitoxin = 0) {
    const rating = Number(antitoxin) || 0
    if (rating <= 1 || typeof duration !== "number") return duration
    return Math.ceil(duration / rating)
  }

  /** The Power left once the antitoxin took its rating off; below 1 the toxin does nothing (Chrome Flesh p. 154) */
  static effectivePower(power, antitoxin = 0) {
    return Math.max(0, (Number(power) || 0) - (Number(antitoxin) || 0))
  }

  /** Better Than Bad p. 141: hours cut from the manasphere, 12 - (Body or Magic, the higher), at least 1 */
  static blightHours(body, magic) {
    return Math.max(1, 12 - Math.max(Number(body) || 0, Number(magic) || 0))
  }

  /** Better Than Bad p. 141: under Blight "les sorts ne peuvent être lancés" (decision G2 of DjamZ) */
  static isCutFromManasphere(actor) {
    return !!actor?.items?.some(i => i.type === "itemEffect" && i.system?.type === "toxinEffectManasphereCut")
  }

  /** Better Than Bad p. 141, "incapable d'utiliser la magie, sous quelque forme que ce soit" (decision H1 of DjamZ):
   *  spells, rituals, conjuring, counterspelling, alchemy (making a preparation) and adept powers. Triggering a
   *  preparation already made stays allowed: it runs on the item's Potency, not on its maker's Magic */
  static BLIGHT_BLOCKED_ROLLS = ["spell", "ritual", "preparationFormula", "adeptPower"]
  static BLIGHT_BLOCKED_SKILLS = ["spellcasting", "ritualSpellcasting", "counterspelling", "alchemy", "summoning", "binding", "banishing", "artificing", "disenchanting"]
  static blightBlocksRoll(actor, rollType, rollKey) {
    if (!this.isCutFromManasphere(actor)) return false
    if (this.BLIGHT_BLOCKED_ROLLS.includes(rollType)) return true
    if (rollType === "weaponAstral" && this.blightBlocksAstral(actor)) return true
    if (!["skill", "skillDicePool"].includes(rollType)) return false
    return this.BLIGHT_BLOCKED_SKILLS.includes(rollKey) || (this.BLIGHT_ASTRAL_SKILLS.includes(rollKey) && this.blightBlocksAstral(actor))
  }

  /** "Perd sa connexion à la manasphère" (decision of DjamZ after Victoire's review): no astral perception, projection,
   *  Astral observation nor Astral combat. A dual-natured being (and a spirit) keeps its nature: the book gives it -4 dice */
  static BLIGHT_ASTRAL_SKILLS = ["assensing", "astralCombat"]
  static blightBlocksAstral(actor) {
    return this.isCutFromManasphere(actor) && actor?.type !== "actorSpirit" && !this.isDualNatured(actor)
  }

  /** A dual-natured being: one of its powers carries the dualNatured spirit power key */
  static isDualNatured(actor) {
    return !!actor?.items?.some(i => i.type === "itemPower" &&
      Object.values(i.system?.systemEffects ?? {
      }).some(e => e?.category === "spiritPower" && e?.value === "dualNatured"))
  }

  /** The display name of a weapon's toxin */
  static nameOf(toxin, localize = (key) => key) {
    if (toxin?.type === "custom") return toxin.custom?.name ?? ""
    return SR5.toxinTypes[toxin?.type] ? localize(SR5.toxinTypes[toxin.type]) : ""
  }

  /** The item data of a book toxin, to seed a world with editable examples */
  static bookItemData(key, localize = (k) => k) {
    const profile = SR5_Toxins.BOOK[key]
    const flag = (list, table) => Object.fromEntries(Object.keys(table).map(k => [k, (list ?? []).includes(k)]))
    return {
      name: localize(SR5.toxinTypes[key] ?? key).trim(),
      type: "itemToxin",
      system: {
        vector: flag(profile.vector, SR5.propagationVectors),
        speed: profile.speed ?? 0,
        power: profile.power ?? 0,
        powerFromMagic: !!profile.powerMagic,
        penetration: profile.penetration ?? 0,
        effect: flag(profile.effect, SR5.toxinEffects),
        damageType: profile.damageType ?? "",
        special: profile.special ? localize(profile.special) : "",
      },
    }
  }

  /** A GM button in the Items tab, to seed the world with the book toxins */
  static registerHooks() {
    Hooks.on("renderItemDirectory", (app, html) => {
      if (!game.user.isGM) return
      const root = html instanceof HTMLElement ? html : html[0]
      const actions = root?.querySelector(".header-actions")
      if (!actions || actions.querySelector(".sr5-toxin-book")) return
      const button = document.createElement("button")
      button.type = "button"
      button.className = "sr5-toxin-book"
      button.innerHTML = `<i class="fas fa-skull-crossbones"></i> ${game.i18n.localize("SR5.ToxinBookCreate")}`
      button.addEventListener("click", () => SR5_Toxins.createBookToxins())
      actions.append(button)
    })
  }

  /** Create, in a "Toxines" folder, one item per book toxin missing from the world */
  static async createBookToxins() {
    const localize = (k) => game.i18n.localize(k)
    const folderName = localize("SR5.ToxinBookFolder")
    let folder = game.folders.find(f => f.type === "Item" && f.name === folderName)
    if (!folder) folder = await Folder.create({
      name: folderName, type: "Item" 
    })
    const existing = new Set(game.items.filter(i => i.type === "itemToxin").map(i => i.name.trim()))
    const data = Object.keys(SR5_Toxins.BOOK)
      .filter(key => !SR5_Toxins.NOT_AN_ITEM.includes(key))
      .map(key => ({
        ...SR5_Toxins.bookItemData(key, localize), folder: folder.id 
      }))
      .filter(d => !existing.has(d.name))
    if (data.length) await Item.createDocuments(data)
    ui.notifications.info(game.i18n.format("SR5.INFO_ToxinBookCreated", {
      count: data.length 
    }))
  }
}
