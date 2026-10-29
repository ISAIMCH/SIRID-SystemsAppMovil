function toUserRoom(user) {
  const id = user?._id ?? user;
  return id ? `user:${id}` : null;
}

// Sends the event to Admins plus the given users (ids or populated user documents).
function emitRealtime(req, event, payload, users = []) {
  const io = req.app?.get('io');
  if (!io) return;
  const rooms = new Set(['role:Admin', ...users.map(toUserRoom).filter(Boolean)]);
  io.to([...rooms]).emit(event, payload);
}

// Sends the event to every authenticated socket; only for non-sensitive payloads.
function broadcastRealtime(req, event, payload) {
  const io = req.app?.get('io');
  if (io) io.emit(event, payload);
}

module.exports = { emitRealtime, broadcastRealtime };
