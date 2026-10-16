// Who reads the Overwatch Score when it rises (A7 of the API pour Matrice v1). SR5 p. 233: the gamemaster keeps it
// in secret; the hacker learns it by the action Check Overwatch Score or by the Baby Monitor program. The sheet
// already follows the book (overwatchScore.hbs: the gamemaster, or the owner whose Baby Monitor runs); the world
// setting sr5OverwatchGMOnly (checked by default) does the same for the notice of a rise.

/**
 * Is the number shown to this user in the notice of a rise?
 * @param {Object} options
 * @param {Boolean} options.isGM         the user is a gamemaster
 * @param {Boolean} options.gmOnly       the world setting sr5OverwatchGMOnly
 * @param {Boolean} options.babyMonitor  the hacker's Baby Monitor runs
 * @return {Boolean}
 */
export function showsOverwatchScore({
  isGM = false, gmOnly = true, babyMonitor = false
} = {
}){
  return isGM || !gmOnly || babyMonitor
}

/** The same, read in Foundry for an actor whose score rose */
export function overwatchScoreShownTo(actor){
  let gmOnly = true
  try {
    gmOnly = game.settings.get("sr5", "sr5OverwatchGMOnly") !== false
  } catch {
    gmOnly = true
  }
  return showsOverwatchScore({
    isGM: !!game.user?.isGM, gmOnly, babyMonitor: !!actor?.system?.matrix?.programs?.babyMonitor?.isActive
  })
}
