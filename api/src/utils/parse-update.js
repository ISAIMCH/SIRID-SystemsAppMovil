// partial() still applies defaults in zod 4; keep only the fields that were actually sent.
function parseUpdate(schema, body) {
  const parsed = schema.partial().parse(body ?? {});
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(body ?? {}, key)));
}

module.exports = parseUpdate;
