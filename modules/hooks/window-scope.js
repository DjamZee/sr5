// Which windows the theme dresses (window.less, dialog.less, controls.less). It used to dress every window but the
// system's sheets, so a module's window got the paper ground, the dark labels, the red buttons and the footer that
// fills the window (Agathe#2507, 16/10: sfx-sr5, Scene Transitions, Gambit's Games, Simple Calendar). Now only
// Foundry's own windows and the system's take the dress; a module's window is marked sr-foreign-window and keeps its
// look, with only the theme's fonts (window.less).

export const FOREIGN_WINDOW_CLASS = "sr-foreign-window"

// The modules whose windows the system dresses on purpose (their own .less files in styles/components)
const SKINNED_MODULE_WINDOWS = ".monks-enhanced-journal, .gm-notes, :has(.totm-manager)"

// The classes a window of Foundry carries by itself, whatever its class asks for
const FRAME_CLASSES = new Set(["app", "window-app", "application", "themed", "minimized", "maximized", "minimizing",
  "maximizing", "dialog", "sheet", "form", "sr-skin-dialog", FOREIGN_WINDOW_CLASS, "sr-dress-off"])

// The classes Foundry's windows put on themselves while open (Foundry 13.351, client/applications)
const CORE_STATE_CLASSES = new Set(["expanded", "collapsing", "collapsed", "active", "deleting", "locked", "editable",
  "readonly", "dragging", "vertical", "horizontal", "top", "sm", "md", "lg", "large", "min", "paused"])

let coreClasses = null

/** The application classes of Foundry itself, read once from its namespaces */
export function getCoreApplicationClasses(roots = [globalThis.foundry?.applications, globalThis.foundry?.appv1]) {
  if (coreClasses && arguments.length === 0) return coreClasses
  const found = new Set()
  const seen = new WeakSet()
  const walk = (node, depth) => {
    if (!node || depth > 4 || seen.has(node)) return
    seen.add(node)
    for (const key of Object.keys(node)) {
      let value
      try { value = node[key] } catch { continue }
      if (typeof value === "function" && value.prototype) found.add(value)
      else if (value && typeof value === "object" && !Array.isArray(value)) walk(value, depth + 1)
    }
  }
  for (const root of roots) walk(root, 0)
  if (arguments.length === 0) coreClasses = found
  return found
}

/** The classes the application's own class chain asks for (DEFAULT_OPTIONS for V2, defaultOptions for V1) */
function defaultClasses(app) {
  const out = new Set()
  for (let cls = app?.constructor; cls && cls !== Function.prototype; cls = Object.getPrototypeOf(cls)) {
    if (Object.hasOwn(cls, "DEFAULT_OPTIONS")) for (const c of cls.DEFAULT_OPTIONS?.classes ?? []) out.add(c)
  }
  try { for (const c of app?.constructor?.defaultOptions?.classes ?? []) out.add(c) } catch { /* not a V1 app */ }
  return out
}

// The marks this file puts begin with "sr" too: read as the system's, they unmarked a module's window at its second
// render (19/10)
const OWN_MARKS = new Set([FOREIGN_WINDOW_CLASS, "sr-dress-off"])
const isSystemClass = c => /^sr/i.test(c) && !OWN_MARKS.has(c)

/**
 * Whether a window belongs to a module: its class is not one of Foundry's, or it is one of Foundry's (a DialogV2) to
 * which the module gave classes of its own. The system's windows (an sr… class or id) and the modules the system
 * dresses on purpose are never foreign.
 */
export function isForeignWindow(app, element, core = getCoreApplicationClasses()) {
  if (!element?.classList) return false
  const classes = [...element.classList]
  if (classes.some(isSystemClass) || isSystemClass(element.id ?? "")) return false
  if (element.classList.contains("sidebar-popout")) return false
  // A tab of the sidebar (Actors, Items, Chat…), Foundry's or the system's subclass of it: Foundry gives it the class
  // "<tab>-sidebar" at opening, outside its DEFAULT_OPTIONS, which marked every tab after each render (DjamZ, 19/10)
  if (element.classList.contains("sidebar-tab")) return false
  try { if (element.matches(SKINNED_MODULE_WINDOWS)) return false } catch { /* :has() unsupported */ }
  if (!core.has(app?.constructor)) return true
  // The classes asked for at opening and the element's (a module may add its own after the render, Simple Quest's
  // welcome), less those Foundry's windows take as they go (edit-mode, expanded…: read in client/applications)
  const defaults = defaultClasses(app)
  // A document sheet of Foundry also takes its document's type (a deck of cards: "deck")
  for (const c of [app?.document?.type, app?.document?.documentName?.toLowerCase()]) if (c) defaults.add(c)
  return [...(app?.options?.classes ?? []), ...classes].some(c => !FRAME_CLASSES.has(c) && !defaults.has(c) &&
    !CORE_STATE_CLASSES.has(c) && !/^theme-|-mode$/.test(c) && !isSystemClass(c))
}

/** The DOM element of a jQuery object (V1) or the element itself (V2). Not `x[0] ?? x`: a window drawn as a <form>
 * answers [0] with its first field (sfx-sr5, Dice So Nice) */
export function windowElement(x) {
  return x?.jquery ? x[0] : x
}

// The SR5 dress of the modules' windows (DjamZ, 19/10, module-dress.less): a world setting, checked by default, puts
// DRESS_BODY_CLASS on the body; a module's window then takes the Concepteur's colours and inner margins.
export const DRESS_SETTING = "sr5DressModuleWindows"
export const DRESS_BODY_CLASS = "sr-dress-modules"
export const DRESS_OFF_CLASS = "sr-dress-off"

// The modules' windows that keep their own look, by a class or selector their window carries. Matrice and Topologie
// draw their own (DjamZ, 16/10); add here any window the dress breaks, with the reason.
export const DRESS_EXCLUDED = [
  ".matrice-sr5", // Matrice: its consoles and dark dialogs (DjamZ, 16/10)
  ".topologie-sr5", // Topologie: its own window (DjamZ, 16/10)
]

/** Whether a module's window keeps its own look (DRESS_EXCLUDED) */
export function isDressExcluded(element) {
  return DRESS_EXCLUDED.some(selector => {
    try { return element.matches(selector) || !!element.querySelector(selector) } catch { return false }
  })
}

/** Whether the world dresses the modules' windows (the default) */
export function modulesDressed() {
  try {
    return game.settings.get("sr5", DRESS_SETTING) !== false
  } catch {
    return true
  }
}

/** Puts the dress on or off for the whole page (at ready, and when the setting changes) */
export function applyModuleDress(enabled = modulesDressed()) {
  globalThis.document?.body?.classList.toggle(DRESS_BODY_CLASS, !!enabled)
}

/** Render hook (V1 and V2): marks a module's window so the theme leaves it alone, or dresses it (module-dress.less) */
export function sr5HookMarkForeignWindow(app, html) {
  const element = windowElement(app?.element) ?? windowElement(html)
  if (!element?.classList) return
  const foreign = isForeignWindow(app, element)
  element.classList.toggle(FOREIGN_WINDOW_CLASS, foreign)
  element.classList.toggle(DRESS_OFF_CLASS, foreign && isDressExcluded(element))
}
