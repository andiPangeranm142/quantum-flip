/**
 * deploy-streak-badge.ts - deploy the StreakBadge companion contract to the
 * QoreChain EVM Engine (testnet qorechain-diana, chain id 9800) and claim
 * one real badge for the deployer, whose bestStreak in the QuantumFlip
 * contract already qualifies.
 *
 * The QuantumFlip contract itself is NEVER modified or redeployed:
 * StreakBadge is a separate contract that reads flip data on-chain via
 * `QuantumFlip.getStats(player).bestStreak` at claim time.
 *
 * Prerequisites (see README):
 *   - QORE_EVM_RPC_URL pointing at the testnet EVM JSON-RPC endpoint.
 *   - QORE_EVM_PRIVATE_KEY for the funded testnet EVM account (0x-prefixed,
 *     32 bytes). It must be the SAME account as QORE_MNEMONIC (used by
 *     scripts/window.ts).
 *   - A registered ML-DSA-87 key and a live EVM authorisation window for
 *     that account: run `npm run window register` once, then
 *     `npm run window open`, and wait ~10 seconds before deploying.
 *
 * Safety: this script REFUSES to run on any chain other than the testnet
 * (chain id 9800). Quantum Flip is a testnet-only project.
 *
 * On success it writes deployments/streak-badge-testnet.json with the
 * contract address and the transaction hashes, and verifies the badge
 * state on-chain afterwards (receipt status + hasBadge/totalIssued reads).
 */
import {
  createEvmClient,
  deployContract,
  evmAccountFromPrivateKey,
  readContract,
  writeContract,
} from "@qorechain/evm";
import { decodeEventLog, type Address, type Hex } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quantumFlipAbi } from "../contracts/QuantumFlip.artifact.js";
import { streakBadgeAbi, streakBadgeBytecode } from "../contracts/StreakBadge.artifact.js";

/** QoreChain testnet (qorechain-diana) EVM chain id. Nothing else is allowed. */
const TESTNET_CHAIN_ID = 9800;

/** The live QuantumFlip contract on the Diana testnet. Never redeployed. */
const QUANTUM_FLIP_ADDRESS = "0x4a8de5795545fb081cb875e4ba8667290bb11c6f" as Address;

/** Tier 0 = "Double Up", needs bestStreak >= 2. */
const DEMO_TIER_ID = 0;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const evmRpc = process.env.QORE_EVM_RPC_URL ?? "http://localhost:8545";
  const privateKey = requireEnv("QORE_EVM_PRIVATE_KEY") as Hex;

  const client = await createEvmClient({ endpoints: { evmRpc } });
  const chainId = await client.getChainId();
  if (chainId !== TESTNET_CHAIN_ID) {
    throw new Error(
      `Refusing to deploy: chain id is ${chainId}, expected testnet ${TESTNET_CHAIN_ID}. ` +
        `Check QORE_EVM_RPC_URL (testnet: https://evm-testnet.qore.host).`,
    );
  }
  const account = evmAccountFromPrivateKey(privateKey);
  const wallet = client.getWalletClient(account);

  console.log(`network:  QoreChain EVM testnet (chain id ${chainId})`);
  console.log(`deployer: ${account.address}`);
  console.log(`flip:     ${QUANTUM_FLIP_ADDRESS}`);

  // Read the deployer's REAL flip stats first: the demo claim must be based
  // on real on-chain data, not assumed.
  const stats = (await readContract(client.publicClient, {
    address: QUANTUM_FLIP_ADDRESS,
    abi: quantumFlipAbi,
    functionName: "getStats",
    args: [account.address],
  })) as unknown as { flips: bigint; wins: bigint; currentStreak: bigint; bestStreak: bigint };
  console.log(
    `\ndeployer flip stats: ${stats.flips} flips, ${stats.wins} wins, ` +
      `currentStreak ${stats.currentStreak}, bestStreak ${stats.bestStreak}`,
  );
  if (stats.bestStreak < 2n) {
    throw new Error(
      `Deployer bestStreak is ${stats.bestStreak}: too low for the tier-0 demo claim (needs >= 2).`,
    );
  }

  // Deploy StreakBadge, pointing at the live flip contract.
  console.log(`\nDeploying StreakBadge…`);
  const deployHash = await deployContract(wallet, {
    abi: streakBadgeAbi,
    bytecode: streakBadgeBytecode,
    args: [QUANTUM_FLIP_ADDRESS],
  });
  const receipt = await client.publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  const badgeContract = receipt.contractAddress;
  if (!badgeContract) {
    throw new Error("Deployment receipt did not include a contract address.");
  }
  if (receipt.status !== "success") {
    throw new Error(`Deployment transaction reverted (status ${receipt.status}).`);
  }
  console.log(`deployed: ${badgeContract}`);
  console.log(`deploy tx: ${deployHash}`);
  console.log(`deploy block: ${receipt.blockNumber}`);

  // Verify the deployment on-chain: the badge contract must point at the
  // real flip contract and expose the three tiers.
  const linkedFlip = (await readContract(client.publicClient, {
    address: badgeContract as Address,
    abi: streakBadgeAbi,
    functionName: "quantumFlip",
  })) as Address;
  if (linkedFlip.toLowerCase() !== QUANTUM_FLIP_ADDRESS.toLowerCase()) {
    throw new Error(`StreakBadge points at ${linkedFlip}, not the flip contract.`);
  }
  const tierCount = (await readContract(client.publicClient, {
    address: badgeContract as Address,
    abi: streakBadgeAbi,
    functionName: "tierCount",
  })) as bigint;
  if (tierCount !== 3n) {
    throw new Error(`Expected 3 badge tiers, got ${tierCount}.`);
  }
  console.log(`verified: quantumFlip=${linkedFlip}, tierCount=${tierCount}`);

  // Claim the tier-0 badge for the deployer, based on the real bestStreak.
  console.log(`\nClaiming tier ${DEMO_TIER_ID} ("Double Up") for the deployer…`);
  const claimHash = await writeContract(wallet, {
    address: badgeContract as Address,
    abi: streakBadgeAbi,
    functionName: "claim",
    args: [DEMO_TIER_ID],
    account: wallet.account ?? null,
    chain: wallet.chain,
  });
  const claimReceipt = await client.publicClient.waitForTransactionReceipt({ hash: claimHash });
  if (claimReceipt.status !== "success") {
    throw new Error(`Badge claim transaction reverted (status ${claimReceipt.status}).`);
  }
  console.log(`claim tx: ${claimHash}`);
  console.log(`claim block: ${claimReceipt.blockNumber}`);

  // Decode the BadgeIssued event from the receipt.
  for (const log of claimReceipt.logs) {
    try {
      const event = decodeEventLog({
        abi: streakBadgeAbi,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName === "BadgeIssued") {
        const a = event.args as unknown as {
          player: Address;
          tierId: bigint;
          bestStreak: bigint;
        };
        console.log(
          `event:    BadgeIssued(player=${a.player}, tierId=${a.tierId}, bestStreak=${a.bestStreak})`,
        );
      }
    } catch {
      // Not a StreakBadge event; ignore.
    }
  }

  // Verify the badge state on-chain afterwards — never trust the tx alone.
  const hasBadge = (await readContract(client.publicClient, {
    address: badgeContract as Address,
    abi: streakBadgeAbi,
    functionName: "hasBadge",
    args: [account.address, BigInt(DEMO_TIER_ID)],
  })) as boolean;
  const totalIssued = (await readContract(client.publicClient, {
    address: badgeContract as Address,
    abi: streakBadgeAbi,
    functionName: "totalIssued",
  })) as bigint;
  const badges = (await readContract(client.publicClient, {
    address: badgeContract as Address,
    abi: streakBadgeAbi,
    functionName: "badgesOf",
    args: [account.address],
  })) as boolean[];
  console.log(`\nverified on-chain: hasBadge(deployer, 0)=${hasBadge}, totalIssued=${totalIssued}, badgesOf(deployer)=[${badges.join(", ")}]`);
  if (!hasBadge || totalIssued !== 1n) {
    throw new Error("Post-claim verification failed: badge state does not match the claim.");
  }

  // Record the deployment for the frontend and the README.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(dir, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const deployment = {
    network: "qorechain-diana",
    chainId: 9800,
    contract: badgeContract as Address,
    flipContract: QUANTUM_FLIP_ADDRESS,
    deployer: account.address,
    deployTx: deployHash,
    deployBlock: receipt.blockNumber.toString(),
    demoClaimTx: claimHash,
    demoClaimBlock: claimReceipt.blockNumber.toString(),
    demoClaimRecipient: account.address,
    demoClaimTierId: DEMO_TIER_ID,
    demoClaimTierName: "Double Up",
    deployerBestStreakAtClaim: stats.bestStreak.toString(),
    explorerContract: `https://explore.qore.network/address/${badgeContract}`,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "streak-badge-testnet.json"),
    JSON.stringify(deployment, null, 2) + "\n",
  );
  console.log("\nWrote deployments/streak-badge-testnet.json");
  console.log("Done.");
}

main().catch((err: unknown) => {
  console.error("\nStreakBadge deploy failed.");
  console.error(
    "Check QORE_EVM_RPC_URL is reachable, QORE_EVM_PRIVATE_KEY funds an account, " +
      "and a live EVM authorisation window is open (`npm run window status`).",
  );
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
