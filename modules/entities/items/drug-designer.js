// Custom drugs (Chrome Flesh p. 194-196): a base, then blocks at a level, then enhancers. Everything the drug is (its
// effects, Speed, Duration, crash, addiction, Availability and cost) is worked out from that recipe alone, here, so
// that the designer window, the gamemaster's approval and the intake (utilityActor.handleDrugShots) read the same.
// No Foundry call in this file: it is tested on its own (tests/drug-designer.test.js).

export const CUSTOM_DRUG_KEY = "customDrug"

export const DRUG_ATTRIBUTES = ["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma"]

// Chrome Flesh p. 194
export const DRUG_BASES = {
  tank: {
    number: 1, attributes: {
      body: 2, willpower: 1, charisma: -2
    }, painResistance: 3
  },
  defender: {
    number: 2, attributes: {
      agility: 1, reaction: 1, intuition: 1, strength: -1, logic: -1
    }
  },
  genius: {
    number: 3, attributes: {
      logic: 2, intuition: 2, reaction: -1, willpower: -1
    }
  },
  charmer: {
    number: 4, attributes: {
      charisma: 1, agility: -1
    }, socialLimit: 1
  },
  warrior: {
    number: 5, attributes: {
      body: 1, agility: 1, strength: 1, willpower: -1
    }
  },
}

// Chrome Flesh p. 195-196, one entry per level. crash: Stun "non-résistés" when the effect wears off.
// group: the line of the cost table (p. 195) the block is priced on
export const DRUG_BLOCKS = {
  brute: {
    number: 1, group: "basic", levels: [
      {
        attributes: {
          strength: 1, intuition: -1
        }
      },
      {
        attributes: {
          strength: 2, intuition: -1
        }, crash: 2
      },
      {
        attributes: {
          strength: 3, intuition: -1
        }, quality: "painSensitivity", crash: 2
      },
    ]
  },
  enduring: {
    number: 2, group: "basic", levels: [
      {
        attributes: {
          body: 1, logic: -1
        }
      },
      {
        attributes: {
          body: 2, logic: -1
        }, crash: 2
      },
      {
        attributes: {
          body: 3, logic: -1, intuition: -1
        }, crash: 2
      },
    ]
  },
  strike: {
    number: 3, group: "basic", levels: [
      {
        attributes: {
          agility: 1, strength: -1
        }
      },
      {
        attributes: {
          agility: 2, strength: -1
        }, crash: 2
      },
      {
        attributes: {
          agility: 3, strength: -1, intuition: -1
        }, quality: "shakyHands", crash: 2
      },
    ]
  },
  flash: {
    number: 4, group: "basic", levels: [
      {
        attributes: {
          reaction: 1, logic: -1
        }
      },
      {
        attributes: {
          reaction: 2, willpower: -1, logic: -1
        }
      },
      {
        attributes: {
          reaction: 3, willpower: -1, logic: -1, intuition: -1
        }, crash: 2
      },
    ]
  },
  einstein: {
    number: 5, group: "basic", levels: [
      {
        attributes: {
          logic: 1, willpower: -1
        }
      },
      {
        attributes: {
          logic: 2, willpower: -1, intuition: -1
        }
      },
      {
        attributes: {
          logic: 3, willpower: -1, intuition: -1
        }, crash: 2
      },
    ]
  },
  momentOfTruth: {
    number: 6, group: "basic", levels: [
      {
        attributes: {
          intuition: 1, strength: -1
        }
      },
      {
        attributes: {
          intuition: 2, reaction: -1, strength: -1
        }
      },
      {
        attributes: {
          intuition: 3, reaction: -1, strength: -1
        }, crash: 2
      },
    ]
  },
  stoneWall: {
    number: 7, group: "basic", levels: [
      {
        attributes: {
          willpower: 1, body: -1
        }
      },
      {
        attributes: {
          willpower: 2, body: -1, agility: -1
        }
      },
      {
        attributes: {
          willpower: 3, body: -1, agility: -1, strength: -1
        }
      },
    ]
  },
  //Level 3 reads "Charisme +2" in the book (VF p. 196), not +3: kept as printed
  silverTongue: {
    number: 8, group: "basic", levels: [
      {
        attributes: {
          charisma: 1, strength: -1
        }
      },
      {
        attributes: {
          charisma: 2, strength: -1
        }, crash: 2
      },
      {
        attributes: {
          charisma: 2, strength: -1
        }, quality: "uncouth", crash: 2
      },
    ]
  },
  shockAndAwe: {
    number: 9, group: "initiative", levels: [
      {
        initiativeDice: 1, crash: 4
      },
      {
        initiativeDice: 2, limits: -1, crash: 4
      },
      {
        initiativeDice: 3, limits: -2, crash: 8
      },
    ]
  },
  sharpMind: {
    number: 10, group: "advanced", levels: [
      {
        attributes: {
          logic: 1, intuition: 1, charisma: -1
        }, crash: 1
      },
      {
        attributes: {
          logic: 2, intuition: 2, charisma: -2
        }, crash: 2
      },
    ]
  },
  general: {
    number: 11, group: "advanced", levels: [
      {
        attributes: {
          willpower: 1, charisma: 1, strength: -1
        }, crash: 2
      },
      {
        attributes: {
          willpower: 2, charisma: 2, agility: -1, strength: -1
        }, crash: 2
      },
    ]
  },
  resistance: {
    number: 12, group: "advanced", levels: [
      {
        attributes: {
          body: 1, willpower: 1, logic: -1
        }, crash: 1
      },
      {
        attributes: {
          body: 2, willpower: 2, reaction: -1, logic: -1
        }, crash: 2
      },
    ]
  },
  speedDemon: {
    number: 13, group: "advanced", levels: [
      {
        attributes: {
          agility: 1, reaction: 1, strength: -1
        }, crash: 1
      },
      {
        attributes: {
          agility: 2, reaction: 2, strength: -1, intuition: -1
        }, crash: 2
      },
    ]
  },
}

// "Coût des drogues customisées (par dose)", Chrome Flesh p. 195. The table is printed in columns that come apart
// in the text of the book; read back and checked on Wrecker's example of the same page (15R, 355 ¥, 12, 5).
// Each block: Availability and cost per level, addiction rating + (level - 1), threshold + (level - 2, minimum 0)
export const DRUG_COSTS = {
  base: {
    availability: 4, cost: 75, addictionRating: 6, addictionThreshold: 2
  },
  basic: {
    availability: 1, cost: 20
  },
  initiative: {
    availability: 2, cost: 40
  },
  advanced: {
    availability: 2, cost: 30
  },
  enhancer: {
    availability: 1, cost: 50, addictionRating: 1, addictionThreshold: 1
  },
}

// Chrome Flesh p. 196: Speed and Duration enhancers, up to three times each
export const DRUG_ENHANCER_MAX = 3
export const DRUG_BASE_SPEED = 3
export const DRUG_MAX_INITIATIVE_DICE = 4
export const DRUG_MAX_ATTRIBUTE_BONUS = 4
export const DRUG_MAX_LEVEL_ON_LOWERED = 2

// The cost of a drug by its quality (Chrome Flesh p. 194): street half, pharmaceutical double, custom three times a
// pharmaceutical one
export const DRUG_QUALITY_COST_FACTORS = {
  street: 0.5,
  standard: 1,
  pharmaceutical: 2,
  custom: 6,
}

const count = n => Math.min(Math.max(Math.trunc(Number(n) || 0), 0), DRUG_ENHANCER_MAX)

/** The recipe read back to a clean shape: unknown blocks and levels are kept to be reported, not dropped. */
export function normalizeRecipe(recipe = {
}) {
  const blocks = {
  }
  for (const [key, level] of Object.entries(recipe?.blocks ?? {
  })) {
    const n = Math.trunc(Number(level) || 0)
    if (n > 0) blocks[key] = n
  }
  const e = recipe?.enhancers ?? {
  }
  return {
    base: recipe?.base ?? "",
    blocks,
    enhancers: {
      ingestion: !!e.ingestion, inhalation: !!e.inhalation, speed: Number(e.speed) || 0, duration: Number(e.duration) || 0,
    },
  }
}

function blockLevel(key, level) {
  return DRUG_BLOCKS[key]?.levels?.[level - 1]
}

/**
 * The errors of a recipe, as { code, ...data } (the window localizes them), empty when the drug can be made.
 * Chrome Flesh p. 195-196.
 */
export function recipeErrors(recipe) {
  const r = normalizeRecipe(recipe)
  const errors = []
  const base = DRUG_BASES[r.base]
  if (!base) errors.push({
    code: "noBase"
  })
  const chosen = []
  for (const [key, level] of Object.entries(r.blocks)) {
    const block = DRUG_BLOCKS[key]
    if (!block) {
      errors.push({
        code: "unknownBlock", block: key
      })
      continue
    }
    if (level > block.levels.length) {
      errors.push({
        code: "level", block: key, level, max: block.levels.length
      })
      continue
    }
    chosen.push([key, level, blockLevel(key, level)])
  }
  //"Un bloc avec des modifications négatives est incompatible avec un autre bloc ayant des modifications positives
  //des mêmes attributs" (p. 195), read on the level chosen
  for (const [a, , la] of chosen) for (const [b, , lb] of chosen) {
    if (a === b) continue
    for (const [attribute, value] of Object.entries(la.attributes ?? {
    })) {
      if (value < 0 && (lb.attributes?.[attribute] ?? 0) > 0) errors.push({
        code: "incompatible", block: a, other: b, attribute
      })
    }
  }
  //"si une base a une modification négative concernant un attribut, seuls les blocs de niveau 1 et 2 qui modifient
  //positivement cet attribut sont sélectionnables" (p. 195, again p. 196)
  if (base) for (const [key, level, l] of chosen) {
    if (level <= DRUG_MAX_LEVEL_ON_LOWERED) continue
    for (const [attribute, value] of Object.entries(l.attributes ?? {
    })) {
      if (value > 0 && (base.attributes[attribute] ?? 0) < 0) errors.push({
        code: "loweredByBase", block: key, attribute, max: DRUG_MAX_LEVEL_ON_LOWERED
      })
    }
  }
  const effects = recipeEffects(r)
  //p. 196: "Le bonus en dés d'initiative ne peut pas être supérieur à +4D6"
  if (effects.initiativeDice > DRUG_MAX_INITIATIVE_DICE) errors.push({
    code: "initiative", max: DRUG_MAX_INITIATIVE_DICE
  })
  //p. 196: "Le bonus maximum dont peut profiter un attribut, toutes sources confondues, est de +4"
  for (const [attribute, value] of Object.entries(effects.attributes)) {
    if (value > DRUG_MAX_ATTRIBUTE_BONUS) errors.push({
      code: "attributeBonus", attribute, max: DRUG_MAX_ATTRIBUTE_BONUS
    })
  }
  for (const key of ["speed", "duration"]) {
    const n = r.enhancers[key]
    if (!Number.isInteger(n) || n < 0 || n > DRUG_ENHANCER_MAX) errors.push({
      code: "enhancer", enhancer: key, max: DRUG_ENHANCER_MAX
    })
  }
  return errors
}

/** What the drug does: net attributes, limits, initiative dice, pain resistance, qualities, crash. */
export function recipeEffects(recipe) {
  const r = normalizeRecipe(recipe)
  const base = DRUG_BASES[r.base]
  const attributes = {
  }
  const add = (from = {
  }) => {
    for (const [k, v] of Object.entries(from)) attributes[k] = (attributes[k] ?? 0) + v
  }
  add(base?.attributes)
  let limits = 0, initiativeDice = 0, crash = 0
  const qualities = []
  for (const [key, level] of Object.entries(r.blocks)) {
    const l = blockLevel(key, level)
    if (!l) continue
    add(l.attributes)
    limits += l.limits ?? 0
    initiativeDice += l.initiativeDice ?? 0
    //"les dommages des blocs s'additionnent" (Wrecker's example, p. 195: 2E + 4E = 6E)
    crash += l.crash ?? 0
    if (l.quality) qualities.push(l.quality)
  }
  for (const k of Object.keys(attributes)) if (!attributes[k]) delete attributes[k]
  return {
    attributes, limits, socialLimit: base?.socialLimit ?? 0, initiativeDice, painResistance: base?.painResistance ?? 0,
    qualities, crash,
  }
}

/** The number of enhancers a recipe takes. */
export function enhancerCount(recipe) {
  const e = normalizeRecipe(recipe).enhancers
  return (e.ingestion ? 1 : 0) + (e.inhalation ? 1 : 0) + count(e.speed) + count(e.duration)
}

/**
 * The full stat of a custom drug, at the standard quality unless one is given (the quality only changes the cost
 * here; the crash duration and the threshold of a pharmaceutical drug are applied at intake, drug-stat.js).
 */
export function computeCustomDrug(recipe, quality = "standard") {
  const r = normalizeRecipe(recipe)
  const effects = recipeEffects(r)
  let availability = DRUG_COSTS.base.availability
  let cost = DRUG_COSTS.base.cost
  let addictionRating = DRUG_COSTS.base.addictionRating
  let addictionThreshold = DRUG_COSTS.base.addictionThreshold
  for (const [key, level] of Object.entries(r.blocks)) {
    const block = DRUG_BLOCKS[key]
    if (!block || !blockLevel(key, level)) continue
    const line = DRUG_COSTS[block.group]
    availability += line.availability * level
    cost += line.cost * level
    addictionRating += level - 1
    addictionThreshold += Math.max(level - 2, 0)
  }
  const enhancers = enhancerCount(r)
  availability += DRUG_COSTS.enhancer.availability * enhancers
  cost += DRUG_COSTS.enhancer.cost * enhancers
  addictionRating += DRUG_COSTS.enhancer.addictionRating * enhancers
  addictionThreshold += DRUG_COSTS.enhancer.addictionThreshold * enhancers
  //p. 196: base Vector Injection, base Speed 3 Combat Turns, base Duration 10 × 1D6 minutes
  const vectors = ["injection"]
  if (r.enhancers.ingestion) vectors.push("ingestion")
  if (r.enhancers.inhalation) vectors.push("inhalation")
  return {
    recipe: r,
    errors: recipeErrors(r),
    effects,
    vectors,
    speed: Math.max(DRUG_BASE_SPEED - count(r.enhancers.speed), 0),
    durationDice: 1 + count(r.enhancers.duration),
    availability,
    legality: "R",
    cost: Math.round(cost * (DRUG_QUALITY_COST_FACTORS[quality] ?? 1)),
    addictionRating,
    addictionThreshold,
    quality,
  }
}

const LIMIT_TARGETS = ["physicalLimit", "mentalLimit", "socialLimit", "astralLimit"]
const PAIN_TARGETS = ["stun", "condition", "physical"]

const customEffect = (category, target, value) => ({
  category, target, type: "value", value, multiplier: null, wifi: false, transfer: false, phase: "rise",
})

/**
 * The custom effects of the drug, in the form of the Megapack's KAMI+: augmented attributes, the four limits,
 * physical initiative dice, pain resistance as box reduction on the monitors (SR5 p. 75).
 */
export function drugCustomEffects(effects) {
  const list = []
  for (const attribute of DRUG_ATTRIBUTES) {
    const v = effects.attributes[attribute]
    if (v) list.push(customEffect("characterAttributes", `system.attributes.${attribute}.augmented`, v))
  }
  for (const limit of LIMIT_TARGETS) {
    const v = effects.limits + (limit === "socialLimit" ? effects.socialLimit : 0)
    if (v) list.push(customEffect("characterLimits", `system.limits.${limit}`, v))
  }
  if (effects.initiativeDice) list.push(customEffect("characterInitiatives", "system.initiatives.physicalInit.dice", effects.initiativeDice))
  if (effects.painResistance) for (const monitor of PAIN_TARGETS) {
    list.push(customEffect("characterConditionMonitors", `system.penalties.${monitor}.boxReduction`, effects.painResistance))
  }
  return Object.fromEntries(list.map((e, i) => [String(i), e]))
}

const signed = n => (n > 0 ? `+${n}` : `${n}`.replace("-", "−"))

/**
 * The effects of a drug in words, for its game effect and the designer window. `t(key)` localizes a key,
 * `labels`: the SR5 tables of labels (attributes, traits).
 */
export function effectLines(effects, t, labels) {
  const parts = DRUG_ATTRIBUTES.filter(a => effects.attributes[a])
    .map(a => `${t(labels.attributes[a])} ${signed(effects.attributes[a])}`)
  if (effects.socialLimit) parts.push(`${t("SR5.SocialLimit")} ${signed(effects.socialLimit)}`)
  if (effects.limits) parts.push(t("SR5.DrugDesignerAllLimits").replace("{value}", signed(effects.limits)))
  if (effects.initiativeDice) parts.push(t("SR5.DrugDesignerInitiative").replace("{value}", effects.initiativeDice))
  if (effects.painResistance) parts.push(`${t("SR5.DrugDesignerPainResistance")} ${effects.painResistance}`)
  for (const q of effects.qualities) parts.push(t(labels.traits[q]))
  return parts
}

/**
 * The data of the itemDrug the designer makes. `t` and `labels` as for effectLines; `status`: "" for the
 * gamemaster's drug, "pending" for a player's.
 */
export function customDrugItemData({
  name, recipe, quality = "standard", addictionType = "both", preparedFor = "", status = "", t, labels,
}) {
  const stat = computeCustomDrug(recipe, quality)
  const r = stat.recipe
  const base = DRUG_BASES[r.base]
  const items = []
  if (base) items.push(`<li><strong>${t("SR5.DrugDesignerBase")} ${base.number} (${t(labels.bases[r.base])})</strong></li>`)
  for (const [key, level] of Object.entries(r.blocks)) {
    const block = DRUG_BLOCKS[key]
    if (block) items.push(`<li><strong>${t("SR5.DrugDesignerBlock")} ${block.number} (${t(labels.blocks[key])})</strong>, ${t("SR5.DrugDesignerLevel").toLowerCase()} ${level}</li>`)
  }
  const e = r.enhancers
  const enhancers = []
  if (e.ingestion) enhancers.push(t("SR5.DrugEnhancerIngestion"))
  if (e.inhalation) enhancers.push(t("SR5.DrugEnhancerInhalation"))
  if (e.speed) enhancers.push(`${t("SR5.DrugEnhancerSpeed")} × ${e.speed}`)
  if (e.duration) enhancers.push(`${t("SR5.DrugEnhancerDuration")} × ${e.duration}`)
  if (enhancers.length) items.push(`<li>${t("SR5.DrugDesignerEnhancers")} : ${enhancers.join(", ")}</li>`)
  const crash = stat.effects.crash ? t("SR5.DrugDesignerCrashValue").replace("{value}", stat.effects.crash) : t("SR5.DrugDesignerNoCrash")
  const speed = stat.speed ? `${stat.speed} ${t(stat.speed === 1 ? "SR5.CombatTurn" : "SR5.CombatTurns")}` : t("SR5.DrugDesignerImmediate")
  return {
    name,
    type: "itemDrug",
    system: {
      description: `<p>${t("SR5.DrugDesignerDescription")}</p><ul>${items.join("")}</ul>`,
      gameEffect: `<p>${effectLines(stat.effects, t, labels).join(", ")}.</p><p>${crash}</p>`,
      source: "chromeFlesh",
      page: 194,
      availability: {
        base: stat.availability, value: stat.availability, modifiers: [], multiplier: ""
      },
      legality: stat.legality,
      price: {
        base: stat.cost, value: stat.cost, modifiers: [], multiplier: ""
      },
      quality,
      preparedFor,
      vector: {
        contact: false, ingestion: stat.vectors.includes("ingestion"), inhalation: stat.vectors.includes("inhalation"),
        injection: true, value: stat.vectors.map(v => t(labels.vectors[v] ?? v)),
      },
      speed,
      duration: `10 × ${stat.durationDice}D6 ${t("SR5.Minutes").toLowerCase()}`,
      addiction: {
        type: addictionType, rating: stat.addictionRating, threshold: stat.addictionThreshold
      },
      customEffects: drugCustomEffects(stat.effects),
      systemEffects: {
        0: {
          category: "drug", value: CUSTOM_DRUG_KEY
        }
      },
      designer: {
        recipe: r, status
      },
    },
  }
}

// Only the gamemaster approves or refuses a drug a player made (hooks/item.js, as for the preparations)
export const GM_ONLY_DRUG_PATHS = ["system.designer.status"]

/** A drug made by a player waits for the gamemaster: pending or refused, it is not taken. Any other drug is. */
export function drugDesignApproved(system) {
  return !["pending", "refused"].includes(system?.designer?.status)
}

/** The drug stat of a dose (utilityActor.handleDrugShots), the Duration die already rolled. */
export function customDrugShot(recipe, durationRoll) {
  const stat = computeCustomDrug(recipe)
  return {
    name: CUSTOM_DRUG_KEY,
    speed: stat.speed,
    speedType: "SR5.CombatTurns",
    duration: durationRoll,
    durationType: "minute",
    customCrash: stat.effects.crash,
  }
}
