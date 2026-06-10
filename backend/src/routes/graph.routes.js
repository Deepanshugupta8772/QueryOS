const express = require("express");

const { getGraph } = require("../controllers/graph.controller");

const router = express.Router();

router.get("/", getGraph);

module.exports = router;
