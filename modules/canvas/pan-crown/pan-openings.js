// How the crowns of PANs open (couronne du PAN, lot 8; decision 4 and Q8 of DjamZ, 07/10): the button "PAN" of the
// token HUD, always there; "on hover" and "always visible", a client setting of each user; and the AR view, a key that
// shows the crowns of every visible token, which toggles or is held, as each user chooses. The rules are pure, the
// layer (pan-crown-layer.js) applies them.

export const PAN_OPENING_MODES = ["hud", "hover", "always"]
export const PAN_AR_KEY_BEHAVIORS = ["toggle", "hold"]
// "M" is free in the core of Foundry V13 (13.351) and in the system: measured on 07/10
export const PAN_AR_KEY_DEFAULT = "KeyM"

/**
 * The tokens whose crown is open.
 * @param {Object} state
 * @param {Array<String>} state.tokenIds      the tokens of the scene that may carry a crown
 * @param {Set<String>} [state.manual]        opened with the HUD button (or the API)
 * @param {Set<String>} [state.dismissed]     closed with the HUD button while another opening showed them
 * @param {String|null} [state.hovered]       the token under the pointer, in the mode "hover"
 * @param {String} [state.mode]               "hud", "hover" or "always"
 * @param {Boolean} [state.arView]            the AR view of the key
 * @return {Set<String>}
 */
export function crownsToShow({
  tokenIds = [], manual = new Set(), dismissed = new Set(), hovered = null, mode = "hud", arView = false
} = {
}){
  const known = new Set(tokenIds)
  const shown = new Set([...manual].filter(id => known.has(id)))
  if (mode === "hover" && hovered && known.has(hovered)) shown.add(hovered)
  // The AR view and "always visible": every crown, but the ones closed by hand
  if (arView || mode === "always") {
    for (const id of tokenIds) if (!dismissed.has(id)) shown.add(id)
  }
  return shown
}

/**
 * The AR view after the key is pressed or released.
 * @param {Boolean} arView      the AR view before
 * @param {"down"|"up"} event
 * @param {String} behavior     "toggle" (each press shows or hides) or "hold" (shown while the key is down)
 * @return {Boolean}
 */
export function arViewAfter(arView, event, behavior = "toggle"){
  if (behavior === "hold") return event === "down"
  return event === "down" ? !arView : arView
}

/** A client setting of the system, or its default when it cannot be read (tests, before init) */
function clientSetting(key, fallback, allowed){
  try {
    const value = game.settings.get("sr5", key)
    return allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function panOpeningMode(){
  return clientSetting("panCrownOpening", "hover", PAN_OPENING_MODES)
}

export function panArKeyBehavior(){
  return clientSetting("panCrownArKey", "toggle", PAN_AR_KEY_BEHAVIORS)
}

/** The client settings of the openings, registered with the system's (utilitySystem.js) */
export function registerPanOpeningSettings(){
  game.settings.register("sr5", "panCrownOpening", {
    name: "SR5.SETTINGS_PanCrownOpening_T",
    hint: "SR5.SETTINGS_PanCrownOpening_D",
    scope: "client",
    config: true,
    default: "hover",
    type: String,
    choices: {
      hud: "SR5.SETTINGS_PanCrownOpening_hud",
      hover: "SR5.SETTINGS_PanCrownOpening_hover",
      always: "SR5.SETTINGS_PanCrownOpening_always",
    },
    onChange: () => canvas?.sr5PanCrown?.sync()
  })
  game.settings.register("sr5", "panCrownArKey", {
    name: "SR5.SETTINGS_PanCrownArKey_T",
    hint: "SR5.SETTINGS_PanCrownArKey_D",
    scope: "client",
    config: true,
    default: "toggle",
    type: String,
    choices: {
      toggle: "SR5.SETTINGS_PanCrownArKey_toggle",
      hold: "SR5.SETTINGS_PanCrownArKey_hold",
    },
    // A view held when the behavior changes is let go
    onChange: () => canvas?.sr5PanCrown?.setArView(false)
  })
}

/** The key of the AR view, in the controls of Foundry (to be called at init). Foundry does not run it while a text
 * field has the focus (KeyboardManager#hasFocus). */
function pressPanArKey(event){
  if (game.keyboard?.hasFocus) return false
  const layer = canvas?.sr5PanCrown
  if (!layer) return false
  layer.setArView(arViewAfter(layer.arView, event, panArKeyBehavior()))
  return true
}

export function registerPanArKey(){
  const press = pressPanArKey
  game.keybindings.register("sr5", "panCrownArView", {
    name: "SR5.KEYBINDING_PanCrownArView_T",
    hint: "SR5.KEYBINDING_PanCrownArView_D",
    editable: [{
      key: PAN_AR_KEY_DEFAULT
    }],
    onDown: () => press("down"),
    onUp: () => press("up"),
    repeat: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  })
  Hooks.on("getSceneControlButtons", addPanArViewTool)
  // A key held while the window loses the focus is never released for Foundry
  window.addEventListener("blur", () => {
    if (panArKeyBehavior() === "hold") canvas?.sr5PanCrown?.setArView(false)
  })
  Hooks.once("ready", adaptPanArKeyToLayout)
}

/** The button of the AR view in the token tools, for the gamemaster, beside its key (séance de DjamZ du 09/10: some
 * prefer a button to a key) */
export function addPanArViewTool(controls){
  const tokens = controls?.tokens ?? controls?.token
  if (!tokens?.tools || !game.user?.isGM) return
  tokens.tools.sr5PanArView = {
    name: "sr5PanArView",
    title: "SR5.PanCrownArViewTool",
    icon: "fas fa-circle-nodes",
    order: Object.keys(tokens.tools).length,
    toggle: true,
    active: !!canvas?.sr5PanCrown?.arView,
    onChange: (_event, active) => canvas?.sr5PanCrown?.setArView(active),
  }
}

/** The button follows the AR view when the key changes it */
export function syncPanArViewTool(shown){
  const controls = globalThis.ui?.controls
  const tool = controls?.controls?.tokens?.tools?.sr5PanArView
  if (!tool || tool.active === shown) return
  tool.active = shown
  controls.render()
}

/**
 * The physical key that types a letter on this keyboard, from the entries of the browser's layout map; null when
 * none does.
 * @param {Iterable<[String, String]>} layoutEntries  [code, character] pairs (KeyboardLayoutMap)
 * @param {String} letter
 * @return {String|null}
 */
export function codeOfLetter(layoutEntries, letter){
  for (const [code, character] of layoutEntries ?? []) if (character?.toLowerCase() === letter) return code
  return null
}

/** Foundry reads a key by its place on a QWERTY keyboard (event.code): on AZERTY, KeyM is the "," key (séance de
 * DjamZ du 09/10). A user who kept the default gets the key that types "m" on their keyboard instead. The browser's
 * layout map is read first; it is missing in Firefox and Safari, and comes back empty in some Chromium browsers even
 * on a secure page (relecture 161): then the first key that types "m" teaches it (learnPanArKeyFromTyping). */
async function adaptPanArKeyToLayout(){
  let layout = null
  try {
    layout = await navigator.keyboard?.getLayoutMap?.()
  } catch (_err) {
    layout = null
  }
  const code = layout && codeOfLetter(layout.entries(), "m")
  if (!code) return learnPanArKeyFromTyping()
  if (code === PAN_AR_KEY_DEFAULT) return
  if (keptDefaultArKey(game.keybindings.get("sr5", "panCrownArView"))) await game.keybindings.set("sr5", "panCrownArView", [{
    key: code
  }])
}

/** Is the key of the AR view still the default one, alone and without modifier? */
export function keptDefaultArKey(bindings){
  return bindings?.length === 1 && bindings[0].key === PAN_AR_KEY_DEFAULT && !bindings[0].modifiers?.length
}

/** The physical key of a keydown that types a letter (event.key, read through the layout of the keyboard), with no
 * Control, Alt or Meta; null otherwise. */
export function codeTypingLetter(event, letter){
  if (!event || event.ctrlKey || event.altKey || event.metaKey) return null
  if (event.key?.toLowerCase() !== letter) return null
  return event.code || null
}

/** Without a layout map: the first keydown that types "m" gives its key. If it is not KeyM and the default was kept, the
 * binding takes it, and this press already works (Foundry, still bound to KeyM, did not see it). */
function learnPanArKeyFromTyping(){
  const learn = event => {
    const code = codeTypingLetter(event, "m")
    if (!code) return
    window.removeEventListener("keydown", learn, true)
    if (code === PAN_AR_KEY_DEFAULT || !keptDefaultArKey(game.keybindings.get("sr5", "panCrownArView"))) return
    game.keybindings.set("sr5", "panCrownArView", [{
      key: code
    }]).catch(err => console.error("SR5 | AR view key not saved", err))
    if (event.repeat || !pressPanArKey("down")) return
    // Held: let go at the release of this key
    const release = up => {
      if (up.code !== code) return
      window.removeEventListener("keyup", release, true)
      pressPanArKey("up")
    }
    window.addEventListener("keyup", release, true)
  }
  window.addEventListener("keydown", learn, true)
}
