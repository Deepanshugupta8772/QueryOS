class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isAppError(error) {
  return error instanceof AppError;
}

module.exports = {
  AppError,
  isAppError,
};
