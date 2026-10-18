/**
 * Layout Computation — merges default or custom layout with the block registry
 * to produce a fully resolved layout ready for template rendering.
 *
 * The builder itself is shared with the item sheets (layout-builder.js).
 */

import {
  BLOCK_REGISTRY, BLOCK_SIZE, TAB_ICONS
} from './block-registry.js'
import {
  getDefaultLayout
} from './default-layout.js'
import {
  buildLayout
} from './layout-builder.js'

const ACTOR_REGISTRY = {
  blocks: BLOCK_REGISTRY,
  sizes: BLOCK_SIZE,
  icons: TAB_ICONS,
  fallbackIcon: 'core',
  doubleGridColumn: true,
}

// ---------------------------------------------------------------------------
//  computeLayout — public entry point
// ---------------------------------------------------------------------------

/**
 * Compute the full effective layout for an actor sheet render.
 *
 * @param {string} actorType – sheet class name (SR5ActorSheet, SR5GruntSheet, etc.)
 * @param {object} prefs     – actor.system.sheetPreferences
 * @returns {{ panels: Array }}  Layout ready for template consumption
 */
export function computeLayout(actorType, prefs = {
}) {
  const source = (prefs.customLayout?.panels?.length) ?
    prefs.customLayout :
    getDefaultLayout(actorType)

  return buildLayout(source, ACTOR_REGISTRY)
}
