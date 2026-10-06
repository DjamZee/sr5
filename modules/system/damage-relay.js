// Damage relayed to the GM by socket (takeDamage): applied on the word of the actor's owner or of a GM only.
// Anyone else's relay waits for the GM's confirmation (entityActor-helpers.js, _socketTakeDamage)
export function relayNeedsConfirmation(actor, sender){
  if (!actor || !sender) return true
  if (sender.isGM) return false
  return !actor.testUserPermission(sender, "OWNER")
}
