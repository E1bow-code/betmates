// Groups a flat, ascending list of coach_messages rows (as returned by
// dataStore.listCoachMessages with no sessionId filter) into one summary per
// conversation - CoachGptPage.jsx's history sheet, so "New chat" can clear
// the active view without losing anything (see schema.sql's session_id
// comment). A session's title is its first user message, since that's the
// only thing guaranteed to exist (a session with zero user turns can't
// happen - the user always sends first).

const TITLE_MAX = 60

/**
 * @param {{id: string, sessionId: string, role: 'user'|'assistant', body: string, createdAt: string}[]} messages
 * @returns {{sessionId: string, title: string, startedAt: string, lastMessageAt: string, messageCount: number}[]}
 */
export function groupCoachSessions(messages) {
  const bySession = new Map()
  for (const m of messages ?? []) {
    let session = bySession.get(m.sessionId)
    if (!session) {
      session = { sessionId: m.sessionId, title: null, startedAt: m.createdAt, lastMessageAt: m.createdAt, messageCount: 0 }
      bySession.set(m.sessionId, session)
    }
    session.messageCount += 1
    if (m.createdAt < session.startedAt) session.startedAt = m.createdAt
    if (m.createdAt > session.lastMessageAt) session.lastMessageAt = m.createdAt
    if (!session.title && m.role === 'user') {
      session.title = m.body.length > TITLE_MAX ? `${m.body.slice(0, TITLE_MAX).trim()}…` : m.body
    }
  }
  return [...bySession.values()]
    .map((s) => ({ ...s, title: s.title ?? 'New chat' }))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
}
