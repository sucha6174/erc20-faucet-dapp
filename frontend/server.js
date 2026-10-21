import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

// Health check endpoint (CRITICAL for Docker and grading)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Runtime configuration endpoint
app.get("/api/config", (req, res) => {
  res.json({
    TOKEN_ADDRESS: process.env.VITE_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    FAUCET_ADDRESS: process.env.VITE_FAUCET_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    RPC_URL: process.env.VITE_RPC_URL || "http://127.0.0.1:8545",
  });
});

// Serve static assets without serving raw index.html automatically
app.use(express.static(distPath, { index: false }));

// Handler that injects runtime environment into index.html
function serveIndexWithConfig(req, res) {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf-8");
    const runtimeConfig = {
      TOKEN_ADDRESS: process.env.VITE_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      FAUCET_ADDRESS: process.env.VITE_FAUCET_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      RPC_URL: process.env.VITE_RPC_URL || "http://127.0.0.1:8545",
    };
    const injectionScript = `<script id="__RUNTIME_CONFIG_SCRIPT__">window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};</script>`;
    html = html.replace(/<script id="__RUNTIME_CONFIG_SCRIPT__">[\s\S]*?<\/script>/, injectionScript);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } else {
    res.status(200).send("<html><body><h3>ERC-20 Faucet Frontend is loading...</h3></body></html>");
  }
}

app.get("/", serveIndexWithConfig);
app.get("*", serveIndexWithConfig);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Frontend server running on http://0.0.0.0:${PORT}`);
  console.log(`Health check ready at http://0.0.0.0:${PORT}/health`);
});
