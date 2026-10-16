import {
  SR5
} from "../../config.js"

/**
 * Registry of the sprite types (SR5 p. 261, Kill Code p. 110).
 *
 * The seven official types used to be two switches in the character utility
 * (skills, matrix attributes) and a fixed 4 initiative dice. They are now the
 * built-in entries of this table: what a sprite gets is read from it, the
 * values are the book's, unchanged.
 *
 * A module adds its own types by game.sr5.spriteTypes.register(key, definition)
 * during its init or setup hook. The system adds no type of its own beyond the
 * books': a house rule stays in the module that brings it.
 *
 * definition = {
 *   label: i18n key or text,          description: i18n key or text (optional),
 *   skills: ["computer", "hacking"],  the sprite's skills, rated at its Level,
 *   matrix: { attack: 0, sleaze: 3, dataProcessing: 1, firewall: 2, initiative: 0 },
 *                                     added to the Level (initiative: to the matrix initiative score),
 *   initiativeDice: 4,                matrix initiative dice (4 by default, SR5 p. 256),
 *   powers: ["Compendium.….Item.…"]   optional: powers given at creation, besides the reference compendium's
 * }
 */

export const SPRITE_SKILLS = ["computer", "hacking", "electronicWarfare", "cybercombat", "hardware", "software"]
export const SPRITE_MATRIX_KEYS = ["attack", "sleaze", "dataProcessing", "firewall"]
export const DEFAULT_INITIATIVE_DICE = 4

const BUILT_IN = {
  courier: {
    skills: ["computer", "hacking"], matrix: {
      sleaze: 3, dataProcessing: 1, firewall: 2 
    }
  },
  crack: {
    skills: ["computer", "hacking", "electronicWarfare"], matrix: {
      sleaze: 3, dataProcessing: 2, firewall: 1 
    }
  },
  data: {
    skills: ["computer", "electronicWarfare"], matrix: {
      attack: -1, dataProcessing: 4, firewall: 2 
    }
  },
  fault: {
    skills: ["computer", "cybercombat", "hacking"], matrix: {
      attack: 3, dataProcessing: 1, firewall: 2 
    }
  },
  machine: {
    skills: ["computer", "electronicWarfare", "hardware"], matrix: {
      attack: 1, dataProcessing: 3, firewall: 2 
    }
  },
  companion: {
    skills: ["computer", "electronicWarfare"], matrix: {
      attack: -1, sleaze: 1, firewall: 4 
    }
  },
  generalist: {
    skills: ["computer", "electronicWarfare", "hacking"], matrix: {
      attack: 1, sleaze: 1, dataProcessing: 1, firewall: 1, initiative: 1 
    }
  },
}

const registry = new Map(Object.entries(BUILT_IN).map(([k, d]) => [k, normalize(d)]))

function normalize(def) {
  const matrix = {
  }
  for (const key of [...SPRITE_MATRIX_KEYS, "initiative"]) {
    const v = Number(def?.matrix?.[key] ?? 0)
    if (v) matrix[key] = v
  }
  return {
    label: def?.label,
    description: def?.description,
    skills: (def?.skills ?? []).filter(s => SPRITE_SKILLS.includes(s)),
    matrix,
    initiativeDice: def?.initiativeDice == null || !Number.isFinite(Number(def.initiativeDice)) ?
      DEFAULT_INITIATIVE_DICE : Number(def.initiativeDice),
    powers: Array.isArray(def?.powers) ? def.powers.filter(p => typeof p === "string") : [],
  }
}

/** The definition of a sprite type, or null for an unknown type. */
export function spriteTypeDefinition(type) {
  return registry.get(type) ?? null
}

/** Is this one of the book's types (they cannot be replaced)? */
export function isBuiltInSpriteType(type) {
  return Object.hasOwn(BUILT_IN, type)
}

/**
 * Add a sprite type. Returns the stored definition, or null when refused:
 * a book type cannot be replaced, a key must be a plain word, a label is needed.
 */
export function registerSpriteType(key, def) {
  if (typeof key !== "string" || !/^[A-Za-z][\w-]*$/.test(key)) return null
  if (isBuiltInSpriteType(key)) return null
  if (!def?.label) return null
  const entry = normalize(def)
  registry.set(key, entry)
  SR5.spriteTypes[key] = entry.label
  SR5.spriteTypesDescription[key] = entry.description ?? ""
  return entry
}

/** Every known sprite type key, the book's first. */
export function spriteTypeKeys() {
  return [...registry.keys()]
}

/** The skills a sprite of this type has (rated at its Level). Unknown type: none. */
export function spriteSkills(type) {
  return spriteTypeDefinition(type)?.skills ?? []
}

/** The modifiers to the Level of its matrix attributes, and to its matrix initiative. Unknown type: none. */
export function spriteMatrixModifiers(type) {
  return spriteTypeDefinition(type)?.matrix ?? {
  }
}

/** Its matrix initiative dice. Unknown type: the book's 4. */
export function spriteInitiativeDice(type) {
  return spriteTypeDefinition(type)?.initiativeDice ?? DEFAULT_INITIATIVE_DICE
}

/** The UUIDs of the powers the type itself gives. */
export function spriteGivenPowers(type) {
  return spriteTypeDefinition(type)?.powers ?? []
}

/** The API handed to the modules (game.sr5.spriteTypes). */
export const spriteTypesApi = {
  register: registerSpriteType,
  get: spriteTypeDefinition,
  keys: spriteTypeKeys,
  isBuiltIn: isBuiltInSpriteType,
}
