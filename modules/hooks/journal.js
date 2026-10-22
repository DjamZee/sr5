// Compendium of the fork's user manual (packs/manuel), compiled from src/packs/manuel by `npm run build:packs`
export const SR5_MANUAL_PACK = 'sr5.manuel'

// First page of the first journal of the manual pack (the table of contents of "0. Démarrer"),
// read from the pack index: nothing is imported into the world
export async function sr5OpenManual() {
  const pack = game.packs.get(SR5_MANUAL_PACK)
  if (!pack) return ui.notifications.warn(game.i18n.localize('SR5.ManualMissing'))
  const index = await pack.getIndex({
    fields: ['sort'] 
  })
  const first = [...index].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]
  // A source checkout served before `npm run build:packs` (or `npm run check`) has the pack declared but empty:
  // Foundry creates it empty (DjamZ's 30000, 21/10)
  if (!first) return ui.notifications.warn(game.i18n.localize('SR5.ManualEmpty'), {
    permanent: true
  })
  const entry = await pack.getDocument(first._id)
  const page = [...entry.pages].sort((a, b) => a.sort - b.sort)[0]
  return entry.sheet.render(true, {
    pageId: page?.id
  })
}

// Add a "Manual" button to the journal sidebar header, for the GM and for players
export function sr5HookRenderJournalDirectory(_app, html) {
  if (!game.packs.get(SR5_MANUAL_PACK)) return
  const header = html.querySelector('.directory-header')
  if (!header || header.querySelector('.sr-manual-btn')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('sr-manual-btn')
  btn.innerHTML = `<i class="fas fa-book"></i> ${game.i18n.localize('SR5.Manual')}`
  btn.addEventListener('click', () => sr5OpenManual())
  header.appendChild(btn)
}
