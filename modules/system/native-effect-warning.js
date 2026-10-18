// Foundry's own active effects (decision of DjamZ, 19/10, "option B"): the system prepares its actors itself and never
// applies the "changes" of an ActiveEffect (Attribute Key / Change Mode / Value, or an effect laid by a generic module
// or a macro). Such an effect did nothing, silently: the user who writes one is now told, once per effect.
// The system's own effects are left alone: its token statuses are ActiveEffects without changes, and its bonuses and
// maluses are items of type "Effet" (customEffects), never ActiveEffects.

// The effects already reported in this client: editing one again does not repeat the notice
const WARNED = new Set()

export function hasNativeChanges(effect) {
  return Array.isArray(effect?.changes) && effect.changes.length > 0
}

function warnOnce(effect) {
  const key = effect.uuid ?? effect.id
  if (WARNED.has(key)) return false
  WARNED.add(key)
  ui.notifications?.warn(game.i18n.localize("SR5.NativeEffectIgnored"), {
    permanent: false
  })
  return true
}

// Created with changes, by this client only: the other clients receive the same hook and stay quiet
export function onCreateNativeEffect(effect, options, userId) {
  if (userId !== game.user?.id || !hasNativeChanges(effect)) return false
  return warnOnce(effect)
}

// Updated: only when the update writes the changes themselves, so a rename or a toggle never warns
export function onUpdateNativeEffect(effect, changed, options, userId) {
  if (userId !== game.user?.id || !Object.hasOwn(changed ?? Object(), "changes") || !hasNativeChanges(effect)) return false
  return warnOnce(effect)
}

// One line at the top of Foundry's own effect window, saying the same
export function onRenderNativeEffectConfig(app, element) {
  const root = element instanceof HTMLElement ? element : element?.[0]
  const content = root?.querySelector?.(".window-content") ?? root
  if (!content || content.querySelector(".sr5-native-effect-banner")) return
  const banner = document.createElement("p")
  banner.className = "notification warning sr5-native-effect-banner"
  banner.textContent = game.i18n.localize("SR5.NativeEffectIgnoredBanner")
  content.prepend(banner)
}

export function registerNativeEffectWarningHooks() {
  Hooks.on("createActiveEffect", onCreateNativeEffect)
  Hooks.on("updateActiveEffect", onUpdateNativeEffect)
  Hooks.on("renderActiveEffectConfig", onRenderNativeEffectConfig)
}
