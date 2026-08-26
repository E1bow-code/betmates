// Shared by coach.js and coachgpt.js so the two personas can never drift on
// how a Messages API call is routed. Default (no `route`) goes straight to
// Anthropic, exactly as both files always have. When a caller passes a
// `route` - built by the Netlify function from OMNIROUTE_* env vars, only
// when OMNIROUTE_BASE_URL is set - the same call instead goes through a
// self-hosted OmniRoute gateway sitting in front of Anthropic (and whatever
// else is registered on it), using OmniRoute's Anthropic-compatible
// `/v1/messages` endpoint. That endpoint takes `Authorization: Bearer`
// rather than Anthropic's own `x-api-key`/`anthropic-version` pair, and
// expects the model id under whatever provider prefix OmniRoute was
// configured with (e.g. `cc/claude-opus-5`) - both handled here so neither
// caller has to know the difference.
const ANTHROPIC_VERSION = '2023-06-01'

export function buildAnthropicRequest(apiKey, model, body, route) {
  if (route?.baseUrl) {
    return {
      url: `${route.baseUrl.replace(/\/+$/, '')}/v1/messages`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...body, model: `${route.modelPrefix ?? ''}${model}` })
    }
  }
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({ ...body, model })
  }
}
