const path = require("path");

const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const rootDirectory = path.resolve(__dirname, "../../..");

function resolveFromRoot(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(rootDirectory, inputPath);
}

const env = Object.freeze({
  rootDirectory,
  port: Number(process.env.PORT || 5000),
  debugEnabled: String(process.env.DEBUG || "").toLowerCase() === "true",
  clientOrigin: process.env.CLIENT_ORIGIN || "*",
  databasePath: resolveFromRoot(process.env.SQLITE_PATH || "data.db"),
  datasetPath: resolveFromRoot(process.env.DATASET_PATH || "backend/data/sap-o2c-data"),
  graphContextLimit: Number(process.env.GRAPH_CONTEXT_LIMIT || 24),
  graphPartnerLimit: Number(process.env.GRAPH_PARTNER_LIMIT || 3),
  llmApiKey:
    process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || "",
  llmApiUrl:
    process.env.LLM_API_URL ||
    (process.env.GROQ_API_KEY
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions"),
  llmModel:
    process.env.LLM_MODEL ||
    (process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4.1-mini"),
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
  defaultQueryLimit: Number(process.env.DEFAULT_QUERY_LIMIT || 200),
});

module.exports = env;
