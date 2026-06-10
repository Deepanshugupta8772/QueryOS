const sqlite3 = require("sqlite3").verbose();

const env = require("../config/env");

const database = new sqlite3.Database(env.databasePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        changes: this.changes,
        lastID: this.lastID,
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function prepare(sql) {
  return new Promise((resolve, reject) => {
    const statement = database.prepare(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(statement);
    });
  });
}

function runStatement(statement, params = []) {
  return new Promise((resolve, reject) => {
    statement.run(params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        changes: this.changes,
        lastID: this.lastID,
      });
    });
  });
}

function finalizeStatement(statement) {
  return new Promise((resolve, reject) => {
    statement.finalize((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

database.serialize(() => {
  // These pragmas keep the API responsive without changing query semantics.
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
  `);
});

async function withTransaction(work) {
  await exec("BEGIN");

  try {
    const result = await work();
    await exec("COMMIT");
    return result;
  } catch (error) {
    await exec("ROLLBACK");
    throw error;
  }
}

function buildInClause(values) {
  const filtered = [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
  const placeholders = filtered.map(() => "?").join(", ");
  return {
    values: filtered,
    placeholders,
  };
}

module.exports = {
  all,
  buildInClause,
  exec,
  finalizeStatement,
  get,
  prepare,
  run,
  runStatement,
  withTransaction,
};
