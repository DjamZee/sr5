import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  maskedDrain, drainFloor
} from "../../entities/items/mentor-spirits.js"

// The Drain a "Resist Drain" button shows: with the Mask of the mentor (Forbidden Arcana p. 176) the
// magician resists 1 less, never under the floor of that Drain (SR5 p. 284, 299, 303, 304). The drain
// roll itself applies the same reduction (rollData-Drain.js), so button and roll agree.
export function drainShown(cardData, actorId){
  const value = cardData?.magic?.drain?.value
  const actor = actorId ? SR5_EntityHelpers.getRealActorFromID(actorId) : null
  if (!actor?.system?.magic?.mentorMask) return value
  return maskedDrain(value, drainFloor(cardData.test, cardData.magic))
}
