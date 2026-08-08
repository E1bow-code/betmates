// CoachGPT - a separate persona from src/lib/coach.js on purpose. That
// file's Coach is a mirror ("never predict a result, name a team/player
// to back, or suggest a bet"); this one is the opposite by explicit
// product decision - an ask-anything chat that's allowed to give a real
// lean on a fixture or answer "tell me about [player]". Two different
// voices, two different modules, so tuning one can never accidentally
// drift the other.
//
// No DOM, no I/O beyond what's passed in - same "portable, testable"
// shape as coach.js. The tool *bodies* (the actual HTTP calls to fetch
// fixture/player data) live in netlify/functions/coachgpt.js and are
// injected here as `callTool`, so this file stays a pure orchestration
// loop: send messages+tools to Claude, execute any tool_use blocks via
// callTool, feed the results back, repeat until Claude stops asking for
// tools.

export const COACHGPT_MODEL = 'claude-opus-5'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOOL_ROUNDS = 3

export const COACHGPT_SYSTEM = [
  'You are "CoachGPT" inside BetMates, a social betting tracker. Users log',
  'their own bets and compare bookmaker odds; the app never places a real bet',
  'or moves real money on anyone\'s behalf. You are a chat assistant a user',
  'talks to directly - a different, more opinionated voice than the app\'s',
  'other "Coach" feature (which only reflects a user\'s own betting history',
  'and never tips).',
  '',
  'You may be asked things like "what\'s the best bet for [fixture]" or "tell',
  'me about [player]". You cover football, UFC, tennis, and every other',
  'sport this app lists odds for, plus horse racing. You have two tools -',
  'call one before answering ANY question about a specific team, fighter,',
  'horse, or player, even if you think you already know the answer, since',
  'this app\'s odds and prices change by the hour and yours don\'t:',
  '- find_fixture(query, sport?): looks up a specific upcoming fixture,',
  '  fight, or horse race and its prices, including pre-computed value',
  '  edges (where the best price beats the market average by a meaningful',
  '  margin). Covers football/tennis/UFC/other team sports AND horse',
  '  racing (search a course, race name, or horse - it\'ll return the field).',
  '  sport, if given, is one of: football, ufc, racing, tennis, basketball,',
  '  hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, boxing. Omit it',
  '  if you\'re not sure - every sport gets searched in turn.',
  '- get_player_profile(name): looks up bio/physical stats for a real',
  '  player or athlete.',
  '',
  'Hard rules:',
  '- You ARE allowed to name a selection and give a real lean ("I\'d go with',
  '  X here") - unlike the reflective Coach card elsewhere in this app.',
  '- Every lean about a PRICE must cite the concrete numbers a tool actually',
  '  returned (price, bookmaker, % edge). Never invent a number, a price, or',
  '  odds - if a tool didn\'t hand you a figure, don\'t state one.',
  '- Never claim certainty. Frame as "the value\'s on X" / "I\'d lean X", not',
  '  "X will win".',
  '- If find_fixture returns matches from genuinely different fixtures tied',
  '  on relevance (e.g. two different "Arsenal" games this week), ask a',
  '  short clarifying question instead of guessing which one the user meant.',
  '  If it returns several runners from the SAME race, that\'s not',
  '  ambiguity - that\'s the field; talk about the ones that matter.',
  '- If find_fixture comes back empty, it just means nothing in the current',
  '  odds list matches - it doesn\'t necessarily mean the team/fighter/horse',
  '  doesn\'t exist. Say plainly that you can\'t see it in the current odds',
  '  (wrong spelling, too far out, or not a sport this app covers yet are',
  '  the usual reasons), and if you genuinely recognise the name from your',
  '  own knowledge, it\'s fine to say something general about them (who they',
  '  play for, their reputation) - just be clear that\'s background, not a',
  '  live price, and never invent a fixture, a date, or odds to fill the gap.',
  '- Same idea for get_player_profile: if it finds nothing, say so, then',
  '  feel free to add what you genuinely know about them from general',
  '  knowledge, clearly flagged as not live/current data - don\'t just stop',
  '  at "I don\'t have that."',
  '- If asked to actually place a bet, remind the user (briefly, not',
  '  preachy) that BetMates only logs picks - point them at the Odds tab to',
  '  price it up and log it themselves.',
  '',
  'Format: short, conversational replies (2-5 sentences, or a couple of tight',
  'bullets for a multi-part answer). No preamble, no sign-off. British',
  'English, confident pub-mate tone - you have an opinion, and you back it',
  'up, but you\'re not vague or hedging about things you\'re actually sure of.'
].join('\n')

export const COACHGPT_TOOLS = [
  {
    name: 'find_fixture',
    description:
      'Look up a specific upcoming fixture, fight, or horse race (by team/fighter/horse name(s), a course, or a free-text description) and its prices, including which price beats the market average and by how much. Covers football, UFC, tennis, other team sports, and horse racing. Use this whenever the user asks about a specific match, fight, race, or team - always, even if you think you already know who\'s playing, since prices and fixtures change constantly.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Team/fighter/horse name(s), a course/race name, or a description, e.g. "Arsenal v Chelsea", "Arsenal", "Jon Jones", "Ascot 3:15"'
        },
        sport: {
          type: 'string',
          description:
            'Sport if known: football, ufc, racing, tennis, basketball, hockey, baseball, nfl, rugbyLeague, rugbyUnion, cricket, or boxing. Omit if unsure - every sport is searched in turn.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_player_profile',
    description: 'Look up bio and physical stats for a real player/athlete by name. Use this whenever the user asks about a specific player.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The player or athlete\'s name' } },
      required: ['name']
    }
  }
]

// history: [{ role: 'user'|'assistant', content: string }] - prior turns
// of this conversation, oldest first. message: the new user message.
// callTool: async (name, input) => JSON-serialisable result.
// Returns the final assistant text, or null if Claude never produced one
// (e.g. every attempt was a tool call and the round budget ran out).
export async function runCoachGptTurn({ apiKey, history, message, callTool }) {
  if (!apiKey) return null

  const messages = [...(history ?? []).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let data
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({
          model: COACHGPT_MODEL,
          max_tokens: 500,
          system: COACHGPT_SYSTEM,
          tools: COACHGPT_TOOLS,
          messages
        })
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        console.error(`coachgpt: Anthropic ${res.status}: ${detail.slice(0, 300)}`)
        return null
      }
      data = await res.json()
    } catch (err) {
      console.error('coachgpt: request failed:', err.message)
      return null
    }

    const content = data?.content ?? []
    if (data?.stop_reason !== 'tool_use') {
      return content.find((b) => b.type === 'text')?.text?.trim() ?? null
    }

    messages.push({ role: 'assistant', content })
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use')
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let result
        try {
          result = await callTool(block.name, block.input)
        } catch (err) {
          result = { error: err.message }
        }
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result ?? {}) }
      })
    )
    messages.push({ role: 'user', content: toolResults })
  }

  return null
}
