import express from "express";
import app from "./app.js";
import { config } from "./config/env.js";
import path from "path";

const __dirname = path.resolve();

// Serve static assets from client/dist
app.use(express.static(path.join(__dirname, "../client/dist")));

// Catch-all route FOR REACT APP (Important Fix for Express 5)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// =========================================

const port = config.port;
const host = "0.0.0.0";

app
  .listen(port, host, () => {
    console.log(`Secure exam server listening on port ${port}`);
    console.log(`Accessible at: http://localhost:${port}`);
    console.log("=== Audit Logging Active ===");
    console.log("Monitoring student sessions in real-time...\n");
  })
  .on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ ERROR: Port ${port} is already in use!`);
      console.error(`Stop the process using port ${port} or change PORT in .env`);
    } else {
      console.error("❌ ERROR: Server failed:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  });
