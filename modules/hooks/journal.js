// Compendiums of the fork's user manual, compiled from src/packs/<name> by `npm run build:packs`:
// the French edition (packs/manuel) and the English one (packs/manual), both written in the manuel-sr5 repository
export const SR5_MANUAL_PACK = 'sr5.manuel'
export const SR5_MANUAL_PACK_EN = 'sr5.manual'

// Packs to try, in order: the manual in Foundry's language (French for French, English for any other language),
// then the French one, which is the reference edition
export function sr5ManualPacks() {
  return game.i18n.lang === 'fr' ? [SR5_MANUAL_PACK] : [SR5_MANUAL_PACK_EN, SR5_MANUAL_PACK]
}

// First page of the first journal of the manual pack (the table of contents of "0. Démarrer"),
// read from the pack index: nothing is imported into the world
export async function sr5OpenManual() {
  const packs = sr5ManualPacks().map(id => game.packs.get(id)).filter(Boolean)
  if (!packs.length) return ui.notifications.warn(game.i18n.localize('SR5.ManualMissing'))
  for (const pack of packs) {
    const index = await pack.getIndex({
      fields: ['sort']
    })
    const first = [...index].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]
    // An empty pack falls back to the next one (an English pack not yet filled leaves the French manual)
    if (!first) continue
    const entry = await pack.getDocument(first._id)
    const page = [...entry.pages].sort((a, b) => a.sort - b.sort)[0]
    return entry.sheet.render(true, {
      pageId: page?.id
    })
  }
  // A source checkout served before `npm run build:packs` (or `npm run check`) has the packs declared but empty:
  // Foundry creates them empty (DjamZ's 30000, 21/10)
  return ui.notifications.warn(game.i18n.localize('SR5.ManualEmpty'), {
    permanent: true
  })
}

// Add a "Manual" button to the journal sidebar header, for the GM and for players
export function sr5HookRenderJournalDirectory(_app, html) {
  if (!sr5ManualPacks().some(id => game.packs.get(id))) return
  const header = html.querySelector('.directory-header')
  if (!header || header.querySelector('.sr-manual-btn')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('sr-manual-btn')
  btn.innerHTML = `<i class="fas fa-book"></i> ${game.i18n.localize('SR5.Manual')}`
  btn.addEventListener('click', () => sr5OpenManual())
  header.appendChild(btn)
}
