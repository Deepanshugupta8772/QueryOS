const axios = require("axios");

const env = require("../config/env");
const { AppError } = require("../utils/app-error");

function stripCodeFence(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseStructuredSqlResponse(content) {
  const cleanedContent = stripCodeFence(content);

  try {
    const parsed = JSON.parse(cleanedContent);
    return {
      reason: parsed.reason ? String(parsed.reason).trim() : null,
      sql: parsed.sql ? String(parsed.sql).trim() : null,
    };
  } catch (error) {
    return {
      reason: null,
      sql: cleanedContent,
    };
  }
}

async function generateSql(prompt) {
  if (!env.llmApiKey) {
    throw new AppError(
      503,
      "LLM API key not configured. Set LLM_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY."
    );
  }

  let response;

  try {
    response = await axios.post(
      env.llmApiUrl,
      {
        model: env.llmModel,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You convert SAP Order-to-Cash questions into SQLite SELECT statements. Return JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${env.llmApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: env.llmTimeoutMs,
      }
    );
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || "Failed to reach the configured LLM provider.";
    throw new AppError(502, message);
  }

  const content = response.data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new AppError(502, "LLM response did not include SQL content.");
  }

  return parseStructuredSqlResponse(content);
}

module.exports = {
  generateSql,
};
