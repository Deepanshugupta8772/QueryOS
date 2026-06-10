const { AppError, isAppError } = require("../utils/app-error");
const logger = require("../services/logger.service");

function notFoundMiddleware(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorMiddleware(error, req, res, next) {
  const appError = isAppError(error)
    ? error
    : new AppError(500, "Internal server error");

  if (!isAppError(error)) {
    logger.error("Unhandled request error", error);
  }

  const payload = {
    error: {
      message: appError.message,
    },
  };

  if (appError.details) {
    payload.error.details = appError.details;
  }

  res.status(appError.statusCode).json(payload);
}

module.exports = {
  errorMiddleware,
  notFoundMiddleware,
};
