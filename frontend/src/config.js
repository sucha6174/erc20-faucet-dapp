// Dynamic configuration with multi-source fallback:
// 1. Injected window.__RUNTIME_CONFIG__ (from Docker/Express runtime)
// 2. Vite environment variables (import.meta.env, if in Vite)
// 3. Node process.env (if running under Node.js test runners)
// 4. Default deterministic local Hardhat contract addresses

const runtime = (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) || {};
const metaEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};
const procEnv = (typeof process !== "undefined" && process.env) || {};

export const TOKEN_ADDRESS =
  runtime.TOKEN_ADDRESS ||
  metaEnv.VITE_TOKEN_ADDRESS ||
  procEnv.VITE_TOKEN_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const FAUCET_ADDRESS =
  runtime.FAUCET_ADDRESS ||
  metaEnv.VITE_FAUCET_ADDRESS ||
  procEnv.VITE_FAUCET_ADDRESS ||
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

export const RPC_URL =
  runtime.RPC_URL ||
  metaEnv.VITE_RPC_URL ||
  procEnv.VITE_RPC_URL ||
  "http://127.0.0.1:8545";

export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

export const FAUCET_ABI = [
  "function requestTokens() external",
  "function canClaim(address user) external view returns (bool)",
  "function remainingAllowance(address user) external view returns (uint256)",
  "function lastClaimAt(address user) external view returns (uint256)",
  "function totalClaimed(address user) external view returns (uint256)",
  "function isPaused() external view returns (bool)",
  "function FAUCET_AMOUNT() external view returns (uint256)",
  "function COOLDOWN_TIME() external view returns (uint256)",
  "function MAX_CLAIM_AMOUNT() external view returns (uint256)",
  "function token() external view returns (address)",
  "event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp)",
  "event FaucetPaused(bool paused)"
];
