import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ArcHandshake Escrow & Group Treasury", function () {
  let escrow: any;
  let treasury: any;
  let mockUSDC: any;
  let owner: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let evaluator: HardhatEthersSigner;
  let otherMember: HardhatEthersSigner;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, buyer, seller, evaluator, otherMember] = await ethers.getSigners();

    // 1. Deploy a mock USDC contract because the real one is at a precompile address
    const MockERC20 = await ethers.getContractFactory("MockUSDC");
    // We deploy it and then overwrite the USDC address reference or we just mock it.
    // For test isolation, we'll deploy a MockUSDC and we'll deploy a modified Escrow/Treasury for test purposes or we can use the MockUSDC address.
    // To make the tests work cleanly on Hardhat network, we will deploy MockUSDC and point our test contracts to it.
    mockUSDC = await MockERC20.deploy();
    await mockUSDC.waitForDeployment();

    // Deploy Escrow and Treasury pointing to MockUSDC
    const EscrowFactory = await ethers.getContractFactory("ArcHandshakeEscrow");
    escrow = await EscrowFactory.deploy(await mockUSDC.getAddress());
    await escrow.waitForDeployment();

    const TreasuryFactory = await ethers.getContractFactory("ArcGroupTreasury");
    treasury = await TreasuryFactory.deploy(await mockUSDC.getAddress());
    await treasury.waitForDeployment();

    // Mint some mock USDC
    await mockUSDC.mint(buyer.address, ethers.parseUnits("1000", 6));
    await mockUSDC.mint(owner.address, ethers.parseUnits("1000", 6));
    await mockUSDC.mint(otherMember.address, ethers.parseUnits("1000", 6));
  });

  describe("ArcHandshakeEscrow", function () {
    it("Should create, set budget, fund, submit, and complete a job", async function () {
      const expiredAt = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
      
      // 1. Create Job
      await escrow.connect(buyer).createJob(
        seller.address,
        evaluator.address,
        expiredAt,
        "Logo Design",
        ethers.ZeroAddress
      );

      const jobId = 1;
      let job = await escrow.jobs(jobId);
      expect(job.client).to.equal(buyer.address);
      expect(job.status).to.equal(0); // Open

      // 2. Set Budget
      const budgetAmount = ethers.parseUnits("50", 6); // 50 USDC
      await escrow.connect(seller).setBudget(jobId, budgetAmount, "0x");
      job = await escrow.jobs(jobId);
      expect(job.budget).to.equal(budgetAmount);

      // 3. Fund Job
      await mockUSDC.connect(buyer).approve(await escrow.getAddress(), budgetAmount);
      await escrow.connect(buyer).fund(jobId, "0x");
      job = await escrow.jobs(jobId);
      expect(job.status).to.equal(1); // Funded
      expect(await mockUSDC.balanceOf(await escrow.getAddress())).to.equal(budgetAmount);

      // 4. Submit Deliverable
      const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes("rocket-file"));
      await escrow.connect(seller).submit(jobId, deliverableHash, "0x");
      job = await escrow.jobs(jobId);
      expect(job.status).to.equal(2); // Submitted
      expect(job.deliverableHash).to.equal(deliverableHash);

      // 5. Complete Job
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("approved"));
      await expect(escrow.connect(evaluator).complete(jobId, reasonHash, "0x"))
        .to.emit(escrow, "Completed")
        .withArgs(jobId, reasonHash);

      job = await escrow.jobs(jobId);
      expect(job.status).to.equal(3); // Completed
      expect(await mockUSDC.balanceOf(seller.address)).to.equal(budgetAmount);
      expect(await mockUSDC.balanceOf(await escrow.getAddress())).to.equal(0);
    });

    it("Should handle disputes and arbitrator resolution", async function () {
      const expiredAt = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
      await escrow.connect(buyer).createJob(seller.address, evaluator.address, expiredAt, "Logo Design", ethers.ZeroAddress);
      
      const jobId = 1;
      const budgetAmount = ethers.parseUnits("100", 6);
      await escrow.connect(seller).setBudget(jobId, budgetAmount, "0x");
      await mockUSDC.connect(buyer).approve(await escrow.getAddress(), budgetAmount);
      await escrow.connect(buyer).fund(jobId, "0x");

      // File Dispute
      await escrow.connect(buyer).dispute(jobId);
      let job = await escrow.jobs(jobId);
      expect(job.status).to.equal(6); // Disputed

      // Resolve Dispute: Refund 100% to Client
      const initialClientBalance = await mockUSDC.balanceOf(buyer.address);
      await escrow.connect(evaluator).resolveDispute(jobId, 0); // 0 = Refund
      
      job = await escrow.jobs(jobId);
      expect(job.status).to.equal(4); // Rejected (Refunded)
      expect(await mockUSDC.balanceOf(buyer.address)).to.equal(initialClientBalance + budgetAmount);
    });

    it("Should release instantly via physical QR confirmation code", async function () {
      const expiredAt = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
      await escrow.connect(buyer).createJob(seller.address, evaluator.address, expiredAt, "Craigslist GPU", ethers.ZeroAddress);
      
      const jobId = 1;
      const budgetAmount = ethers.parseUnits("150", 6);
      await escrow.connect(seller).setBudget(jobId, budgetAmount, "0x");

      // Set QR hash: keccak256("SECRET_QR_CODE")
      const secretCode = "SECRET_QR_CODE";
      const qrHash = ethers.solidityPackedKeccak256(["string"], [secretCode]);
      await escrow.connect(buyer).setQrConfirmation(jobId, qrHash);

      await mockUSDC.connect(buyer).approve(await escrow.getAddress(), budgetAmount);
      await escrow.connect(buyer).fund(jobId, "0x");

      // Verify QR Code Release
      await escrow.connect(seller).qrRelease(jobId, secretCode);
      const job = await escrow.jobs(jobId);
      expect(job.status).to.equal(3); // Completed
      expect(await mockUSDC.balanceOf(seller.address)).to.equal(budgetAmount);
    });
  });

  describe("ArcGroupTreasury", function () {
    it("Should deposit and allow proposals and voting", async function () {
      // Add member
      await treasury.connect(owner).addMember(buyer.address);
      await treasury.connect(owner).addMember(otherMember.address);

      // Deposit
      const depositAmount = ethers.parseUnits("200", 6);
      await mockUSDC.connect(buyer).approve(await treasury.getAddress(), depositAmount);
      await treasury.connect(buyer).deposit(depositAmount);

      expect(await treasury.getBalance()).to.equal(depositAmount);

      // Propose spend
      const spendAmount = ethers.parseUnits("50", 6);
      await treasury.connect(buyer).proposeSpend(seller.address, spendAmount, "Pay Designer");
      const proposalId = 1;

      // Vote
      await treasury.connect(owner).vote(proposalId, true);
      await treasury.connect(otherMember).vote(proposalId, true);

      // Execute spend (majority of 3 members is 2, we have 2 votes)
      await treasury.connect(buyer).executeSpend(proposalId);

      expect(await mockUSDC.balanceOf(seller.address)).to.equal(spendAmount);
      expect(await treasury.getBalance()).to.equal(depositAmount - spendAmount);
    });

    it("Should allow direct spend under daily limit policy", async function () {
      await treasury.connect(owner).addMember(buyer.address);
      
      // Deposit
      const depositAmount = ethers.parseUnits("500", 6);
      await mockUSDC.connect(owner).approve(await treasury.getAddress(), depositAmount);
      await treasury.connect(owner).deposit(depositAmount);

      // Set policy: buyer has 10 USDC daily limit
      const dailyLimit = ethers.parseUnits("10", 6);
      await treasury.connect(owner).setSpendingPolicy(buyer.address, dailyLimit);

      // Direct Spend
      const spendAmount = ethers.parseUnits("8", 6);
      await treasury.connect(buyer).directSpend(seller.address, spendAmount);

      expect(await mockUSDC.balanceOf(seller.address)).to.equal(spendAmount);
      
      // Exceed Limit should revert
      const overSpend = ethers.parseUnits("5", 6);
      await expect(treasury.connect(buyer).directSpend(seller.address, overSpend))
        .to.be.revertedWith("Exceeds daily spending limit");
    });
  });
});
