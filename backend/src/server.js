const app = require("./app");
const env = require("./config/env");
const { seedDatabaseIfNeeded } = require("./db/seed");
const logger = require("./services/logger.service");

async function start() {
  await seedDatabaseIfNeeded();

  app.listen(env.port, () => {
    process.stdout.write(`Server listening on port ${env.port}\n`);
  });
}

start().catch((error) => {
  logger.error("Server startup failed", error);
  process.exit(1);
});
