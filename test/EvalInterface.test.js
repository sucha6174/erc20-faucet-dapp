const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Evaluation Interface (__EVAL__ and EVAL) End-to-End Test", function () {
  let token, faucet;
  let deployer, user;

  before(async function () {
    [deployer, user] = await ethers.getSigners();

    // Deploy contracts
    const TokenFactory = await ethers.getContractFactory("Token");
    token = await TokenFactory.deploy();
    await token.waitForDeployment();

    const FaucetFactory = await ethers.getContractFactory("TokenFaucet");
    faucet = await FaucetFactory.deploy(await token.getAddress());
    await faucet.waitForDeployment();

    await token.setFaucet(await faucet.getAddress());

    process.env.VITE_TOKEN_ADDRESS = await token.getAddress();
    process.env.VITE_FAUCET_ADDRESS = await faucet.getAddress();
  });

  it("should verify all eval interface contract methods", async function () {
    // Dynamically import evalInterface
    const evalModule = await import("../frontend/src/eval.js");
    const evalInterface = evalModule.default;

    // 1. Contract addresses
    const addresses = await evalInterface.getContractAddresses();
    expect(addresses).to.have.property("token");
    expect(addresses).to.have.property("faucet");

    // 2. Connect wallet
    const connected = await evalInterface.connectWallet();
    expect(connected).to.be.a("string");
    expect(ethers.isAddress(connected)).to.be.true;

    // 3. canClaim
    const canUserClaim = await evalInterface.canClaim(user.address);
    expect(canUserClaim).to.be.a("boolean");
    expect(canUserClaim).to.be.true;

    // 4. getBalance
    const balance = await evalInterface.getBalance(user.address);
    expect(balance).to.be.a("string");
    expect(balance).to.equal("0");

    // 5. getRemainingAllowance
    const allowance = await evalInterface.getRemainingAllowance(user.address);
    expect(allowance).to.be.a("string");
    expect(allowance).to.equal(ethers.parseEther("100").toString());

    // 6. Global scope exposure check
    if (typeof window !== "undefined") {
      expect(window.__EVAL__).to.exist;
      expect(window.EVAL).to.exist;
    }
  });
});
