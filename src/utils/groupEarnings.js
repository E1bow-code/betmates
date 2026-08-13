// Estimates a group owner's monthly earnings from data already synced by
// stripe-webhook.js (group_subscriptions has no stored charge amount, so
// this multiplies the group's current price by its currently-paying
// subscriber count rather than summing real historical charges - a live
// Stripe balance/payout pull would be the more literal "earnings" figure,
// but needs a new Connect API call per group and isn't practical to
// browser-verify without a funded test account, so this stays a
// same-session estimate instead).
//
// platformFeePercent must match PLATFORM_FEE_PERCENT in
// netlify/functions/create-group-checkout-session.js - there's no shared
// constants module crossing the src/netlify boundary in this repo, so
// it's a duplicated literal, not an import.
/** @param {number} subscriberCount @param {number} priceAmount @param {number} [platformFeePercent] @returns {{grossMrr: number, platformFee: number, netMrr: number}} */
export function computeGroupEarnings(subscriberCount, priceAmount, platformFeePercent = 10) {
  const grossMrr = Math.round(subscriberCount * priceAmount * 100) / 100
  const platformFee = Math.round(grossMrr * (platformFeePercent / 100) * 100) / 100
  return { grossMrr, platformFee, netMrr: Math.round((grossMrr - platformFee) * 100) / 100 }
}
