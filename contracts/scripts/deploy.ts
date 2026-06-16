import { ethers } from "hardhat";

async function main() {
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  console.log("Starting deployment of ArcHandshake contracts...");

  // 1. Deploy ArcHandshakeEscrow
  console.log("Deploying ArcHandshakeEscrow...");
  const EscrowFactory = await ethers.getContractFactory("ArcHandshakeEscrow");
  const escrow = await EscrowFactory.deploy(USDC_ADDRESS);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`ArcHandshakeEscrow deployed to: ${escrowAddress}`);

  // 2. Deploy ArcGroupTreasury
  console.log("Deploying ArcGroupTreasury...");
  const TreasuryFactory = await ethers.getContractFactory("ArcGroupTreasury");
  const treasury = await TreasuryFactory.deploy(USDC_ADDRESS);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log(`ArcGroupTreasury deployed to: ${treasuryAddress}`);

  console.log("Deployment finished successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
