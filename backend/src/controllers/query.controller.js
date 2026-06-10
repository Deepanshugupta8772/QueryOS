const { executeNaturalLanguageQuery } = require("../services/query.service");

async function runQuery(req, res, next) {
  try {
    const response = await executeNaturalLanguageQuery(req.body.query);
    res.json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  runQuery,
};
