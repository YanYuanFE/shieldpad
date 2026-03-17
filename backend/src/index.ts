import express from "express";
import cors from "cors";
import { config } from "./config";
import tokensRouter from "./routes/tokens";

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  })
);
app.use(express.json());

// Routes
app.use("/api/tokens", tokensRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    network: config.network,
    deployer: config.deployerAddress,
    apiUrl: config.stacksApiUrl,
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`ShieldPad backend running on port ${config.port}`);
  console.log(`  Network:  ${config.network}`);
  console.log(`  API URL:  ${config.stacksApiUrl}`);
  console.log(`  Deployer: ${config.deployerAddress}`);
});
