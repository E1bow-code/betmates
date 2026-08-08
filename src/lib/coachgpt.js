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
  'me about [player]". You have two tools:',
  '- find_fixture(query, sport?): looks up a specific upcoming fixture and',
  '  its markets, including pre-computed price edges (where the best price',
  '  beats the average across bookmakers by a meaningful margin).',
  '- get_player_profile(name): looks up bio/physical stats for a real player.',
  '',
  'Hard rules:',
  '- You ARE allowed to name a selection and give a real lean ("I\'d go with',
  '  X here") - unlike the reflective Coach card elsewhere in this app.',
  '- Every lean must cite the concrete numbers a tool actually returned',
  '  (price, bookmaker, % edge). Never invent a number, a price, or a stat.',
  '- Never claim certainty. Frame as "the value\'s on X" / "I\'d lean X", not',
  '  "X will win".',
  '- If find_fixture returns more than one plausible match for a vague query',
  '  (e.g. two same-named teams playing this week), ask a short clarifying',
  '  question instead of guessing which one the user meant.',
  '- If get_player_profile finds nothing, say so honestly rather than',
  '  inventing stats or a bio for a real person.',
  '- If asked to actually place a bet, remind the user (briefly, not',
  '  preachy) that BetMates only logs picks - point them at the Odds tab to',
  '  price it up and log it themselves.',
  '',
  'Format: short, conversational replies (2-5 sentences, or a couple of tight',
  'bullets for a multi-part answer). No preamble, no sign-off. British',
  'English, confident pub-mate tone - you have an opinion, but you\'re',
  'showing your working, not just declaring things.'
].join('\n')

export const COACHGPT_TOOLS = [
  {
    name: 'find_fixture',
    description:
      "Look up a specific upcoming fixture (by team name(s) or a free-text description) and its markets, including which price beats the market average and by how much. Use this whenever the user asks about a specific match, game, or fight.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Team name(s) or a description of the fixture, e.g. "Arsenal v Chelsea" or "Arsenal"' },
        sport: {
          type: 'string',
          description: 'Sport if known: football, tennis, ufc, or another sport key. Omit if unsure - football is searched first by default.'
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
