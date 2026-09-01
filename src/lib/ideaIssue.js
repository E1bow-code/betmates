// Best-effort: open a GitHub issue for an approved Sage idea. Shared by the
// Discord button endpoint (discord-interactions.js) and the Agent HQ admin
// endpoint (agent-action.js) so both log an approved idea the same way.
// Returns the issue URL, or null if GitHub isn't configured (SAGE_GITHUB_TOKEN
// / SAGE_GITHUB_REPO unset) or the call failed. Never throws.
import { buildIdeaIssue } from './sageResearch.js'

/**
 * @param {{ body: string, sources?: {url: string, title: string}[] }} row
 * @param {{ token?: string, repo?: string }} [creds]
 * @returns {Promise<string|null>}
 */
export async function openGithubIssue(row, creds = {}) {
  const token = creds.token ?? process.env.SAGE_GITHUB_TOKEN
  const repo = creds.repo ?? process.env.SAGE_GITHUB_REPO
  if (!token || !repo) return null
  try {
    const { title, body } = buildIdeaIssue(row)
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'betmates-sage'
      },
      body: JSON.stringify({ title, body, labels: ['sage-idea'] })
    })
    if (!res.ok) return null
    const created = await res.json().catch(() => ({}))
    return created?.html_url ?? null
  } catch {
    return null
  }
}
