// Shared between App.jsx (stashes the code from a /r/:code link) and
// AuthPage.jsx (consumes it at sign-up) - kept in its own module rather
// than exported from App.jsx to avoid a circular import (App.jsx renders
// AuthPage).
export const PENDING_REFERRAL_KEY = 'betmates:pendingReferralCode'
