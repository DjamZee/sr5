// The information broker (lot 37a), without Foundry: Cutting Aces p. 148-149, « Informations à vendre ».
// Hard Targets p. 196 gives the broker as a contact (« Courtier en information », the Reporter of Run Faster
// p. 187, retouched); no book gives a broker's own rules beyond this price list. What the gamemaster decides
// stays his: the price within the range (« le MJ a le dernier mot sur la disponibilité »), the time it takes,
// whether the data are sound, and what a broker pays for data sold to him (no book prices it).

// The table of p. 149, in its order. max null: the book prints « + » (no ceiling).
// Read against the VO (Cutting Aces VO, « Information for sale »): the same fifteen lines.
export const INFO_TYPES = [
  {
    key: 'accessCodes', min: 500, max: 2500
  },
  {
    key: 'address', min: 200, max: 750
  },
  {
    key: 'blackmail', min: 2000, max: null
  },
  {
    key: 'handwriting', min: 150, max: 400
  },
  {
    key: 'history', min: 250, max: 2000
  },
  {
    key: 'hobbies', min: 100, max: 500
  },
  {
    key: 'marketScan', min: 100, max: 300
  },
  {
    key: 'medical', min: 500, max: 3000
  },
  {
    key: 'name', min: 100, max: 500
  },
  {
    key: 'patterns', min: 300, max: 1750
  },
  {
    key: 'psychProfile', min: 750, max: 3000
  },
  {
    key: 'purchases', min: 150, max: 1500
  },
  {
    key: 'safehouses', min: 1000, max: null
  },
  {
    key: 'socialMedia', min: 100, max: 500
  },
  {
    key: 'workplace', min: 150, max: 600
  },
]

/** A type of the table by its key. */
export function infoType(key) {
  return INFO_TYPES.find(t => t.key === key) ?? null
}

/** « 500–2 500 ¥ », « 2 000+ ¥ »: the price range as the book prints it. */
export function priceRangeLabel(type, format = n => n.toLocaleString('fr-FR')) {
  if (!type) return ''
  return type.max === null ? `${format(type.min)}+ ¥` : `${format(type.min)}–${format(type.max)} ¥`
}

/**
 * The price the gamemaster's quote starts from: the low end of the range. The book gives a range, not a
 * price; the gamemaster moves it (a choice of play, not a rule).
 */
export function startingQuote(type) {
  return type?.min ?? 0
}

/** Whether a quote lies within the book's range (told to the gamemaster, never refused). */
export function quoteInRange(type, price) {
  const p = Number(price)
  if (!type || !Number.isFinite(p)) return false
  return p >= type.min && (type.max === null || p <= type.max)
}

// SR5 p. 391, « Complications »: a contact may get facts wrong; « un échec critique… une information on-ne-peut-plus
// fausse ». The gamemaster says which, the buyer never sees it.
export const RELIABILITY = ['sound', 'partial', 'false']

// The life of a request. buy: the character buys data; sell: she offers data to the broker.
//   asked  → quoted (gamemaster) | notFound (gamemaster) | cancelled (buyer)
//   quoted → paid (buyer accepts, the gamemaster's browser debits) | declined (buyer) | cancelled (buyer)
//   paid   → delivered (gamemaster, the file goes to the buyer)
//   offered → bid (gamemaster) | refused (gamemaster) | cancelled (seller)
//   bid    → sold (seller accepts, the gamemaster's browser credits) | declined (seller)
const MOVES = {
  quote: {
    from: ['asked', 'quoted'], to: 'quoted', by: 'gm'
  },
  notFound: {
    from: ['asked', 'quoted'], to: 'notFound', by: 'gm'
  },
  accept: {
    from: ['quoted'], to: 'paid', by: 'owner'
  },
  decline: {
    from: ['quoted', 'bid'], to: 'declined', by: 'owner'
  },
  cancel: {
    from: ['asked', 'quoted', 'offered'], to: 'cancelled', by: 'owner'
  },
  deliver: {
    from: ['paid'], to: 'delivered', by: 'gm'
  },
  bid: {
    from: ['offered', 'bid'], to: 'bid', by: 'gm'
  },
  refuse: {
    from: ['offered', 'bid'], to: 'refused', by: 'gm'
  },
  sell: {
    from: ['bid'], to: 'sold', by: 'owner'
  },
}

/** The status a move leads to, or null when the move is not allowed from there, or not by this side. */
export function nextStatus(status, move, side) {
  const m = MOVES[move]
  if (!m || !m.from.includes(status)) return null
  if (m.by !== side && side !== 'gm') return null
  return m.to
}

/** The requests still waiting on someone, newest first. */
export const OPEN_STATUSES = ['asked', 'quoted', 'paid', 'offered', 'bid']

export function sortRequests(entries) {
  return [...entries].sort((a, b) => {
    const open = e => OPEN_STATUSES.includes(e.status) ? 0 : 1
    return open(a) - open(b) || (b.time ?? 0) - (a.time ?? 0)
  })
}

/**
 * Who has the next move (relecture djamz.13, P1-38): 'gm' (a request to quote, an offer to bid on, a file to
 * deliver), 'owner' (a price or a bid to answer), or 'closed'.
 */
export function requestTurn(status) {
  if (['asked', 'offered', 'paid'].includes(status)) return 'gm'
  if (['quoted', 'bid'].includes(status)) return 'owner'
  return 'closed'
}

// The steps of a purchase and of a sale, in order; a request that ends early stops on a failed step
const STEPS = {
  buy: ['asked', 'quoted', 'paid', 'delivered'],
  sell: ['offered', 'bid', 'sold'],
}
// Where each failed end stops the path: on the step it would have reached
const FAILED_AT = {
  buy: {
    notFound: 'quoted', cancelled: 'quoted', declined: 'paid'
  },
  sell: {
    refused: 'bid', cancelled: 'bid', declined: 'sold'
  },
}

/**
 * The steps of a request as a strip (P1-38): [{key, state}], state 'done', 'current', 'todo' or 'failed'.
 * A failed request shows the step it did not reach as 'failed', with its own status as the key.
 */
export function requestSteps(kind, status) {
  const side = kind === 'sell' ? 'sell' : 'buy'
  const steps = STEPS[side]
  const failedAt = FAILED_AT[side][status]
  if (failedAt) {
    const stop = steps.indexOf(failedAt)
    return steps.slice(0, stop + 1).map((key, i) => i < stop ? {
      key, state: 'done'
    } : {
      key: status, state: 'failed'
    })
  }
  const at = steps.indexOf(status)
  const last = at === steps.length - 1
  return steps.map((key, i) => ({
    key, state: i < at || (last && i === at) ? 'done' : i === at ? 'current' : 'todo'
  }))
}

/** A request as the buyer sees it: the gamemaster's notes taken out. */
export function forOwner(entry) {
  const seen = {
    ...entry
  }
  delete seen.reliability
  delete seen.gmNote
  // The content is the buyer's only once delivered
  if (entry.status !== 'delivered') delete seen.content
  return seen
}

/** The name of the file delivered: « Adresse — Mr. Johnson ». */
export function fileName(typeLabel, subject) {
  const s = String(subject ?? '').trim()
  return s ? `${typeLabel} — ${s}` : typeLabel
}

/** A request is checked as it arrives from a player's browser: a known type, a subject of reasonable length. */
export function cleanRequest(data) {
  const kind = data?.kind === 'sell' ? 'sell' : 'buy'
  const type = infoType(data?.type)
  if (!type) return null
  const subject = String(data?.subject ?? '').slice(0, 200).trim()
  const asked = Math.max(0, Math.trunc(Number(data?.asked) || 0))
  return {
    kind, type: type.key, subject, asked, fileId: kind === 'sell' ? String(data?.fileId ?? '') : ''
  }
}
