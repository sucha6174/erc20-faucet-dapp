import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import "./eval.js"; // Ensures window.__EVAL__ and window.EVAL are registered immediately
import {
  TOKEN_ADDRESS,
  FAUCET_ADDRESS,
  RPC_URL,
} from "./config.js";
import {
  getBalance,
  canClaim,
  getRemainingAllowance,
  getLastClaimAt,
  isPaused,
  requestTokens,
  listenToEvents,
} from "./utils/contracts.js";
import {
  isWalletInstalled,
  requestWalletConnection,
  getConnectedAccount,
  subscribeToWalletEvents,
} from "./utils/wallet.js";
import "./App.css";

const COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours

export default function App() {
  const [account, setAccount] = useState(null);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [remainingAllowance, setRemainingAllowance] = useState("100");
  const [eligibleToClaim, setEligibleToClaim] = useState(false);
  const [lastClaimTimestamp, setLastClaimTimestamp] = useState(0);
  const [faucetPaused, setFaucetPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState("info"); // 'info' | 'success' | 'error'
  const [countdown, setCountdown] = useState("");

  // Refresh on-chain data for the specified or current account
  const refreshAccountData = useCallback(async (userAddress) => {
    const target = userAddress || account;
    if (!target) return;

    try {
      const [bal, allowance, eligible, lastClaim, paused] = await Promise.all([
        getBalance(target),
        getRemainingAllowance(target),
        canClaim(target),
        getLastClaimAt(target),
        isPaused(),
      ]);

      setTokenBalance(ethers.formatEther(bal));
      setRemainingAllowance(ethers.formatEther(allowance));
      setEligibleToClaim(Boolean(eligible));
      setLastClaimTimestamp(Number(lastClaim));
      setFaucetPaused(Boolean(paused));
    } catch (err) {
      console.error("Failed to refresh on-chain data:", err);
    }
  }, [account]);

  // Initial check on mount for already-connected wallet
  useEffect(() => {
    async function checkExistingConnection() {
      const existing = await getConnectedAccount();
      if (existing) {
        setAccount(existing);
        await refreshAccountData(existing);
      }
    }
    checkExistingConnection();

    // Subscribe to MetaMask account / chain changes
    const unsubscribeWallet = subscribeToWalletEvents({
      onAccountsChanged: (newAccount) => {
        setAccount(newAccount);
        if (newAccount) {
          refreshAccountData(newAccount);
        } else {
          setTokenBalance("0");
          setRemainingAllowance("100");
          setEligibleToClaim(false);
        }
      },
      onChainChanged: () => {
        window.location.reload();
      },
    });

    // Subscribe to smart contract events
    const unsubscribeEvents = listenToEvents(
      (user, amount) => {
        console.log("TokensClaimed event detected:", user, amount);
        refreshAccountData();
      },
      (paused) => {
        console.log("FaucetPaused event detected:", paused);
        setFaucetPaused(paused);
        refreshAccountData();
      }
    );

    return () => {
      unsubscribeWallet();
      unsubscribeEvents();
    };
  }, [refreshAccountData]);

  // Countdown timer calculation based on lastClaimTimestamp
  useEffect(() => {
    function updateCountdown() {
      if (!lastClaimTimestamp || lastClaimTimestamp === 0) {
        setCountdown("Ready to claim");
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const readyAt = lastClaimTimestamp + COOLDOWN_SECONDS;
      const diff = readyAt - now;

      if (diff <= 0) {
        setCountdown("Ready to claim");
        setEligibleToClaim(true);
      } else {
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        setCountdown(`${hours}h ${minutes}m ${seconds}s remaining`);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lastClaimTimestamp]);

  // Connect Wallet handler
  const handleConnect = async () => {
    setStatusMessage(null);
    try {
      setLoading(true);
      const connected = await requestWalletConnection();
      setAccount(connected);
      await refreshAccountData(connected);
      setStatusType("success");
      setStatusMessage("Wallet connected successfully!");
    } catch (err) {
      setStatusType("error");
      setStatusMessage(err.message || "Failed to connect wallet.");
    } finally {
      setLoading(false);
    }
  };

  // Disconnect handler
  const handleDisconnect = () => {
    setAccount(null);
    setTokenBalance("0");
    setRemainingAllowance("100");
    setEligibleToClaim(false);
    setStatusType("info");
    setStatusMessage("Wallet disconnected.");
  };

  // Request Tokens handler
  const handleClaim = async () => {
    if (!account) return;
    setStatusMessage(null);
    setLoading(true);
    setStatusType("info");
    setStatusMessage("Submitting claim transaction to blockchain...");

    try {
      const txHash = await requestTokens();
      setStatusType("success");
      setStatusMessage(`Transaction confirmed! Tx Hash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`);
      await refreshAccountData();
    } catch (err) {
      setStatusType("error");
      const errString = err?.message || String(err);

      if (errString.includes("4001") || errString.includes("ACTION_REJECTED")) {
        setStatusMessage("Transaction was rejected by user in MetaMask.");
      } else if (errString.includes("Cooldown period not elapsed")) {
        setStatusMessage("Cooldown period active. You must wait 24 hours between claims.");
      } else if (errString.includes("Lifetime claim limit reached")) {
        setStatusMessage("Lifetime claim limit reached (100 FTK maximum per address).");
      } else if (errString.includes("Faucet is paused")) {
        setStatusMessage("Faucet is currently paused by admin.");
      } else if (errString.includes("Insufficient token supply")) {
        setStatusMessage("Token maximum supply reached.");
      } else {
        setStatusMessage(`Claim failed: ${err?.reason || err?.message || "Transaction reverted"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const isClaimDisabled = useMemo(() => {
    if (!account || loading) return true;
    if (faucetPaused) return true;
    if (!eligibleToClaim) return true;
    if (parseFloat(remainingAllowance) < 10) return true;
    return false;
  }, [account, loading, faucetPaused, eligibleToClaim, remainingAllowance]);

  return (
    <div className="dapp-container">
      <div className="header">
        <h1>🚰 ERC-20 Token Faucet</h1>
        <p>Testnet token distribution with strictly enforced on-chain rate limits</p>
        <div className="badge-row">
          <span className={`badge ${account ? "badge-connected" : "badge-disconnected"}`}>
            {account ? "● Connected" : "○ Disconnected"}
          </span>
          {faucetPaused && (
            <span className="badge badge-paused">⏸ Faucet Paused</span>
          )}
        </div>
      </div>

      {!account ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            Connect your MetaMask wallet to check eligibility and claim tokens.
          </p>
          <button
            className="btn-primary"
            onClick={handleConnect}
            disabled={loading}
          >
            {loading ? <span className="spinner"></span> : "🦊 Connect MetaMask"}
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="address-row">
              <span>{account}</span>
              <button className="btn-secondary" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>

            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-label">Your FTK Balance</div>
                <div className="stat-value">{parseFloat(tokenBalance).toFixed(2)} FTK</div>
                <div className="stat-sub">ERC-20 Faucet Tokens</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Remaining Lifetime Allowance</div>
                <div className="stat-value">{parseFloat(remainingAllowance).toFixed(2)} FTK</div>
                <div className="stat-sub">Out of 100 FTK Max</div>
              </div>
            </div>

            <div
              className={`cooldown-banner ${
                eligibleToClaim && !faucetPaused
                  ? "cooldown-ready"
                  : "cooldown-active"
              }`}
            >
              <span>
                <strong>Claim Status:</strong>{" "}
                {faucetPaused
                  ? "Faucet Paused"
                  : parseFloat(remainingAllowance) <= 0
                  ? "Lifetime Limit Reached"
                  : eligibleToClaim
                  ? "Eligible to Claim 10 FTK"
                  : "Cooldown Active"}
              </span>
              <span>{countdown}</span>
            </div>

            <button
              className="btn-primary"
              onClick={handleClaim}
              disabled={isClaimDisabled}
            >
              {loading ? (
                <>
                  <span className="spinner"></span> Processing Transaction...
                </>
              ) : faucetPaused ? (
                "Faucet Is Paused"
              ) : parseFloat(remainingAllowance) <= 0 ? (
                "Lifetime Limit Exceeded"
              ) : !eligibleToClaim ? (
                "Cooldown Active (24h Limit)"
              ) : (
                "Request 10 FTK Tokens"
              )}
            </button>
          </div>
        </>
      )}

      {statusMessage && (
        <div
          className={`message-box ${
            statusType === "success"
              ? "msg-success"
              : statusType === "error"
              ? "msg-error"
              : "msg-info"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <div className="contract-links">
        <div>
          <strong>Token Contract:</strong>{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${TOKEN_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {TOKEN_ADDRESS}
          </a>
        </div>
        <div>
          <strong>Faucet Contract:</strong>{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${FAUCET_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {FAUCET_ADDRESS}
          </a>
        </div>
      </div>
    </div>
  );
}
