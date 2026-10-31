class HttpError extends Error {
  // `extra` adds fields to the JSON body, e.g. a `code` the clients can branch on.
  constructor(statusCode, message, extra = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.extra = extra;
  }
}

module.exports = HttpError;
