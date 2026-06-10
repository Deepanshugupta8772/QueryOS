const buildSqlPrompt = require("../prompts/sql.prompt");
const { AppError } = require("../utils/app-error");
const { formatQueryAnswer } = require("./answer.service");
const {
  buildRejectedQueryResponse,
  inspectNaturalLanguageQuery,
} = require("./guardrails.service");
const { generateSql } = require("./llm.service");
const { getSchemaPrompt } = require("./schema.service");
const { executeValidatedSelect } = require("./sql.service");
const env = require("../config/env");

async function executeNaturalLanguageQuery(query) {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    throw new AppError(400, "Query is required.");
  }

  const inspection = inspectNaturalLanguageQuery(normalizedQuery);

  if (!inspection.allowed) {
    return buildRejectedQueryResponse(inspection.message);
  }

  const prompt = buildSqlPrompt({
    query: normalizedQuery,
    schemaPrompt: getSchemaPrompt(),
    defaultLimit: env.defaultQueryLimit,
  });
  const llmResult = await generateSql(prompt);

  if (!llmResult.sql) {
    return buildRejectedQueryResponse(
      "That question cannot be answered from the seeded SAP Order-to-Cash dataset."
    );
  }

  const execution = await executeValidatedSelect(llmResult.sql);
  const answer = formatQueryAnswer(execution);

  return {
    answer,
    columns: execution.columns,
    rowCount: execution.rows.length,
    rows: execution.rows,
    sql: execution.sql,
  };
}

module.exports = {
  executeNaturalLanguageQuery,
};
