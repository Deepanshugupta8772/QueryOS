const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const logger = require("../services/logger.service");
const { AppError } = require("../utils/app-error");
const {
  all,
  exec,
  finalizeStatement,
  prepare,
  runStatement,
  withTransaction,
} = require("./database");
const { DATASET_SCHEMA, INDEX_DEFINITIONS } = require("./schema");

const IMPORT_STATE_TABLE = "_dataset_import_state";
const METRIC_COLUMN_PATTERN = /(amount|quantity|weight)$/i;

function isNumericString(value) {
  return typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim());
}

function inferColumnType(columnName, value, currentType) {
  if (value === null || value === undefined) {
    return currentType || "TEXT";
  }

  let detectedType = "TEXT";

  if (typeof value === "boolean") {
    detectedType = "INTEGER";
  } else if (typeof value === "number") {
    detectedType = Number.isInteger(value) ? "INTEGER" : "REAL";
  } else if (typeof value === "object") {
    detectedType = "TEXT";
  } else if (METRIC_COLUMN_PATTERN.test(columnName) && isNumericString(value)) {
    detectedType = "REAL";
  }

  if (!currentType) {
    return detectedType;
  }

  if (currentType === detectedType) {
    return currentType;
  }

  if (
    (currentType === "INTEGER" && detectedType === "REAL") ||
    (currentType === "REAL" && detectedType === "INTEGER")
  ) {
    return "REAL";
  }

  return "TEXT";
}

function serializeValue(columnName, value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "object") {
    // SAP time-like fields arrive as nested objects; persist them losslessly as JSON text.
    return JSON.stringify(value);
  }

  if (METRIC_COLUMN_PATTERN.test(columnName) && isNumericString(value)) {
    // Amount and quantity fields are string-encoded in the source files.
    return Number(value);
  }

  return value;
}

async function readJsonlTableRows(directoryPath) {
  const fileNames = fs
    .readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".jsonl"))
    .sort();

  const rows = [];
  const columnTypes = {};
  const orderedColumns = [];
  const seenColumns = new Set();

  for (const fileName of fileNames) {
    const filePath = path.join(directoryPath, fileName);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const parsedRow = JSON.parse(line);
      rows.push(parsedRow);

      for (const [columnName, value] of Object.entries(parsedRow)) {
        if (!seenColumns.has(columnName)) {
          orderedColumns.push(columnName);
          seenColumns.add(columnName);
        }

        columnTypes[columnName] = inferColumnType(columnName, value, columnTypes[columnName]);
      }
    }
  }

  return {
    columns: orderedColumns,
    columnTypes,
    rows,
  };
}

function buildCreateTableSql(tableName, columns, columnTypes) {
  const definitions = columns.map((columnName) => `"${columnName}" ${columnTypes[columnName] || "TEXT"}`);
  return `CREATE TABLE "${tableName}" (${definitions.join(", ")})`;
}

async function importTable(tableName, directoryPath) {
  const { columns, columnTypes, rows } = await readJsonlTableRows(directoryPath);

  if (!columns.length) {
    throw new AppError(500, `Dataset table "${tableName}" has no columns.`);
  }

  await exec(`DROP TABLE IF EXISTS "${tableName}"`);
  await exec(buildCreateTableSql(tableName, columns, columnTypes));

  const placeholders = columns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO "${tableName}" (${columns
    .map((columnName) => `"${columnName}"`)
    .join(", ")}) VALUES (${placeholders})`;
  const statement = await prepare(insertSql);

  try {
    for (const row of rows) {
      const values = columns.map((columnName) => serializeValue(columnName, row[columnName]));
      await runStatement(statement, values);
    }
  } finally {
    await finalizeStatement(statement);
  }

  for (const [indexedTableName, indexedColumns] of INDEX_DEFINITIONS) {
    if (indexedTableName !== tableName) {
      continue;
    }

    const indexName = `idx_${indexedTableName}_${indexedColumns.join("_")}`;
    const quotedColumns = indexedColumns.map((columnName) => `"${columnName}"`).join(", ");
    await exec(
      `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${indexedTableName}" (${quotedColumns})`
    );
  }

  await execWithParams(
    `INSERT OR REPLACE INTO "${IMPORT_STATE_TABLE}" (tableName, rowCount, importedAt, sourcePath)
     VALUES (?, ?, ?, ?)`,
    [tableName, rows.length, new Date().toISOString(), directoryPath]
  );

  return rows.length;
}

async function execWithParams(sql, params = []) {
  const statement = await prepare(sql);

  try {
    await runStatement(statement, params);
  } finally {
    await finalizeStatement(statement);
  }
}

async function ensureImportStateTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS "${IMPORT_STATE_TABLE}" (
      tableName TEXT PRIMARY KEY,
      rowCount INTEGER NOT NULL,
      importedAt TEXT NOT NULL,
      sourcePath TEXT NOT NULL
    )
  `);
}

async function isDatabaseSeeded() {
  const importStateExists = await all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [IMPORT_STATE_TABLE]
  );

  if (!importStateExists.length) {
    return false;
  }

  const expectedTableNames = Object.keys(DATASET_SCHEMA);
  const importedTables = await all(`SELECT tableName, rowCount FROM "${IMPORT_STATE_TABLE}"`);

  if (importedTables.length !== expectedTableNames.length) {
    return false;
  }

  const rowCountByTable = new Map(importedTables.map((row) => [row.tableName, row.rowCount]));

  return expectedTableNames.every(
    (tableName) => rowCountByTable.has(tableName) && Number(rowCountByTable.get(tableName)) > 0
  );
}

async function seedDatabaseIfNeeded({ force = false } = {}) {
  const datasetPath = env.datasetPath;

  if (!fs.existsSync(datasetPath)) {
    throw new AppError(500, `Dataset directory not found at ${datasetPath}`);
  }

  const alreadySeeded = await isDatabaseSeeded();

  if (alreadySeeded && !force) {
    return {
      seeded: false,
    };
  }

  await withTransaction(async () => {
    await ensureImportStateTable();
    await exec(`DELETE FROM "${IMPORT_STATE_TABLE}"`);

    for (const tableName of Object.keys(DATASET_SCHEMA)) {
      const directoryPath = path.join(datasetPath, tableName);

      if (!fs.existsSync(directoryPath)) {
        throw new AppError(500, `Expected dataset folder missing: ${directoryPath}`);
      }

      const rowCount = await importTable(tableName, directoryPath);
      logger.debug(`Imported ${tableName} (${rowCount} rows)`);
    }
  });

  return {
    seeded: true,
  };
}

if (require.main === module) {
  const force = process.argv.includes("--force");

  seedDatabaseIfNeeded({ force })
    .then((result) => {
      process.stdout.write(
        `${result.seeded ? "Database seeded" : "Database already seeded"}\n`
      );
    })
    .catch((error) => {
      logger.error("Database seed failed", error);
      process.exit(1);
    });
}

module.exports = {
  seedDatabaseIfNeeded,
};
