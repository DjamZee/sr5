// The ambiences of the PAN crowns (couronne du PAN, lot 9; decision 7 of DjamZ, 07/10): Static, Sober (the crown
// unfolds in half a second, pulses run along the lines) and Spectacular (a rain of code, a halo and a flicker of the
// icons). Each user chooses for her own machine (client setting), the gamemaster sets a ceiling (world setting), and
// the effective level falls back on Static when the client asked for reduced motion or when Foundry's performance mode
// is low. The rules are pure, the layer (pan-crown-layer.js) applies them.

export const PAN_AMBIENCE_LEVELS = ["static", "sober", "spectacular"]
// The bench of PLAN-COURONNE-PAN-MATRICE § 3: a free rain costs up to 6.65 ms per render, 400 glyphs 0.87 ms
export const PAN_RAIN_MAX = 400
export const PAN_DEPLOY_MS = 500
export const PAN_PULSE_PERIOD_MS = 1400

/** The rank of a level, 0 (static) to 2 (spectacular); an unknown level is static */
export function ambienceRank(level){
  return Math.max(0, PAN_AMBIENCE_LEVELS.indexOf(level))
}

/**
 * The level a client draws.
 * @param {Object} state
 * @param {String} [state.client]           what the user chose
 * @param {String} [state.cap]              the ceiling of the gamemaster
 * @param {Boolean} [state.reducedMotion]   the client asked for reduced motion (prefers-reduced-motion)
 * @param {Boolean} [state.lowPerformance]  Foundry's performance mode is low
 * @return {String}
 */
export function effectiveAmbience({
  client = "static", cap = "spectacular", reducedMotion = false, lowPerformance = false
} = {
}){
  if (reducedMotion || lowPerformance) return "static"
  return PAN_AMBIENCE_LEVELS[Math.min(ambienceRank(client), ambienceRank(cap))]
}

/** How far a crown has unfolded, a spring from its token: 0 at the opening, past 1 a moment, then 1 */
export function deployScale(elapsed, duration = PAN_DEPLOY_MS){
  if (!(elapsed < duration)) return 1
  const k = Math.max(0, elapsed) / duration - 1
  // easeOutBack
  const c1 = 1.70158
  return 1 + (c1 + 1) * k ** 3 + c1 * k ** 2
}

/** Where a pulse is on its line at a time; the phase keeps it in place when the crown is drawn again */
export function pulsePoint(from, to, now, phase = 0, period = PAN_PULSE_PERIOD_MS){
  const u = ((now / period + phase) % 1 + 1) % 1
  return {
    x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u
  }
}

/** A fixed phase for the n-th line of a crown, spread evenly (golden ratio) */
export function pulsePhase(index){
  return (index * 0.6180339887) % 1
}

/**
 * The crowns the rain of code falls on: the ones opened one by one (HUD button or hover), never the AR view nor
 * "always visible" (Q10 of DjamZ).
 * @return {Set<String>}
 */
export function rainCrownIds({
  shown = new Set(), manual = new Set(), hovered = null
} = {
}){
  const ids = new Set([...manual].filter(id => shown.has(id)))
  if (hovered && shown.has(hovered)) ids.add(hovered)
  return ids
}

/**
 * Whether a crown has something of the Matrix to show: a device, a drone, a persona, a sprite… A file alone is no
 * device. An actor with none gets no rain of code (pack 5, DjamZ, 21/10: « un acteur sans appareil ne doit pas recevoir
 * son effet spectaculaire »); its halos and flickers already follow the icons, which it has none of.
 * @param {Object} graph  buildPanGraph's graph
 * @return {Boolean}
 */
export function crownHasDevice(graph){
  return !!graph?.master || !!graph?.rigger || !!graph?.wan || (graph?.nodes ?? []).some(node => node.kind !== "file")
}

/** A setting of the system, or its default when it cannot be read (tests, before init) */
function setting(key, fallback){
  try {
    const value = game.settings.get("sr5", key)
    return PAN_AMBIENCE_LEVELS.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function prefersReducedMotion(){
  try {
    return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

export function isLowPerformance(){
  const low = globalThis.CONST?.CANVAS_PERFORMANCE_MODES?.LOW ?? 0
  const mode = globalThis.canvas?.performance?.mode
  return typeof mode === "number" && mode <= low
}

/** The level this client draws now */
export function currentAmbience(){
  return effectiveAmbience({
    client: setting("panCrownAmbience", "sober"),
    cap: setting("panCrownAmbienceCap", "spectacular"),
    reducedMotion: prefersReducedMotion(),
    lowPerformance: isLowPerformance(),
  })
}

const CHOICES = {
  static: "SR5.SETTINGS_PanCrownAmbience_static",
  sober: "SR5.SETTINGS_PanCrownAmbience_sober",
  spectacular: "SR5.SETTINGS_PanCrownAmbience_spectacular",
}

/** The settings of the ambiences, registered with the system's (utilitySystem.js) */
export function registerPanAmbienceSettings(){
  const onChange = () => globalThis.canvas?.sr5PanCrown?.applyAmbience()
  game.settings.register("sr5", "panCrownAmbience", {
    name: "SR5.SETTINGS_PanCrownAmbience_T",
    hint: "SR5.SETTINGS_PanCrownAmbience_D",
    scope: "client",
    config: true,
    default: "sober",
    type: String,
    choices: CHOICES,
    onChange,
  })
  game.settings.register("sr5", "panCrownAmbienceCap", {
    name: "SR5.SETTINGS_PanCrownAmbienceCap_T",
    hint: "SR5.SETTINGS_PanCrownAmbienceCap_D",
    scope: "world",
    config: true,
    default: "spectacular",
    type: String,
    choices: CHOICES,
    onChange,
  })
  // The reduced motion of the system can change while the game runs
  try {
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener("change", onChange)
  } catch {
    // An old browser: read again at each drawing
  }
  // In the settings, the levels above the gamemaster's ceiling are greyed out (the chosen one stays readable)
  globalThis.Hooks?.on("renderSettingsConfig", (app, html) => greyAboveCap(html instanceof HTMLElement ? html : html?.[0]))
}

function greyAboveCap(root){
  const select = root?.querySelector?.("select[name='sr5.panCrownAmbience']")
  if (!select) return
  const cap = ambienceRank(setting("panCrownAmbienceCap", "spectacular"))
  const suffix = game.i18n.localize("SR5.SETTINGS_PanCrownAmbience_aboveCap")
  for (const option of select.options){
    if (ambienceRank(option.value) <= cap) continue
    if (!option.selected) option.disabled = true
    option.textContent = `${option.textContent} (${suffix})`
  }
}
