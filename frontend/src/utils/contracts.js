import { ethers } from "ethers";
import {
  TOKEN_ADDRESS,
  FAUCET_ADDRESS,
  RPC_URL,
  TOKEN_ABI,
  FAUCET_ABI,
} from "../config.js";

export function getProvider() {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  return new ethers.JsonRpcProvider(RPC_URL);
}

export async function getSigner() {
  if (typeof window !== "undefined" && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    return await provider.getSigner();
  }
  const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
  return await rpcProvider.getSigner(0);
}

export function getTokenContract(signerOrProvider) {
  const runner = signerOrProvider || getProvider();
  return new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, runner);
}

export function getFaucetContract(signerOrProvider) {
  const runner = signerOrProvider || getProvider();
  return new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, runner);
}

export async function getBalance(address) {
  const token = getTokenContract();
  return await token.balanceOf(address);
}

export async function canClaim(address) {
  const faucet = getFaucetContract();
  return await faucet.canClaim(address);
}

export async function getRemainingAllowance(address) {
  const faucet = getFaucetContract();
  return await faucet.remainingAllowance(address);
}

export async function getLastClaimAt(address) {
  const faucet = getFaucetContract();
  return await faucet.lastClaimAt(address);
}

export async function isPaused() {
  const faucet = getFaucetContract();
  return await faucet.isPaused();
}

export async function requestTokens() {
  const signer = await getSigner();
  const faucet = getFaucetContract(signer);
  const tx = await faucet.requestTokens();
  const receipt = await tx.wait(1);
  return receipt.hash || tx.hash;
}

export function listenToEvents(onTokensClaimed, onFaucetPaused) {
  const provider = getProvider();
  const faucet = getFaucetContract(provider);

  if (onTokensClaimed) {
    faucet.on("TokensClaimed", onTokensClaimed);
  }
  if (onFaucetPaused) {
    faucet.on("FaucetPaused", onFaucetPaused);
  }

  return () => {
    faucet.removeAllListeners();
  };
}
