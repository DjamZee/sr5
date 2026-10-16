// An IC put together from the effects of the book's IC (SR5 p. 249-250, Kill Code p. 74): its recipe is the field
// system.matrix.iceDesign of the IC, written by a module (matrice-sr5, « Compilateur de CI »). No book gives a way to
// design an IC: what blocks may be put together, how many and at what cost is the module's (a world setting there).
// The system only reads the recipe, and each block calls the code already written for the IC it comes from: nothing
// new is computed. An IC with no recipe is the book's IC of its type, as before.

/** The test sub-type of the attack and defense cards of a designed IC: none of the book's IC switches matches it */
export const DESIGNED_ICE = "iceDesigned"

/** The IC whose defense a designed IC may take: one for each pair of the book (SR5 p. 249-250) */
export const ICE_DESIGN_DEFENSES = ["iceAcid", "iceBinder", "iceCrash", "iceTarBaby", "iceJammer", "iceMarker"]

/** The attribute a block "reduce" lowers, and the IC whose effect it calls (SR5 p. 249-250) */
export const REDUCE_SOURCES = {
  firewall: "iceAcid",
  dataProcessing: "iceBinder",
  attack: "iceJammer",
  sleaze: "iceMarker",
}

/** The blocks, and their variants when they have some */
export const ICE_DESIGN_BLOCKS = {
  // Matrix damage: (Attack) + net hits + 2 per mark (Killer IC)
  matrixDamage: null,
  // Biofeedback equal to the matrix damage: Stun (Blaster), Physical (Black), or by the sim mode (SR5 p. 230)
  biofeedback: ["stun", "physical", "mode"],
  // Link-lock (Tar Baby, Blaster, Black)
  linkLock: null,
  // Marks put on the target: 1 (Probe) or 2 (Bloodhound)
  marks: ["1", "2"],
  // An attribute lowered by 1, matrix damage once at 0 (Acid, Binder, Jammer, Marker)
  reduce: Object.keys(REDUCE_SOURCES),
  // A program crashes, with a mark (Crash)
  crash: null,
  // A reboot with dumpshock, with 3 marks (Scramble)
  scramble: null,
  // Link-lock and a mark, a disconnection at 2 marks (Flicker, Kill Code p. 74)
  flicker: null,
  // Geolocated with 2 marks (Track)
  track: null,
  // -5 to the initiative (Shocker)
  shocker: null,
  // Stun damage resisted as physical, and Firewall lowered by 1 (Catapult)
  catapult: null,
}

/** "reduce:firewall" -> {key: "reduce", variant: "firewall"}, or null when it is no block */
export function parseIceBlock(text) {
  const [key, variant = null] = String(text ?? "").split(":")
  if (!(key in ICE_DESIGN_BLOCKS)) return null
  const variants = ICE_DESIGN_BLOCKS[key]
  if (variants && !variants.includes(variant)) return null
  if (!variants && variant !== null) return null
  return {
    key, variant
  }
}

/**
 * The recipe of an IC, or null for a book's IC.
 * @param {Object} matrix   system.matrix of the actor
 * @return {{defense: String|null, blocks: Array<{key, variant}>}|null}
 */
export function iceDesignOf(matrix) {
  if (matrix?.deviceType !== "ice") return null
  const design = matrix.iceDesign
  const seen = new Set()
  const blocks = []
  for (const text of Array.isArray(design?.blocks) ? design.blocks : []) {
    const block = parseIceBlock(text)
    if (!block || seen.has(text)) continue
    seen.add(text)
    blocks.push(block)
  }
  if (!blocks.length) return null
  return {
    defense: ICE_DESIGN_DEFENSES.includes(design.defense) ? design.defense : null, blocks
  }
}

/** The test sub-type of an IC's cards: its type, or DESIGNED_ICE for a designed one */
export function iceTestSubType(matrix) {
  return iceDesignOf(matrix) ? DESIGNED_ICE : matrix?.deviceSubType
}

/** The IC whose defense pair an IC uses (utilityActor.js): the recipe's, else its type */
export function iceDefenseType(matrix) {
  return iceDesignOf(matrix)?.defense ?? matrix?.deviceSubType
}

/**
 * The biofeedback of a designed IC that hurts in VR, or null (test-MatrixResistance.js).
 * @param {Object} matrix     system.matrix of the IC
 * @param {String} userMode   the target's: "hotsim", "coldsim" or "ar"
 * @return {null|"stun"|"physical"}
 */
export function designedBiofeedback(matrix, userMode) {
  const block = iceDesignOf(matrix)?.blocks.find(b => b.key === "biofeedback")
  if (!block) return null
  if (block.variant === "mode") return userMode === "hotsim" ? "physical" : "stun"
  return block.variant
}

/**
 * What a designed IC's hit puts on the defense card (test-IceDefense.js), block by block, with the conditions of the
 * IC each block comes from.
 * @param {Object} options
 * @param {Array<{key, variant}>} options.blocks
 * @param {Number} options.existingMark     the IC's (its host's) marks on the target
 * @param {Boolean} options.isLinkLocked
 * @param {Boolean} options.devicelessAI    an AI outside any device: no link-lock, no reboot (Data Trails p. 157)
 * @param {Object<String, Number>} options.attributes   the target's matrix attributes, by key: their values
 * @return {{matrixDamage: Boolean, marks: Number, linkLock: Boolean, effects: String[], takeMatrixDamage: Boolean,
 *           shocker: Boolean, catapult: Boolean}}  effects: the IC whose effect each button calls (applyIceEffect)
 */
export function designedHit({
  blocks = [], existingMark = 0, isLinkLocked = false, devicelessAI = false, attributes = {
  }
} = {
}) {
  const hit = {
    matrixDamage: false, marks: 0, linkLock: false, effects: [], takeMatrixDamage: false, shocker: false, catapult: false
  }
  const effect = source => {
    if (!hit.effects.includes(source)) hit.effects.push(source)
  }
  for (const {
    key, variant 
  } of blocks) {
    switch (key) {
      case "matrixDamage":
        hit.matrixDamage = true
        break
      case "linkLock":
        if (!devicelessAI && !isLinkLocked) hit.linkLock = true
        break
      case "marks":
        hit.marks = Math.max(hit.marks, Number(variant) || 0)
        break
      case "reduce":
        if ((Number(attributes?.[variant]) || 0) > 0) effect(REDUCE_SOURCES[variant])
        else hit.takeMatrixDamage = true
        break
      case "crash":
        if (existingMark >= 1) effect("iceCrash")
        break
      case "scramble":
        if (!devicelessAI && existingMark >= 3) effect("iceScramble")
        break
      case "flicker":
        hit.marks = Math.max(hit.marks, 1)
        if (!devicelessAI && (!isLinkLocked || existingMark >= 1)) effect("iceFlicker")
        break
      case "track":
        if (existingMark >= 2) effect("iceTrack")
        break
      case "shocker":
        hit.shocker = true
        break
      case "catapult":
        hit.catapult = true
        effect("iceCatapult")
        break
    }
  }
  return hit
}

/** The marks a designed IC's hit puts, read on its recipe (mark.js, a player's relay of them): 0 when none */
export function designedMarks(matrix) {
  return designedHit({
    blocks: iceDesignOf(matrix)?.blocks ?? [], isLinkLocked: true, devicelessAI: true
  }).marks
}

/** The action of a card button that calls one IC's effect for a designed IC: "iceDesign_iceAcid" */
export const ICE_DESIGN_ACTION = "iceDesign_"

export function designActionOf(source) {
  return `${ICE_DESIGN_ACTION}${source}`
}

/** The IC whose effect a button calls, or null when it is not a designed IC's */
export function designSourceOf(action) {
  if (typeof action !== "string" || !action.startsWith(ICE_DESIGN_ACTION)) return null
  const source = action.slice(ICE_DESIGN_ACTION.length)
  return [...Object.values(REDUCE_SOURCES), "iceCrash", "iceScramble", "iceFlicker", "iceTrack", "iceCatapult"].includes(source) ? source : null
}
