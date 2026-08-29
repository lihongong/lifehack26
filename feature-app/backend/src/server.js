import app from "./app.js";
const port = Number(process.env.PORT || 3000);
app.listen(port, "127.0.0.1", () =>
  console.log(`NUS Exchange backend listening on http://127.0.0.1:${port}`),
);
