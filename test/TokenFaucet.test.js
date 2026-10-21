const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Token and TokenFaucet Test Suite", function () {
  let token, faucet;
  let owner, user1, user2, user3;

  const FAUCET_AMOUNT = ethers.parseEther("10");
  const MAX_CLAIM_AMOUNT = ethers.parseEther("100");
  const COOLDOWN_TIME = 24 * 60 * 60; // 24 hours

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // 1. Deploy Token
    const TokenFactory = await ethers.getContractFactory("Token");
    token = await TokenFactory.deploy();
    await token.waitForDeployment();

    // 2. Deploy Faucet
    const FaucetFactory = await ethers.getContractFactory("TokenFaucet");
    faucet = await FaucetFactory.deploy(await token.getAddress());
    await faucet.waitForDeployment();

    // 3. Set Faucet in Token
    await token.setFaucet(await faucet.getAddress());
  });

  describe("Auto-authorization without setFaucet", function () {
    it("should allow requestTokens even if setFaucet was never called", async function () {
      const TokenFactory = await ethers.getContractFactory("Token");
      const unlinkedToken = await TokenFactory.deploy();
      await unlinkedToken.waitForDeployment();

      const FaucetFactory = await ethers.getContractFactory("TokenFaucet");
      const unlinkedFaucet = await FaucetFactory.deploy(await unlinkedToken.getAddress());
      await unlinkedFaucet.waitForDeployment();

      // Note: We deliberately DO NOT call unlinkedToken.setFaucet!
      await unlinkedFaucet.connect(user1).requestTokens();
      expect(await unlinkedToken.balanceOf(user1.address)).to.equal(FAUCET_AMOUNT);
      expect(await unlinkedToken.faucet()).to.equal(await unlinkedFaucet.getAddress());
    });
  });

  describe("1. Token Deployment & ERC-20 State", function () {
    it("should initialize token metadata correctly", async function () {
      expect(await token.name()).to.equal("Faucet Token");
      expect(await token.symbol()).to.equal("FTK");
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(0n);
      expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("1000000"));
    });

    it("should support ERC-20 approve and allowance functions", async function () {
      // First let user1 claim tokens
      await faucet.connect(user1).requestTokens();
      const amount = ethers.parseEther("5");

      await token.connect(user1).approve(user2.address, amount);
      expect(await token.allowance(user1.address, user2.address)).to.equal(amount);

      await token.connect(user2).transferFrom(user1.address, user3.address, amount);
      expect(await token.balanceOf(user3.address)).to.equal(amount);
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("5"));
    });

    it("should support transfer function and emit Transfer event", async function () {
      await faucet.connect(user1).requestTokens();
      const transferAmount = ethers.parseEther("3");

      await expect(token.connect(user1).transfer(user2.address, transferAmount))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, user2.address, transferAmount);

      expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("7"));
    });

    it("should restrict minting to faucet only", async function () {
      await expect(
        token.connect(user1).mint(user1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Only faucet can mint");

      await expect(
        token.connect(owner).mint(owner.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Only faucet can mint");
    });
  });

  describe("2. Faucet Deployment & Initial Configuration", function () {
    it("should set correct constants and state", async function () {
      expect(await faucet.FAUCET_AMOUNT()).to.equal(FAUCET_AMOUNT);
      expect(await faucet.COOLDOWN_TIME()).to.equal(COOLDOWN_TIME);
      expect(await faucet.MAX_CLAIM_AMOUNT()).to.equal(MAX_CLAIM_AMOUNT);
      expect(await faucet.admin()).to.equal(owner.address);
      expect(await faucet.isPaused()).to.equal(false);
      expect(await faucet.token()).to.equal(await token.getAddress());
    });

    it("should confirm canClaim returns true for new addresses", async function () {
      expect(await faucet.canClaim(user1.address)).to.equal(true);
      expect(await faucet.canClaim(user2.address)).to.equal(true);
      expect(await faucet.remainingAllowance(user1.address)).to.equal(MAX_CLAIM_AMOUNT);
    });
  });

  describe("3. Token Claiming & Cooldown Enforcement", function () {
    it("should allow an eligible user to request tokens successfully", async function () {
      const tx = await faucet.connect(user1).requestTokens();
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      expect(await token.balanceOf(user1.address)).to.equal(FAUCET_AMOUNT);
      expect(await faucet.lastClaimAt(user1.address)).to.equal(block.timestamp);
      expect(await faucet.totalClaimed(user1.address)).to.equal(FAUCET_AMOUNT);
      expect(await faucet.remainingAllowance(user1.address)).to.equal(
        MAX_CLAIM_AMOUNT - FAUCET_AMOUNT
      );
    });

    it("should emit TokensClaimed and Transfer events on claim", async function () {
      await expect(faucet.connect(user1).requestTokens())
        .to.emit(faucet, "TokensClaimed")
        .and.to.emit(token, "Transfer");
    });

    it("should revert with clear message on immediate re-claim (cooldown active)", async function () {
      await faucet.connect(user1).requestTokens();

      expect(await faucet.canClaim(user1.address)).to.equal(false);

      await expect(
        faucet.connect(user1).requestTokens()
      ).to.be.revertedWith("Cooldown period not elapsed");
    });

    it("should allow claiming again after cooldown period elapses", async function () {
      await faucet.connect(user1).requestTokens();

      // Fast-forward 24 hours
      await ethers.provider.send("evm_increaseTime", [COOLDOWN_TIME + 1]);
      await ethers.provider.send("evm_mine");

      expect(await faucet.canClaim(user1.address)).to.equal(true);

      await faucet.connect(user1).requestTokens();
      expect(await token.balanceOf(user1.address)).to.equal(FAUCET_AMOUNT * 2n);
      expect(await faucet.totalClaimed(user1.address)).to.equal(FAUCET_AMOUNT * 2n);
      expect(await faucet.remainingAllowance(user1.address)).to.equal(
        MAX_CLAIM_AMOUNT - FAUCET_AMOUNT * 2n
      );
    });

    it("should allow multiple users to claim independently without affecting each other", async function () {
      await faucet.connect(user1).requestTokens();
      await faucet.connect(user2).requestTokens();

      expect(await token.balanceOf(user1.address)).to.equal(FAUCET_AMOUNT);
      expect(await token.balanceOf(user2.address)).to.equal(FAUCET_AMOUNT);

      expect(await faucet.canClaim(user1.address)).to.equal(false);
      expect(await faucet.canClaim(user2.address)).to.equal(false);
      expect(await faucet.canClaim(user3.address)).to.equal(true);
    });
  });

  describe("4. Lifetime Limit Enforcement", function () {
    it("should enforce lifetime claim limit and revert when limit reached", async function () {
      // Claim 10 times (10 * 10 = 100 FTK = MAX_CLAIM_AMOUNT)
      for (let i = 0; i < 10; i++) {
        await faucet.connect(user1).requestTokens();
        await ethers.provider.send("evm_increaseTime", [COOLDOWN_TIME + 1]);
        await ethers.provider.send("evm_mine");
      }

      expect(await faucet.totalClaimed(user1.address)).to.equal(MAX_CLAIM_AMOUNT);
      expect(await faucet.remainingAllowance(user1.address)).to.equal(0n);
      expect(await faucet.canClaim(user1.address)).to.equal(false);

      // Attempting 11th claim
      await expect(
        faucet.connect(user1).requestTokens()
      ).to.be.revertedWith("Lifetime claim limit reached");
    });

    it("should return correct remainingAllowance throughout claim lifecycle", async function () {
      expect(await faucet.remainingAllowance(user1.address)).to.equal(ethers.parseEther("100"));

      await faucet.connect(user1).requestTokens();
      expect(await faucet.remainingAllowance(user1.address)).to.equal(ethers.parseEther("90"));

      await ethers.provider.send("evm_increaseTime", [COOLDOWN_TIME + 1]);
      await ethers.provider.send("evm_mine");

      await faucet.connect(user1).requestTokens();
      expect(await faucet.remainingAllowance(user1.address)).to.equal(ethers.parseEther("80"));
    });
  });

  describe("5. Pause Mechanism & Admin Access Control", function () {
    it("should allow admin to pause and unpause, emitting FaucetPaused event", async function () {
      await expect(faucet.connect(owner).setPaused(true))
        .to.emit(faucet, "FaucetPaused")
        .withArgs(true);

      expect(await faucet.isPaused()).to.equal(true);
      expect(await faucet.canClaim(user1.address)).to.equal(false);

      await expect(
        faucet.connect(user1).requestTokens()
      ).to.be.revertedWith("Faucet is paused");

      await expect(faucet.connect(owner).setPaused(false))
        .to.emit(faucet, "FaucetPaused")
        .withArgs(false);

      expect(await faucet.isPaused()).to.equal(false);
      expect(await faucet.canClaim(user1.address)).to.equal(true);

      await faucet.connect(user1).requestTokens();
      expect(await token.balanceOf(user1.address)).to.equal(FAUCET_AMOUNT);
    });

    it("should revert when non-admin tries to pause or unpause", async function () {
      await expect(
        faucet.connect(user1).setPaused(true)
      ).to.be.revertedWith("Only admin");
    });
  });
});
