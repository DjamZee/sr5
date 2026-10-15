// "Rappel des règles" (lot R2, DjamZ, relecture djamz.13): a world setting, checked by default (what the system did
// so far). Unchecked, the texts of the system no longer send to the books' pages ("(SR5 p. 170, 182)", "Run & Gun
// p. 69"), and the help bubble no longer shows the augmentation cap notes that count for 0. The rule itself is
// unchanged: only its reminder goes.

//The books the texts of the system cite, by their names and short keys
const BOOKS = [
  "SR5", "Livre de base", "LdB", "Run & Gun", "R&G", "RG", "Run Faster", "RF", "Rigger 5\\.0", "Rigger 5", "R5",
  "Kill Code", "KC", "Data Trails", "DT", "Chrome Flesh", "CF", "Cutting Aces", "CA", "Dark Terrors", "DTER",
  "Arcanes Interdites", "ARC", "Grimoire des Ombres", "GRI", "Better Than Bad", "BTB", "Howling Shadows", "HS",
  "Shadow Spells", "SSP", "No Future", "NF", "Hard Targets", "HT", "Aetherologie", "AETH", "The Complete Trog", "TCT",
  "Âmes Volées", "AV", "Balles et Pansements", "BP", "Street Lethal", "SL", "Market Panic", "MP", "Lockdown", "LD",
  "Gun H\\(e\\)aven 3", "GH3", "Core Rulebook", "CRB",
].join("|")
const BOOK = `(?:${BOOKS})(?:\\s+(?:VF|VO))?`
//"p. 170", "pp. 12-13", "p. 170, 182", "p. 170 et 182", "p. 39, 127"
const PAGES = "p{1,2}\\.\\s?\\d+(?:\\s?[-–]\\s?\\d+)?(?:(?:\\s?,\\s?|\\s(?:et|&)\\s)\\d+(?:\\s?[-–]\\s?\\d+)?)*"
//"SR5 p. 170", "p. 175, SR5", "VF p. 177", or a page alone
const REFERENCE = new RegExp(`(?:${BOOK}\\s+|(?:VF|VO)\\s+)?${PAGES}(?:,\\s?${BOOK}(?![\\w&]))?`, "g")
const SEPARATOR = "(?:[,;:/]|\\bet\\b)"
//"(voir p. 181)" leaves "(voir)": gone with the parenthesis, but "(voir Dégainer rapidement, p. 167)" keeps its "voir"
const TRAILING = "(?:[,;:/]|\\bet\\b|\\bvoir\\b)"

/**
 * The text without its references to the books' pages: a parenthesis left with nothing but separators goes with them.
 * @param {string} text
 * @returns {string}
 */
export function stripRuleReferences(text) {
  //An empty parenthesis is a reference already taken out of a value put in it ("({source})", source "SR5 p. 420")
  if (typeof text !== "string" || (!/\bp{1,2}\.\s?\d/.test(text) && !/\(\s*\)/.test(text))) return text
  let out = text.replace(REFERENCE, "")
  //Separators left at the edges of a parenthesis, then the empty parenthesis with the space before it
  out = out.replace(new RegExp(`\\(\\s*(?:${SEPARATOR}\\s*)+`, "g"), "(")
  out = out.replace(new RegExp(`(?:\\s*${SEPARATOR})+\\s*\\)`, "g"), ")")
  out = out.replace(new RegExp(`\\(\\s*(?:${TRAILING}\\s*)+\\)`, "g"), "()")
  out = out.replace(/\s*\(\s*\)/g, "")
  //A reference that ended a clause leaves a doubled separator or a space before the punctuation
  out = out.replace(/\s+([,.;:])/g, (m, p) => (p === ":" ? m : p)).replace(/,\s*,/g, ",").replace(/ {2,}/g, " ")
  //A fragment that ended or began with its reference ("lampe torche, Run & Gun p. 69", put in a parenthesis later)
  out = out.replace(/\s*[,;]\s*$/, "").replace(/^\s*[,;]\s*/, "")
  return out
}

/** Whether the world shows the reminders of the rules (the default) */
export function ruleRemindersShown() {
  try {
    return game.settings.get("sr5", "sr5RuleReminders") !== false
  } catch {
    return true
  }
}

/**
 * The notes of the augmentation cap that count for 0 (utilityActor.js): a reminder, gone with the setting. A cap that
 * does cut keeps its line, the total would no longer add up without it.
 */
export function isCapReminder(modifier) {
  return modifier?.type === "augmentationCap" && Number(modifier.value) === 0
}

/**
 * Called once the settings are registered: unchecked, every text the system localizes loses its page references, and
 * so do the chat cards written while the setting was checked.
 */
export function installRuleReminders() {
  if (ruleRemindersShown()) return
  const i18n = game.i18n
  const localize = i18n.localize.bind(i18n)
  const format = i18n.format.bind(i18n)
  i18n.localize = key => stripRuleReferences(localize(key))
  i18n.format = (key, data) => stripRuleReferences(format(key, data))
  Hooks.on("renderChatMessageHTML", (message, html) => stripRuleReferencesIn(html))
}

/** The page references taken out of the text of an element (its text nodes, the markup untouched) */
export function stripRuleReferencesIn(element) {
  if (!element?.ownerDocument) return
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const stripped = stripRuleReferences(node.nodeValue)
    if (stripped !== node.nodeValue) node.nodeValue = stripped
  }
}
