const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Token and TokenFaucet Test Suite (contracts/test)", function () {
  let token, faucet;
  let owner, user1, user2, user3;

  const FAUCET_AMOUNT = ethers.parseEther("10");
  const MAX_CLAIM_AMOUNT = ethers.parseEther("100");
  const COOLDOWN_TIME = 24 * 60 * 60; // 24 hours

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("Token");
    token = await TokenFactory.deploy();
    await token.waitForDeployment();

    const FaucetFactory = await ethers.getContractFactory("TokenFaucet");
    faucet = await FaucetFactory.deploy(await token.getAddress());
    await faucet.waitForDeployment();

    await token.setFaucet(await faucet.getAddress());
  });

  it("should claim tokens and update all states accurately", async function () {
    await faucet.connect(user1).requestTokens();
    expect(await token.balanceOf(user1.address)).to.equal(FAUCET_AMOUNT);
    expect(await faucet.totalClaimed(user1.address)).to.equal(FAUCET_AMOUNT);
    expect(await faucet.remainingAllowance(user1.address)).to.equal(MAX_CLAIM_AMOUNT - FAUCET_AMOUNT);
  });

  it("should enforce cooldown period", async function () {
    await faucet.connect(user1).requestTokens();
    await expect(faucet.connect(user1).requestTokens()).to.be.revertedWith("Cooldown period not elapsed");
  });
});
