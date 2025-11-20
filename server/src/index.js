import express from "express";
import path from "path";
import app from "./app.js";
import { config } from "./config/env.js";
import { getActiveSessionCount } from "./utils/auditLogger.js";

const __dirname = path.resolve();

// ---------------------------------------
// Serve React Vite Production Build
// ---------------------------------------
app.use(express.static(path.join(__dirname, "../client/dist")));

// Express v5 requires regex instead of "*" or "/*"
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// ---------------------------------------
// Start server
// ---------------------------------------
const port = config.port;
const host = "0.0.0.0";

const server = app.listen(port, host, () => {
  console.log(`Secure exam server listening on port ${port}`);
  console.log(`Accessible locally at: http://localhost:${port}`);
  console.log("=== Audit Logging Active ===");
  console.log("Monitoring student sessions in real-time...\n");
});

// ---------------------------------------
// Error Handling
// ---------------------------------------
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n❌ ERROR: Port ${port} is already in use!`);
    console.error(`Stop the process using port ${port} or update PORT in .env\n`);
  } else {
    console.error("\n❌ ERROR: Failed to start server:", error.message);
    console.error("Stack:", error.stack, "\n");
  }
  process.exit(1);
});
