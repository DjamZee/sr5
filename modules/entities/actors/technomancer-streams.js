// The streams of the technomancers (Kill Code p. 99-103 for the resonant ones, p. 145-146 for the dissonant ones).
//
// A stream is a quality (20 Karma, never doubled after creation, Kill Code p. 99) carrying a system effect of category
// specialCase whose value names it (streamMachinist...). A technomancer follows one stream at most: the first one found
// on the sheet is the one that counts. What each stream changes:
// - fading reduced by 2 for the complex forms that aim at what the stream knows best (the Sourcerer: all of them);
// - +2 dice to compile and decompile two kinds of sprites (the Technoshaman: fading reduced by 2 instead);
// - a daemon, a passive bonus that grows with the submersion grade.
// The complex form of each stream (Overdrive, LOTO, Hypertissage...) is an item of the compendiums, not code.
// The rules below have no Foundry in them, so that tests can read them.

export const STREAM_EFFECTS = {
  cyberadept: "streamCyberadept",
  machinist: "streamMachinist",
  sourcerer: "streamSourcerer",
  technoshaman: "streamTechnoshaman",
  morphinae: "streamMorphinae",
  apophenian: "streamApophenian",
  erisian: "streamErisian",
}

// Complex form targets (SR5.complexFormTargets) whose fading the stream lowers by 2, and the sprite types it compiles
// and decompiles with 2 more dice. The Morphinae reduce the forms "that affect the attributes of hosts or IC": the
// system cannot read what a form affects, its target stands for it
export const STREAMS = {
  cyberadept: {
    fadingTargets: ["cyberware"], spriteTypes: ["fault", "companion"]
  },
  machinist: {
    fadingTargets: ["device"], spriteTypes: ["machine", "generalist"]
  },
  sourcerer: {
    fadingTargets: "all", spriteTypes: []
  },
  technoshaman: {
    fadingTargets: [], spriteTypes: [], spriteFadingReduction: 2
  },
  morphinae: {
    fadingTargets: ["host", "ice"], spriteTypes: ["fault", "generalist"]
  },
  apophenian: {
    fadingTargets: ["device"], spriteTypes: ["data", "generalist"]
  },
  erisian: {
    fadingTargets: ["persona"], spriteTypes: ["crack", "generalist"]
  },
}

export const STREAM_FADING_REDUCTION = 2
export const STREAM_SPRITE_DICE = 2

function itemsOf(holder){
  const list = holder?.items
  if (!list) return []
  return Array.isArray(list) ? list : Array.from(list)
}

/**
 * The stream an actor follows, read on its qualities. Also reads the copy of the controller a drone carries
 * ({system, items}). Null without one.
 */
export function streamOf(holder){
  const byValue = Object.fromEntries(Object.entries(STREAM_EFFECTS).map(([k, v]) => [v, k]))
  for (const item of itemsOf(holder)){
    if (item?.type !== "itemQuality") continue
    for (const effect of Object.values(item.system?.systemEffects ?? {
    })){
      if (effect?.category === "specialCase" && byValue[effect.value]) return byValue[effect.value]
    }
  }
  return null
}

// The fading of a complex form aimed at this target, lowered by the stream (Kill Code p. 100-101, 145-146)
export function streamFadingReduction(stream, target){
  const targets = STREAMS[stream]?.fadingTargets
  if (!targets) return 0
  if (targets === "all") return STREAM_FADING_REDUCTION
  return targets.includes(target) ? STREAM_FADING_REDUCTION : 0
}

// The dice the stream adds to compile or decompile a sprite of this type
export function streamSpriteDice(stream, spriteType){
  return STREAMS[stream]?.spriteTypes?.includes(spriteType) ? STREAM_SPRITE_DICE : 0
}

// The Technoshaman compiles and decompiles with a fading lowered by 2 (Kill Code p. 102)
export function streamSpriteFadingReduction(stream){
  return STREAMS[stream]?.spriteFadingReduction ?? 0
}

// Technoshaman daemon (Kill Code p. 102): a sprite compiled in its major form, which only a Technoshaman may do, has
// the power of its type (table "Pouvoirs des sprites de forme majeure"; the table calls the crack sprite's power
// Sentinelle, the text Gardien des portes). Using the power takes all its remaining tasks and decompiles it
export const MAJOR_FORM_POWERS = {
  courier: "freenet",
  crack: "gatekeeper",
  data: "supercomputer",
  fault: "annihilation",
  machine: "overdrive",
  companion: "sacrifice",
  generalist: "coRoutine",
}

export function mayCompileMajorForm(stream){
  return stream === "technoshaman"
}

// Compiling a major form doubles the fading the Technoshaman resists: the fading of the compiling, already lowered by
// the stream, is doubled (arbitrage: the text doubles "la valeur de technodrain à laquelle le technochaman doit
// résister", the value after the stream's reduction)
export function compilingFading(hits, stream, majorForm){
  const fading = reducedFading((Number(hits) || 0) * 2, streamSpriteFadingReduction(stream))
  return majorForm && mayCompileMajorForm(stream) ? fading * 2 : fading
}

// Every fading has a floor of 2 (SR5 p. 254); a fading a stream lowers goes down to 1, as in the example of LOTO,
// a fading of 3 resisted at 1 by a Machinist (arbitrage de DjamZ (07/10), d'après l'exemple de KC p. 101)
export function reducedFading(value, reduction){
  const lowered = (Number(reduction) || 0) > 0
  return Math.max(lowered ? 1 : 2, (Number(value) || 0) - (Number(reduction) || 0))
}

// Sourcerer daemon: half the submersion grade, rounded down, of complex forms sustained without penalty (KC p. 101)
export function sourcererFreeSustain(stream, grade){
  return stream === "sourcerer" ? Math.floor(Math.max(0, Number(grade) || 0) / 2) : 0
}

// Morphinae daemon: one point of noise ignored per submersion grade (Kill Code p. 145)
export function noiseIgnoredByStream(stream, grade){
  return stream === "morphinae" ? Math.max(0, Number(grade) || 0) : 0
}

// Erisian daemon: half the submersion grade, rounded up, added to Firewall (Kill Code p. 146)
export function firewallBonusOfStream(stream, grade){
  return stream === "erisian" ? Math.ceil(Math.max(0, Number(grade) || 0) / 2) : 0
}

// Apophenian daemon: half the submersion grade, rounded up, added to Sleaze (Kill Code p. 146)
export function sleazeBonusOfStream(stream, grade){
  return stream === "apophenian" ? Math.ceil(Math.max(0, Number(grade) || 0) / 2) : 0
}

/**
 * Cyberadept daemon (Kill Code p. 100): the Resonance lost to cyberware, and to cyberware alone, comes back up to half
 * the submersion grade, rounded up. The Resonance lost is the Essence lost rounded up, as updateSpecialAttributes counts it; the share of the
 * cyberware is what the loss would drop by without it.
 * @param {Number} essenceLost       all the Essence lost to implants
 * @param {Number} cyberwareLost     the part of it lost to cyberware
 */
export function resonanceRestoredByStream(stream, grade, essenceLost, cyberwareLost){
  if (stream !== "cyberadept") return 0
  const cap = Math.ceil(Math.max(0, Number(grade) || 0) / 2)
  if (!cap) return 0
  const round = n => Math.round(Math.max(0, Number(n) || 0) * 100) / 100
  const all = round(essenceLost)
  const withoutCyber = round(all - round(cyberwareLost))
  const share = Math.ceil(all) - Math.ceil(withoutCyber)
  return Math.min(cap, Math.max(0, share))
}

/**
 * Machinist daemon (Kill Code p. 100-101): the living persona acts as a rigger command console, save for creating or
 * joining a WAN, with Noise Reduction = Willpower and Sharing = Charisma, fixed and added to its attributes.
 * Reads an actor or the copy of the controller a drone carries ({system, items}).
 */
export function personaActsAsRcc(holder){
  const system = holder?.system ?? holder
  return system?.matrix?.deviceType === "livingPersona" && streamOf(holder) === "machinist"
}

// Echo [Programme] de résonance (SR5 p. 261): it copies the effects of one common or hacking program, chosen when the
// echo is taken, once per program. Its name tells the program, in its brackets ("[Lecture] de résonance") or, when they
// still read "Programme", in parentheses at the end ("[Programme] de résonance (Lecture)"); English: "Resonance [Program]"
const RESONANCE_PROGRAM = /\[([^\]]+)\]\s*de\s+r[ée]sonance|resonance\s*\[([^\]]+)\]/i
const GENERIC_PROGRAM = /^programs?$|^programmes?$/i
const comparable = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

// The program an echo [Programme] copies: its name, "" while the echo names none, null for any other item
export function echoedProgramName(item){
  if (item?.type !== "itemEcho") return null
  const name = item.name ?? ""
  const match = RESONANCE_PROGRAM.exec(name)
  if (!match) return null
  const program = (match[1] ?? match[2]).trim()
  if (!GENERIC_PROGRAM.test(program)) return program
  return /\(([^)]+)\)\s*$/.exec(name)?.[1]?.trim() ?? ""
}

// The program types an echo [Programme] may copy: common and hacking programs (SR5 p. 261); a Machinist's also
// copies autosofts and cyberprograms (Kill Code p. 101), the cyberprograms being the common and hacking ones (SR5 p. 246)
export function echoableProgramTypes(stream){
  return stream === "machinist" ? ["common", "hacking", "autosoft"] : ["common", "hacking"]
}

// Whether a program on the technomancer's sheet is copied by one of its echoes [Programme], and of a type the echo may
// copy. Read by its name, which may go on after the echo's ("Acquisition" copies "Acquisition (Ares Alpha)")
export function echoCopiesProgram(holder, program){
  if (!echoableProgramTypes(streamOf(holder)).includes(program?.system?.type)) return false
  const name = comparable(program.name)
  return itemsOf(holder).map(echoedProgramName).filter(Boolean).map(comparable)
    .some(echoed => name === echoed || name.startsWith(`${echoed} `) || name.startsWith(`${echoed}(`) || name.startsWith(`${echoed}[`))
}

export function machinistRccRatings(attributes){
  return {
    noiseReduction: Math.max(0, Number(attributes?.willpower?.augmented?.value) || 0),
    sharing: Math.max(0, Number(attributes?.charisma?.augmented?.value) || 0),
  }
}

// Echo Possession de la machine (SR5 p. 261): the benefit of a control rig of rating 1, taken up to three times.
// Echo IRHM (Data Trails p. 63): jumps into a vehicle that has no rigger interface. Recognized by their name, like the
// Aegis (aegis.js), or by a system effect of category specialCase
const MACHINE_MIND = /possession de la machine|machine mind/i
// Better Than Bad p. 145 (VO p. 161: « Resonant Discordance »)
const RESONANT_DISSONANCE = /dissonance r[ée]sonante|resonant (dissonance|discordance)/i
const HUMAN_MACHINE_INTERFACE = /\bIRHM\b|interface de r[ée]sonance homme.?machine|resonance man.?machine interface/i

function echoHas(item, pattern, specialCase){
  if (item?.type !== "itemEcho") return false
  if (pattern.test(item.name ?? "")) return true
  return Object.values(item.system?.systemEffects ?? {
  }).some(e => e?.category === "specialCase" && e.value === specialCase)
}

/**
 * Écho Dissonance résonante (Better Than Bad p. 145): « Vous pouvez désormais entrer en RV cold-sim. […] vous conservez
 * le bonus de +2 dés à toutes les actions matricielles. Si vous choisissez d'utiliser la RV hot-sim, vous bénéficiez
 * également d'un bonus de +2 dés pour les tests impliquant les compétences de Résonance suivantes : Compilation,
 * Décompilation et Filtrage de Formes complexes ». The VO (p. 161) reads « Compiling, Decompiling, and Threading complex
 * forms »: the third is threading, the Software test (RESONANT_DISSONANCE_ACTIONS). By its name, or by the system effect
 */
export const RESONANT_DISSONANCE_ACTIONS = ["compileSprite", "decompileSprite", "threadComplexForm"]

export function hasResonantDissonance(holder){
  return itemsOf(holder).some(item => echoHas(item, RESONANT_DISSONANCE, "echoResonantDissonance"))
}

// The control rig rating the echo gives: one per time it was taken (its rank, else one item each), three at most
export function machineMindRating(holder){
  let rating = 0
  for (const item of itemsOf(holder)){
    if (echoHas(item, MACHINE_MIND, "echoMachineMind")) rating += Math.max(1, Number(item.system?.rank) || 0)
  }
  return Math.min(3, rating)
}

export function hasHumanMachineInterface(holder){
  return itemsOf(holder).some(i => echoHas(i, HUMAN_MACHINE_INTERFACE, "echoHumanMachineInterface"))
}

/**
 * May the controller of a drone or vehicle jump into it? It takes a control rig (SR5 p. 243, 267), or the echo
 * Possession de la machine that stands for one, and a rigger interface on the vehicle (every drone has one), which the
 * echo IRHM does without (Data Trails p. 63).
 * @param {Object} vehicleSystem   the system of the drone or vehicle, its controller copied in vehicleOwner
 * @param {Boolean} riggerInterface  whether the vehicle has a rigger interface
 */
export function mayJumpIn(vehicleSystem, riggerInterface){
  const owner = vehicleSystem?.vehicleOwner
  if (!owner?.id) return false
  const controlRig = Math.max(Number(owner.system?.specialProperties?.controlRig?.value) || 0, machineMindRating(owner))
  if (controlRig <= 0) return false
  return !!riggerInterface || hasHumanMachineInterface(owner)
}
