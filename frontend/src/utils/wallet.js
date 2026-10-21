import { ethers } from "ethers";

export function isWalletInstalled() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function requestWalletConnection() {
  if (!isWalletInstalled()) {
    throw new Error("MetaMask or compatible Web3 wallet not detected. Please install MetaMask.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts selected in wallet.");
  }
  return ethers.getAddress(accounts[0]);
}

export async function getConnectedAccount() {
  if (!isWalletInstalled()) return null;
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_accounts", []);
    return accounts && accounts.length > 0 ? ethers.getAddress(accounts[0]) : null;
  } catch {
    return null;
  }
}

export function subscribeToWalletEvents({ onAccountsChanged, onChainChanged }) {
  if (!isWalletInstalled()) return () => {};

  const handleAccountsChanged = (accounts) => {
    if (onAccountsChanged) {
      if (!accounts || accounts.length === 0) {
        onAccountsChanged(null);
      } else {
        onAccountsChanged(ethers.getAddress(accounts[0]));
      }
    }
  };

  const handleChainChanged = (chainId) => {
    if (onChainChanged) {
      onChainChanged(chainId);
    }
  };

  window.ethereum.on("accountsChanged", handleAccountsChanged);
  window.ethereum.on("chainChanged", handleChainChanged);

  return () => {
    if (window.ethereum.removeListener) {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    }
  };
}
