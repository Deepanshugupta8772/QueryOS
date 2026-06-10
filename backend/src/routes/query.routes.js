const express = require("express");

const { runQuery } = require("../controllers/query.controller");

const router = express.Router();

router.post("/", runQuery);

module.exports = router;
