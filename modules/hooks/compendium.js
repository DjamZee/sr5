import {
  SR5CompendiumInfo
} from "../interface/compendium.js"
import {
  SR5CompendiumBrowser
} from "../interface/compendium-browser.js"
import {
  otherLanguageManualPack
} from "./journal.js"

export async function sr5HookRenderCompendium(pack, html, compendiumData) {
  SR5CompendiumInfo.onRenderCompendium(pack, html, compendiumData)
}

// A document of a compendium created, changed or deleted: the browser's shared index is read again (lot 9)
export function sr5HookCompendiumDocumentChanged(document) {
  SR5CompendiumBrowser.onDocumentChanged(document)
}

// Add Compendium Browser button to the compendium sidebar
export function sr5HookRenderCompendiumDirectory(_app, html) {
  const otherManual = otherLanguageManualPack()
  //A class and not a style: Foundry's search filter writes the entries' display after this hook (sidebar.less)
  if (otherManual) html.querySelector(`[data-pack="${otherManual}"]`)?.classList.add("sr-other-language-manual")
  const header = html.querySelector('.directory-header')
  if (!header) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.classList.add('sr-compendium-browser-btn')
  btn.innerHTML = `<i class="fas fa-search"></i> ${game.i18n.localize('SR5.CompendiumBrowser')}`
  btn.addEventListener('click', () => SR5CompendiumBrowser.open())
  header.appendChild(btn)
}
