//The gamemaster moves a combatant one place up or down in the order of the pass (pack 5 of DjamZ, § 3). The score
//stays as rolled: it decides the passes (-10 at each one, SR5 p. 159), and swapping it would give or take a pass.
//Only the sort key moves (flags.sr5.baseCombatantInitiative, read first by SR5Combat.sortByRERIC), and handleIniPass
//writes it back from the score at each new pass: the move lasts until the end of the pass, the order of the next
//pass and of the next Combat Turn is the book's again.

//What a sort key goes down by when it must pass under its neighbour's
const STEP = 0.01

//Whether the seizure of the initiative decides between the two, as sortByRERIC reads it
function seizeDecides(upper, lower){
  return (upper.seize === true && lower.seize === false) || (lower.seize === true && upper.seize === false)
}

/**
 * The new sort keys after the move of the combatant at index one place up (-1) or down (+1).
 * Every key of the new order is strictly below the one before it, so that the sort finds that exact order again
 * whatever the Edge, Reaction, Intuition or coin of a tie; only the keys that must change are given.
 * The turn stays on the same place: the combatant who comes there acts now (the gamemaster moves the active one
 * down, the next one plays first), and no one is passed over.
 * @param {{id: string, key: number, seize?: boolean}[]} turns The combatants in the order of the tracker
 * @param {number} index The place of the one moved
 * @param {number} direction -1 up, +1 down
 * @returns {{keys: Object<string, number>, order: string[]}|null} null: the move is not possible
 */
export function turnOrderShift(turns, index, direction){
  if (!Array.isArray(turns) || (direction !== -1 && direction !== 1)) return null
  const other = index + direction
  if (!turns[index] || !turns[other]) return null
  const upper = Math.min(index, other)
  //No score yet: such a combatant sorts last whatever its key
  if (!Number.isFinite(Number(turns[upper].key)) || !Number.isFinite(Number(turns[upper + 1].key))) return null
  //One of them seized the initiative (SR5 p. 168): it acts first, a move of the key would not change it
  if (seizeDecides(turns[upper], turns[upper + 1])) return null

  const order = turns.slice()
  ;[order[upper], order[upper + 1]] = [order[upper + 1], order[upper]]
  //The keys of the places stay where they are: the one coming up takes the key of the place it gets
  const keys = turns.map(t => Number(t.key))
  const changed = {
  }
  for (let place = 0; place < order.length; place++) {
    let key = keys[place]
    if (place > 0 && !seizeDecides(order[place - 1], order[place]) && Number.isFinite(keys[place - 1]) && !(key < keys[place - 1])) {
      key = keys[place - 1] - STEP
      keys[place] = key
    }
    if (Number.isFinite(key) && key !== Number(order[place].key)) changed[order[place].id] = key
  }
  return {
    keys: changed, order: order.map(t => t.id)
  }
}
