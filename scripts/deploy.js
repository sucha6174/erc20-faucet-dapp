const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=========================================");
  console.log("Starting deployment with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
  console.log("Network:", hre.network.name);
  console.log("=========================================");

  // 1. Deploy Token contract
  console.log("1. Deploying Token contract...");
  const Token = await hre.ethers.getContractFactory("Token");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(" Token deployed to:", tokenAddress);

  // 2. Deploy TokenFaucet contract
  console.log("2. Deploying TokenFaucet contract...");
  const TokenFaucet = await hre.ethers.getContractFactory("TokenFaucet");
  const faucet = await TokenFaucet.deploy(tokenAddress);
  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();
  console.log(" TokenFaucet deployed to:", faucetAddress);

  // 3. Grant minting role to faucet in Token contract
  console.log("3. Granting minting authorization to faucet...");
  const tx = await token.setFaucet(faucetAddress);
  await tx.wait(1);
  console.log(" Minting authorization granted to faucet:", faucetAddress);

  // 4. Save deployment info for frontend and environment
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    token: tokenAddress,
    faucet: faucetAddress,
    timestamp: new Date().toISOString(),
  };

  const contractsJsonPath = path.join(__dirname, "..", "frontend", "src", "contracts.json");
  const frontendDir = path.dirname(contractsJsonPath);
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }
  fs.writeFileSync(contractsJsonPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(" Saved deployment addresses to:", contractsJsonPath);

  // Update or create .env files
  const rootEnvPath = path.join(__dirname, "..", ".env");
  const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env");
  const rpcUrl = hre.network.name === "sepolia"
    ? (process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL || "https://rpc.sepolia.org")
    : "http://127.0.0.1:8545";

  const envContent = `VITE_RPC_URL=${rpcUrl}\nVITE_TOKEN_ADDRESS=${tokenAddress}\nVITE_FAUCET_ADDRESS=${faucetAddress}\n`;
  fs.writeFileSync(frontendEnvPath, envContent);
  console.log(" Updated frontend/.env");

  if (!fs.existsSync(rootEnvPath)) {
    fs.writeFileSync(rootEnvPath, envContent);
  }

  // 5. Verification on Etherscan if on Sepolia
  if (hre.network.name === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for block confirmations before verification...");
    await token.deploymentTransaction().wait(5);
    await faucet.deploymentTransaction().wait(5);

    try {
      console.log("Verifying Token on Etherscan...");
      await hre.run("verify:verify", {
        address: tokenAddress,
        constructorArguments: [],
      });
      console.log(" Token verified successfully!");
    } catch (err) {
      console.log(" Token verification error:", err.message);
    }

    try {
      console.log("Verifying TokenFaucet on Etherscan...");
      await hre.run("verify:verify", {
        address: faucetAddress,
        constructorArguments: [tokenAddress],
      });
      console.log(" TokenFaucet verified successfully!");
    } catch (err) {
      console.log(" TokenFaucet verification error:", err.message);
    }
  }

  console.log("=========================================");
  console.log("Deployment completed successfully!");
  console.log("Token Address: ", tokenAddress);
  console.log("Faucet Address:", faucetAddress);
  console.log("=========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
