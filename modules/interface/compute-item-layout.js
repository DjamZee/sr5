/**
 * Item Layout Computation — merges default layout with the item block registry
 * to produce a fully resolved layout ready for template rendering.
 *
 * Same builder as compute-layout.js (layout-builder.js), with ITEM_BLOCK_REGISTRY.
 */

import {
  ITEM_BLOCK_REGISTRY, ITEM_BLOCK_SIZE, ITEM_TAB_ICONS
} from './item-block-registry.js'
import {
  getItemDefaultLayout
} from './item-default-layout.js'
import {
  buildLayout
} from './layout-builder.js'

// Item sheets never placed double blocks by column: doubleGridColumn stays off.
const ITEM_REGISTRY = {
  blocks: ITEM_BLOCK_REGISTRY,
  sizes: ITEM_BLOCK_SIZE,
  icons: ITEM_TAB_ICONS,
  fallbackIcon: 'info',
  doubleGridColumn: false,
}

// ---------------------------------------------------------------------------
//  computeItemLayout — public entry point
// ---------------------------------------------------------------------------

export function computeItemLayout(itemType) {
  return buildLayout(getItemDefaultLayout(itemType), ITEM_REGISTRY)
}
