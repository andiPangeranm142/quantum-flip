/**
 * deploy.ts - deploy the QuantumFlip contract to the QoreChain EVM Engine
 * (testnet qorechain-diana, chain id 9800) and play one demo flip.
 *
 * Uses @qorechain/evm:
 *   - createEvmClient({ endpoints })  → a viem-backed client (chain id auto-detected)
 *   - deployContract(walletClient, …) → deploy and get the tx hash
 *   - readContract / writeContract    → typed reads and writes
 *
 * Prerequisites (see README):
 *   - QORE_EVM_RPC_URL pointing at the testnet EVM JSON-RPC endpoint.
 *   - QORE_EVM_PRIVATE_KEY for a funded testnet EVM account (0x-prefixed,
 *     32 bytes). It must be the SAME account as QORE_MNEMONIC (used by
 *     scripts/window.ts), derived at m/44'/60'/0'/0/0.
 *   - A registered ML-DSA-87 key and a live EVM authorisation window for
 *     that account: run `npm run window register` once, then
 *     `npm run window open`, and wait ~10 seconds before deploying.
 *
 * Safety: this script REFUSES to run on any chain other than the testnet
 * (chain id 9800). Quantum Flip is a testnet-only project.
 *
 * On success it writes deployments/testnet.json with the contract address
 * and the transaction hashes, so the frontend and the README can point at
 * the live deployment.
 */
import {
  createEvmClient,
  deployContract,
  evmAccountFromPrivateKey,
  readContract,
  writeContract,
} from "@qorechain/evm";
import { decodeEventLog, keccak256, type Address, type Hex } from "viem";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quantumFlipAbi, quantumFlipBytecode } from "../contracts/QuantumFlip.artifact.js";

/** QoreChain testnet (qorechain-diana) EVM chain id. Nothing else is allowed. */
const TESTNET_CHAIN_ID = 9800;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Testnet Cosmos REST (LCD) base URL, for resolving Cosmos transaction hashes. */
const TESTNET_REST = "https://api-testnet.qore.host";

/** Minimal protobuf field reader (for TxRaw -> MsgEthereumTx matching). */
function readVarint(buf: Buffer, off: number): [bigint, number] {
  let v = 0n;
  let s = 0n;
  for (;;) {
    const b = buf[off++] as number;
    v |= BigInt(b & 0x7f) << s;
    if (!(b & 0x80)) break;
    s += 7n;
  }
  return [v, off];
}

function pbFields(buf: Buffer): Array<[number, Buffer]> {
  const out: Array<[number, Buffer]> = [];
  let off = 0;
  while (off < buf.length) {
    const [tag, o1] = readVarint(buf, off);
    off = o1;
    const num = Number(tag >> 3n);
    const wt = Number(tag & 7n);
    if (wt === 2) {
      const [len, o2] = readVarint(buf, off);
      off = o2;
      out.push([num, buf.subarray(off, off + Number(len))]);
      off += Number(len);
    } else if (wt === 0) {
      const [, o2] = readVarint(buf, off);
      off = o2;
    } else if (wt === 5) {
      off += 4;
    } else if (wt === 1) {
      off += 8;
    } else {
      throw new Error(`bad protobuf wire type ${wt}`);
    }
  }
  return out;
}

type ReceiptReader = {
  getTransactionReceipt: (args: { hash: Hex }) => Promise<{ blockNumber: bigint }>;
};

/**
 * The Cosmos transaction hash (uppercase hex, no 0x) wrapping an EVM
 * transaction hash. The explorer's /tx/ route only resolves Cosmos
 * hashes, so EVM hashes must be translated this way before linking:
 * take the receipt's block, then find the MsgEthereumTx whose embedded
 * raw transaction hashes (keccak256) to the EVM hash.
 */
async function cosmosHashForEvmTx(
  publicClient: ReceiptReader,
  evmHash: Hex,
): Promise<{ cosmosHash: string; block: number }> {
  const receipt = await publicClient.getTransactionReceipt({ hash: evmHash });
  const height = Number(receipt.blockNumber);
  const res = await fetch(`${TESTNET_REST}/cosmos/base/tendermint/v1beta1/blocks/${height}`);
  if (!res.ok) throw new Error(`block ${height} query failed: HTTP ${res.status}`);
  const block = (await res.json()) as { block: { data: { txs: string[] } } };
  for (const txb64 of block.block.data.txs) {
    const raw = Buffer.from(txb64, "base64");
    const body = pbFields(raw).find(([n]) => n === 1)?.[1];
    if (!body) continue;
    for (const [, anyMsg] of pbFields(body).filter(([n]) => n === 1)) {
      const f = pbFields(anyMsg);
      const typeUrl = f.find(([n]) => n === 1)?.[1]?.toString() ?? "";
      if (!typeUrl.endsWith("MsgEthereumTx")) continue;
      const value = f.find(([n]) => n === 2)?.[1];
      if (!value) continue;
      const data = pbFields(value).find(([n]) => n === 6)?.[1];
      if (data && keccak256(data).toLowerCase() === evmHash.toLowerCase()) {
        return {
          cosmosHash: createHash("sha256").update(raw).digest("hex").toUpperCase(),
          block: height,
        };
      }
    }
  }
  throw new Error(`no Cosmos tx found for EVM hash ${evmHash} in block ${height}`);
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

  // Deploy.
  console.log(`\nDeploying QuantumFlip…`);
  const deployHash = await deployContract(wallet, {
    abi: quantumFlipAbi,
    bytecode: quantumFlipBytecode,
    args: [],
  });
  const receipt = await client.publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  const contract = receipt.contractAddress;
  if (!contract) {
    throw new Error("Deployment receipt did not include a contract address.");
  }
  console.log(`deployed: ${contract}`);
  console.log(`deploy tx: ${deployHash}`);
  const deployCosmos = await cosmosHashForEvmTx(client.publicClient, deployHash);
  console.log(`explorer: https://explore.qore.network/tx/${deployCosmos.cosmosHash} (switch the explorer to Testnet)`);

  // Play one demo flip: call heads.
  console.log("\nPlaying one demo flip (calling heads)…");
  const flipHash = await writeContract(wallet, {
    address: contract as Address,
    abi: quantumFlipAbi,
    functionName: "flip",
    args: [true],
    account: wallet.account ?? null,
    chain: wallet.chain,
  });
  const flipReceipt = await client.publicClient.waitForTransactionReceipt({ hash: flipHash });
  console.log(`flip tx:  ${flipHash}`);
  const flipCosmos = await cosmosHashForEvmTx(client.publicClient, flipHash);
  console.log(`explorer: https://explore.qore.network/tx/${flipCosmos.cosmosHash} (switch the explorer to Testnet)`);

  // Decode the FlipResult event from the receipt.
  for (const log of flipReceipt.logs) {
    try {
      const event = decodeEventLog({
        abi: quantumFlipAbi,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName === "FlipResult") {
        const a = event.args as unknown as {
          guessHeads: boolean;
          resultHeads: boolean;
          won: boolean;
          flips: bigint;
          wins: bigint;
          currentStreak: bigint;
        };
        console.log(
          `result:   ${a.resultHeads ? "HEADS" : "TAILS"} (guessed ${a.guessHeads ? "heads" : "tails"}) — ${a.won ? "WON" : "lost"}`,
        );
      }
    } catch {
      // Not a QuantumFlip event; ignore.
    }
  }

  // Read back the totals.
  const totalFlips = await readContract(client.publicClient, {
    address: contract as Address,
    abi: quantumFlipAbi,
    functionName: "totalFlips",
  });
  const totalWins = await readContract(client.publicClient, {
    address: contract as Address,
    abi: quantumFlipAbi,
    functionName: "totalWins",
  });
  console.log(`\ntotalFlips: ${totalFlips}`);
  console.log(`totalWins:  ${totalWins}`);

  // Record the deployment for the frontend and the README.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(dir, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const deployment = {
    network: "qorechain-diana",
    chainId: 9800,
    contract: contract as Address,
    deployer: account.address,
    deployTx: deployHash,
    demoFlipTx: flipHash,
    deployTxCosmos: deployCosmos.cosmosHash,
    demoFlipTxCosmos: flipCosmos.cosmosHash,
    explorerContract: `https://explore.qore.network/address/${contract}`,
    explorerDeployTx: `https://explore.qore.network/tx/${deployCosmos.cosmosHash}`,
    explorerDemoFlipTx: `https://explore.qore.network/tx/${flipCosmos.cosmosHash}`,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "testnet.json"),
    JSON.stringify(deployment, null, 2) + "\n",
  );
  console.log("\nWrote deployments/testnet.json");
  console.log("Done.");
}

main().catch((err: unknown) => {
  console.error("\nDeploy failed.");
  console.error(
    "Check QORE_EVM_RPC_URL is reachable, QORE_EVM_PRIVATE_KEY funds an account, " +
      "and a live EVM authorisation window is open (`npm run window status`).",
  );
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
