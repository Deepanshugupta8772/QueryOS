const env = require("../config/env");

function stringify(part) {
  if (part instanceof Error) {
    return `${part.name}: ${part.message}`;
  }

  if (typeof part === "string") {
    return part;
  }

  return JSON.stringify(part);
}

function debug(...parts) {
  if (!env.debugEnabled) {
    return;
  }

  process.stdout.write(`[debug] ${parts.map(stringify).join(" ")}\n`);
}

function error(...parts) {
  process.stderr.write(`[error] ${parts.map(stringify).join(" ")}\n`);
}

module.exports = {
  debug,
  error,
};
