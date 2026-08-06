// Player photo lookup, same approach as src/lib/teamBadges.js: TheSportsDB's
// free public API (test key "3"), client-side, in-memory cached per name.
// The search step itself is shared with src/lib/playerProfile.js via
// sportsDbPlayerSearch.js - this only adds the "pick a photo field" bit on
// top, kept separate from the fuller profile fetch so an icon-sized lookup
// (used on nearly every outcome row) doesn't also pay for the second
// lookupplayer.php call that only the profile sheet needs.
import { findPlayer } from './sportsDbPlayerSearch.js'

export async function getPlayerPhoto(playerName) {
  const match = await findPlayer(playerName)
  return match?.strThumb ?? match?.strCutout ?? null
}
