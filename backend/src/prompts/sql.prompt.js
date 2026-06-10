module.exports = function buildSqlPrompt({ query, schemaPrompt, defaultLimit }) {
  return `
You are generating a single SQLite query for an SAP Order-to-Cash dataset.

Schema:
${schemaPrompt}

Rules:
- Output JSON only in the shape {"sql":"...","reason":null}
- If the question cannot be answered from this schema, return {"sql":null,"reason":"unsupported"}
- Generate exactly one SQLite SELECT statement
- Do not use CTEs
- Do not use comments
- Do not use PRAGMA or any write operation
- Use only the listed tables and columns
- Prefer explicit JOINs
- Cast amount, quantity, and weight fields with CAST(column AS REAL) when sorting, filtering, or aggregating
- Add LIMIT ${defaultLimit} unless the user explicitly requests a smaller limit

Question:
${query}
`.trim();
};
