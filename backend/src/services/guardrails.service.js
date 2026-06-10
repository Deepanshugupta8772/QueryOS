const { DOMAIN_KEYWORDS } = require("../db/schema");

const BLOCKED_SQL_PATTERN =
  /\b(drop|delete|update|insert|alter|truncate|attach|detach|pragma|vacuum|reindex|replace|grant|revoke)\b/i;
const GENERAL_KNOWLEDGE_PATTERN =
  /\b(weather|capital of|president|prime minister|latest news|movie|recipe|biography|translate|stock price|who won)\b/i;
const PROMPT_INJECTION_PATTERN =
  /\b(ignore previous|system prompt|developer prompt|jailbreak|bypass|override instructions)\b/i;

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasDomainSignals(query) {
  return DOMAIN_KEYWORDS.some((keyword) => query.includes(keyword));
}

function buildFallbackMessage() {
  return "This service only answers SAP Order-to-Cash dataset questions using the seeded tables.";
}

function inspectNaturalLanguageQuery(query) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return {
      allowed: false,
      message: "Provide a dataset question to query the SAP Order-to-Cash data.",
    };
  }

  if (BLOCKED_SQL_PATTERN.test(normalizedQuery) || PROMPT_INJECTION_PATTERN.test(normalizedQuery)) {
    return {
      allowed: false,
      message: buildFallbackMessage(),
    };
  }

  if (GENERAL_KNOWLEDGE_PATTERN.test(normalizedQuery) && !hasDomainSignals(normalizedQuery)) {
    return {
      allowed: false,
      message: buildFallbackMessage(),
    };
  }

  if (!hasDomainSignals(normalizedQuery)) {
    return {
      allowed: false,
      message: buildFallbackMessage(),
    };
  }

  return {
    allowed: true,
  };
}

function buildRejectedQueryResponse(message) {
  return {
    answer: message,
    sql: null,
    columns: [],
    rowCount: 0,
    rows: [],
  };
}

module.exports = {
  buildRejectedQueryResponse,
  inspectNaturalLanguageQuery,
};
