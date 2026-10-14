// Cutting Aces social rules (lot 21): one world setting for what the roll dialog offers, the social maneuvers
// (p. 153: "les MJ peuvent choisir lesquelles autoriser dans leur partie") and the con steps (p. 162-164).
// Ticked by default: both are only offered, never applied unless chosen, and the book gives them as options of
// the game. Unticked, the dialog keeps the system's social tests as they were; the effects already carried
// by an earlier maneuver are still offered, and the con tracker stays open to the gamemaster.
export const SOCIAL_RULES = "sr5CuttingAcesSocial"

export function socialRulesOn(){
  try {
    return game.settings.get("sr5", SOCIAL_RULES) !== false
  } catch {
    return true
  }
}

export function registerSocialSettings(){
  game.settings.register("sr5", SOCIAL_RULES, {
    name: "SR5.SETTINGS_CuttingAcesSocial_T",
    hint: "SR5.SETTINGS_CuttingAcesSocial_D",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
  })
}
