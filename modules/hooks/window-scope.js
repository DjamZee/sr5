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
  "maximizing", "dialog", "sheet", "form", "sr-skin-dialog", FOREIGN_WINDOW_CLASS])

// The classes Foundry's windows put on themselves while open (Foundry 13.351, client/applications)
const CORE_STATE_CLASSES = new Set(["expanded", "collapsing", "collapsed", "active", "deleting", "locked", "editable",
  "readonly", "dragging", "vertical", "horizontal", "top", "sm", "md", "lg", "large", "min"])

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

const isSystemClass = c => /^sr/i.test(c)

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

/** Render hook (V1 and V2): marks a module's window so the theme leaves it alone */
export function sr5HookMarkForeignWindow(app, html) {
  const element = windowElement(app?.element) ?? windowElement(html)
  if (!element?.classList) return
  element.classList.toggle(FOREIGN_WINDOW_CLASS, isForeignWindow(app, element))
}
