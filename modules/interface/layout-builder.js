/**
 * Layout builder shared by the actor sheets (compute-layout.js) and the item
 * sheets (compute-item-layout.js): merges a layout definition with a block
 * registry to produce a fully resolved layout ready for template rendering.
 *
 * Ported from SR6's block-registry.js computeLayout / _buildSections.
 */

/**
 * @typedef {object} LayoutRegistry
 * @property {object}  blocks          – block id → { partial, label, size }
 * @property {object}  sizes           – the registry's BLOCK_SIZE enum
 * @property {object}  icons           – icon key → SVG path
 * @property {string}  fallbackIcon    – icon key used when none matches
 * @property {boolean} doubleGridColumn – place double blocks of a 3-column panel by their column
 */

/**
 * Group an ordered list of blocks into rendering sections.
 * Single-width blocks in a multi-column panel get grouped into 'columns'
 * sections; wider blocks get 'full' sections.
 *
 * @param {Array}  blocks    – block entries from the layout definition
 * @param {number} panelCols – number of columns in the panel
 * @param {LayoutRegistry} registry
 * @returns {Array} sections
 */
function _buildSections(blocks, panelCols, registry) {
  const sections = []
  let current = null

  for (const block of blocks) {
    const def = registry.blocks[block.id]
    if (!def) continue
    if (block.hidden) continue

    const isColumnBlock = def.size === registry.sizes.SINGLE && panelCols > 1 && block.column !== undefined
    const type = isColumnBlock ? 'columns' : 'full'

    if (!current || current.type !== type) {
      if (type === 'columns') {
        const cols = []
        for (let i = 0; i < panelCols; i++) cols.push([])
        current = {
          type: 'columns', columns: cols
        }
      } else {
        current = {
          type: 'full', blocks: []
        }
      }
      sections.push(current)
    }

    const blockData = {
      id: block.id,
      uid: block.uid ?? block.id,
      partial: def.partial,
      label: def.label,
      size: def.size,
    }

    if (type === 'columns') {
      const colIdx = Math.min(block.column ?? 0, panelCols - 1)
      current.columns[colIdx].push(blockData)
    } else {
      if (registry.doubleGridColumn && def.size === registry.sizes.DOUBLE && panelCols === 3 && block.column !== undefined) {
        blockData.gridColumn = block.column + 1
      }
      current.blocks.push(blockData)
    }
  }

  return sections
}

/**
 * Resolve a layout definition against a block registry.
 *
 * @param {{ panels: Array }} source – the layout definition (default or custom)
 * @param {LayoutRegistry} registry
 * @returns {{ panels: Array }}  Layout ready for template consumption
 */
export function buildLayout(source, registry) {
  const icons = registry.icons
  const fallbackIcon = registry.fallbackIcon
  const panels = []

  for (let i = 0; i < source.panels.length; i++) {
    const panelDef = source.panels[i]
    if (panelDef.hidden) continue
    const width = panelDef.width ?? 1
    const group = `panel-${i}`

    const tabs = []
    for (const tabDef of (panelDef.tabs ?? [])) {
      if (tabDef.hidden) continue
      const sections = _buildSections(tabDef.blocks ?? [], width, registry)
      if (sections.length === 0) continue

      // Normalize legacy .svg.hbs paths to .svg
      const rawIcon = tabDef.icon?.replace(/\.svg\.hbs$/, '.svg')

      const iconKey = tabDef.iconKey ??
        Object.entries(icons).find(([, v]) => v === rawIcon)?.[0] ??
        fallbackIcon

      tabs.push({
        id: tabDef.id,
        label: tabDef.label ?? '',
        icon: icons[iconKey] ?? icons[fallbackIcon],
        iconKey,
        group,
        sections,
      })
    }

    if (tabs.length === 0) continue

    panels.push({
      id: panelDef.id,
      width,
      group,
      tabs,
    })
  }

  return {
    panels
  }
}
