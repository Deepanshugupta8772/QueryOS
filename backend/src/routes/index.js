const express = require("express");

const graphRoutes = require("./graph.routes");
const healthRoutes = require("./health.routes");
const queryRoutes = require("./query.routes");

const router = express.Router();

router.use("/graph", graphRoutes);
router.use("/health", healthRoutes);
router.use("/query", queryRoutes);

module.exports = router;
