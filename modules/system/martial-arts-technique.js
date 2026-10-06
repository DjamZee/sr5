//A learned martial arts technique applies on its own, without being pinned (DjamZ's ruling, 2026-10-06):
//Choquer lowers Shake Up from -4 to -3 whenever Shake Up is chosen.
//The effects aimed at system.itemsProperties.martialArts only unlock or ease a called shot, read when the roll
//dialog chooses that shot: they always apply. So does a situational effect, which only becomes a box of the
//roll dialog (All-Out Attack, Balestra, Run & Gun p. 134: the action is chosen there). Any other effect (a pool,
//a defense) applies on its own for a permanent technique; for a technique that is an action, it waits for the switch.
//The called shots any item can ease (G14) are read the same way, when the roll dialog chooses the shot
const CALLED_SHOT_TARGETS = ["system.itemsProperties.martialArts.", "system.itemsProperties.calledShots."]
const PASSIVE_ACTION_TYPES = ["", "permanent"]

function effectsOf(system){
  return Object.values(system?.customEffects ?? {
  })
}

export function martialArtNeedsSwitch(system){
  if (PASSIVE_ACTION_TYPES.includes(system?.actionType ?? "")) return false
  return effectsOf(system).some(e => !e?.situational && !CALLED_SHOT_TARGETS.some(t => String(e?.target ?? "").startsWith(t)))
}

export function martialArtApplies(system){
  return !!system?.isActive || !martialArtNeedsSwitch(system)
}
