const env = require("../config/env");
const { all } = require("../db/database");
const { AppError } = require("../utils/app-error");
const { getKnownTableNames } = require("./schema.service");

const BLOCKED_SQL_PATTERN =
  /\b(insert|update|delete|drop|alter|truncate|attach|detach|pragma|vacuum|create|replace|reindex|analyze)\b/i;

function stripCodeFence(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function normalizeSql(sql) {
  return stripCodeFence(sql).replace(/;+\s*$/, "").trim();
}

function assertSelectOnly(sql) {
  if (!/^select\s+/i.test(sql)) {
    throw new AppError(400, "Only SELECT queries are allowed.");
  }

  if (BLOCKED_SQL_PATTERN.test(sql)) {
    throw new AppError(400, "Only SELECT queries against the dataset are allowed.");
  }

  if (sql.includes("--") || sql.includes("/*")) {
    throw new AppError(400, "SQL comments are not allowed.");
  }

  if (sql.includes(";")) {
    throw new AppError(400, "Only a single SELECT statement is allowed.");
  }
}

function extractReferencedTables(sql) {
  const tableNames = [];
  const matcher = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;

  let match = matcher.exec(sql);

  while (match) {
    tableNames.push(match[1]);
    match = matcher.exec(sql);
  }

  return [...new Set(tableNames)];
}

function assertKnownTables(sql) {
  const knownTables = new Set(getKnownTableNames());
  const referencedTables = extractReferencedTables(sql);

  if (!referencedTables.length) {
    throw new AppError(400, "Generated SQL does not reference dataset tables.");
  }

  for (const tableName of referencedTables) {
    if (!knownTables.has(tableName)) {
      throw new AppError(400, `Generated SQL referenced an unknown table: ${tableName}`);
    }
  }
}

function withLimit(sql) {
  if (/\blimit\s+\d+/i.test(sql)) {
    return sql;
  }

  return `${sql} LIMIT ${env.defaultQueryLimit}`;
}

async function executeValidatedSelect(rawSql) {
  const sql = withLimit(normalizeSql(rawSql));

  if (!sql) {
    throw new AppError(400, "Generated SQL was empty.");
  }

  assertSelectOnly(sql);
  assertKnownTables(sql);

  try {
    await all(`EXPLAIN QUERY PLAN ${sql}`);
  } catch (error) {
    throw new AppError(
      400,
      "Generated SQL failed validation against the dataset schema.",
      error.message
    );
  }

  const rows = await all(sql);

  return {
    columns: rows[0] ? Object.keys(rows[0]) : [],
    rows,
    sql,
  };
}

module.exports = {
  executeValidatedSelect,
};
