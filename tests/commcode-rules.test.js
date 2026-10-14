import {
  describe, it, expect
} from 'vitest'
import {
  normalizeCommcode, sameCommcode, deviceReachability, trafficOf, pruneEntries, entriesOfDevice, threadsOf, nextCallStatus,
  interceptedBy, cleanText, directoryOf, withContact, displayNameOf, seenByRecipient, counterpartOf
} from '../modules/system/commcode-rules.js'

const message = (id, from, to, status = "delivered", sentAt = 1, extra = {
}) => ({
  id, kind: "message", status, text: id, sentAt, deliveredAt: status === "delivered" ? sentAt : null,
  from: {
    commcode: from, actorId: `a-${from}`
  }, to: {
    commcode: to, devices: [{
      actorId: `a-${to}`
    }]
  }, ...extra,
})

describe('commcode: comparing', () => {
  it('ignores case and spaces at the edges', () => {
    expect(normalizeCommcode("  Fixer#42 ")).toBe("fixer#42")
    expect(sameCommcode("Fixer#42", "fixer#42 ")).toBe(true)
  })
  it('an empty commcode matches nothing', () => {
    expect(sameCommcode("", "")).toBe(false)
    expect(sameCommcode(null, undefined)).toBe(false)
  })
})

describe('commcode: can a device talk (SR5 p. 424, 443, 229)', () => {
  it('a device running silent still talks (SR5 p. 236)', () => {
    expect(deviceReachability({
      mode: "silent"
    })).toBe("online")
  })
  it('wireless off comes first', () => {
    expect(deviceReachability({
      mode: "offline", jammed: true, bricked: true
    })).toBe("offline")
  })
  it('bricked, then jammed', () => {
    expect(deviceReachability({
      mode: "active", jammed: true, bricked: true
    })).toBe("bricked")
    expect(deviceReachability({
      mode: "active", jammed: true
    })).toBe("jammed")
  })
})

describe('commcode: what a device sees', () => {
  const entries = [
    message("m1", "alice", "bob", "delivered", 1),
    message("m2", "bob", "alice", "pending", 2),
    message("m3", "carol", "bob", "delivered", 3),
  ]
  it('the recipient sees nothing of a message still waiting, its sender does', () => {
    expect(entriesOfDevice(entries, "alice").map(e => e.id)).toEqual(["m1"])
    expect(entriesOfDevice(entries, "bob").map(e => e.id)).toEqual(["m1", "m2", "m3"])
  })
  it('one conversation per counterpart, the latest first, unread after the last reading', () => {
    const threads = threadsOf(entriesOfDevice(entries, "bob"), "bob", 1)
    expect(threads.map(t => t.key)).toEqual(["carol", "alice"])
    expect(threads[0].unread).toBe(1)
    // m1 came at 1, read at 1; m2 is bob's own
    expect(threads[1].unread).toBe(0)
  })
  it('a call that never rang is not seen by the called', () => {
    expect(seenByRecipient({
      kind: "call", status: "unreachable"
    })).toBe(false)
    expect(seenByRecipient({
      kind: "call", status: "missed"
    })).toBe(true)
  })
  it('the counterpart of an entry', () => {
    expect(counterpartOf(entries[0], "Bob")).toBe("alice")
    expect(counterpartOf(entries[0], "alice")).toBe("bob")
  })
})

describe('commcode: calls', () => {
  it('the called answers or refuses a ringing call', () => {
    expect(nextCallStatus("ringing", "answer", "to")).toBe("active")
    expect(nextCallStatus("ringing", "refuse", "to")).toBe("refused")
  })
  it('the caller cannot answer her own call', () => {
    expect(nextCallStatus("ringing", "answer", "from")).toBe(null)
  })
  it('the caller who hangs up leaves a missed call', () => {
    expect(nextCallStatus("ringing", "hangup", "from")).toBe("missed")
  })
  it('an open call ends, or is cut when a device goes out of reach', () => {
    expect(nextCallStatus("active", "hangup", "to")).toBe("ended")
    expect(nextCallStatus("active", "cut", "from")).toBe("cut")
    expect(nextCallStatus("ringing", "cut", "from")).toBe("missed")
  })
  it('an ended call stays ended', () => {
    expect(nextCallStatus("ended", "hangup", "from")).toBe(null)
  })
})

describe('commcode: Snoop (SR5 p. 241)', () => {
  const traffic = trafficOf({
    entries: [
      message("old", "bob", "alice", "delivered", 1),
      message("out", "bob", "alice", "delivered", 5),
      message("in", "carol", "bob", "delivered", 6),
      message("wait", "carol", "bob", "pending", 7),
      message("other", "carol", "dave", "delivered", 8),
    ],
    interceptions: [{
      id: "i1", snooperId: "hacker", targetId: "a-bob", since: 3
    }],
  })
  it('the traffic from or to the target since the Snoop; a message waiting has not reached the target', () => {
    const [found] = interceptedBy(traffic, "hacker")
    expect(found.entries.map(e => e.id)).toEqual(["out", "in"])
  })
  it('nothing once the mark is gone', () => {
    expect(interceptedBy(traffic, "hacker", () => false)).toEqual([])
  })
  it('nothing for another hacker', () => {
    expect(interceptedBy(traffic, "someone")).toEqual([])
  })
})

describe('commcode: the register', () => {
  it('reads a missing register as empty', () => {
    expect(trafficOf(undefined)).toEqual({
      entries: [], interceptions: []
    })
  })
  it('keeps the latest entries, and always the open calls and the messages waiting', () => {
    const entries = [
      {
        id: "call", kind: "call", status: "active", sentAt: 0
      },
      message("wait", "a", "b", "pending", 0),
      message("e1", "a", "b", "delivered", 1),
      message("e2", "a", "b", "delivered", 2),
      message("e3", "a", "b", "delivered", 3),
    ]
    expect(pruneEntries(entries, 3).map(e => e.id)).toEqual(["call", "wait", "e3"])
  })
  it('trims a message and bounds it', () => {
    expect(cleanText("  salut \r\n ")).toBe("salut")
    expect(cleanText("x".repeat(10), 4)).toBe("xxxx")
  })
})

describe('commcode: the directory', () => {
  it('drops a contact without commcode', () => {
    expect(directoryOf([{
      name: "?", commcode: " "
    }, {
      id: "1", name: "Fixer", commcode: "fx"
    }])).toEqual([{
      id: "1", name: "Fixer", commcode: "fx"
    }])
  })
  it('lists a commcode once: adding it again renames it', () => {
    const one = withContact([], {
      name: "Fixer", commcode: "fx"
    }, () => "id1")
    const two = withContact(one, {
      name: "Le fixer", commcode: "FX"
    }, () => "id2")
    expect(two).toEqual([{
      id: "id1", name: "Le fixer", commcode: "fx"
    }])
  })
  it('shows the contact name, or the commcode', () => {
    const directory = [{
      id: "1", name: "Fixer", commcode: "fx"
    }]
    expect(displayNameOf("FX", directory)).toBe("Fixer")
    expect(displayNameOf("other", directory)).toBe("other")
  })
})
