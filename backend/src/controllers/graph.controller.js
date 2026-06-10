const { buildGraph } = require("../services/graph.service");

async function getGraph(req, res, next) {
  try {
    const graph = await buildGraph(req.query.entity, req.query.id);
    res.json(graph);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getGraph,
};
