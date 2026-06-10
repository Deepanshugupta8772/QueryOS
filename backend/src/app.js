const cors = require("cors");
const express = require("express");
const path = require("path");

const apiRoutes = require("./routes");
const { errorMiddleware, notFoundMiddleware } = require("./middlewares/error.middleware");
const env = require("./config/env");

function createCorsOrigin(originSetting) {
  if (originSetting === "*") {
    return true;
  }

  const allowedOrigins = originSetting
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedOrigins;
}

const app = express();

app.use(
  cors({
    origin: createCorsOrigin(env.clientOrigin),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRoutes);
app.use(
  express.static(
    path.join(__dirname, "../../frontend/dist")
  )
);

app.get("/*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "../../frontend/dist/index.html"
    )
  );
});
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
