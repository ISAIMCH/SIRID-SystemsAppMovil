function hasActiveMembership(user, now = new Date()) {
  return user.membership?.status === 'active'
    && (!user.membership.startsAt || user.membership.startsAt <= now)
    && (!user.membership.expiresAt || user.membership.expiresAt >= now);
}

module.exports = hasActiveMembership;