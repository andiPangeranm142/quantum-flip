/**
 * drill-flip.ts - play one flip on the deployed QuantumFlip contract from
 * the account in the env file (the Q-Day Drill account).
 *
 * Used to prove the drill account is one the project uses, and again on
 * drill day (18 Nov) for the "project still works" transaction whose hash
 * is submitted to the drill.
 *
 * Prerequisites: a registered ML-DSA-87 key and a live EVM authorisation
 * window for the account (run window.ts register/open with the same env
 * file first, and wait ~10 seconds after opening).
 *
 * Usage (testnet only):
 *   tsx --env-file=../.env.drill scripts/drill-flip.ts [heads|tails]
 *
 * Prints the EVM transaction hash, the Cosmos hash + explorer link, the
 * flip result and the new totals. Exits non-zero unless the receipt
 * shows success.
 */
import { createEvmClient, evmAccountFromPrivateKey, readContract, writeContract } from "@qorechain/evm";
import { decodeEventLog, keccak256, type Address, type Hex } from "viem";
import { createHash } from "node:crypto";

import { quantumFlipAbi } from "../contracts/QuantumFlip.artifact.js";

/** QoreChain testnet (qorechain-diana) EVM chain id. Nothing else is allowed. */
const TESTNET_CHAIN_ID = 9800;
/** The deployed QuantumFlip contract (testnet). */
const CONTRACT = "0x4a8de5795545fb081cb875e4ba8667290bb11c6f" as Address;
/** Testnet Cosmos REST (LCD) base URL, for resolving Cosmos transaction hashes. */
const TESTNET_REST = "https://api-testnet.qore.host";

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

/** The Cosmos transaction hash (uppercase hex, no 0x) wrapping an EVM hash. */
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
  const guess = (process.argv[2] ?? "heads").toLowerCase();
  if (guess !== "heads" && guess !== "tails") throw new Error('Usage: drill-flip.ts [heads|tails]');
  const evmRpc = process.env.QORE_EVM_RPC_URL ?? "http://localhost:8545";
  const privateKey = process.env.QORE_EVM_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) throw new Error("Missing required environment variable: QORE_EVM_PRIVATE_KEY");

  const client = await createEvmClient({ endpoints: { evmRpc } });
  const chainId = await client.getChainId();
  if (chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Refusing to flip: chain id is ${chainId}, expected testnet ${TESTNET_CHAIN_ID}.`);
  }
  const account = evmAccountFromPrivateKey(privateKey);
  const wallet = client.getWalletClient(account);
  console.log(`network:  QoreChain EVM testnet (chain id ${chainId})`);
  console.log(`player:   ${account.address}`);
  console.log(`contract: ${CONTRACT}`);

  const flipHash = await writeContract(wallet, {
    address: CONTRACT,
    abi: quantumFlipAbi,
    functionName: "flip",
    args: [guess === "heads"],
  });
  const receipt = await client.publicClient.waitForTransactionReceipt({ hash: flipHash });
  console.log(`flip tx:  ${flipHash}`);
  console.log(`status:   ${receipt.status}`);
  if (receipt.status !== "success") {
    console.error("Flip transaction failed on-chain.");
    process.exitCode = 1;
    return;
  }
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: quantumFlipAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "FlipResult") {
        const a = decoded.args as { guessHeads: boolean; resultHeads: boolean; won: boolean };
        console.log(`result:   called ${a.guessHeads ? "heads" : "tails"} → ${a.resultHeads ? "HEADS" : "TAILS"} (${a.won ? "won" : "lost"})`);
      }
    } catch {
      // Not a FlipResult log; ignore.
    }
  }
  const cosmos = await cosmosHashForEvmTx(client.publicClient, flipHash);
  console.log(`cosmos:   ${cosmos.cosmosHash} (block ${cosmos.block})`);
  console.log(`explorer: https://explore.qore.network/tx/${cosmos.cosmosHash}`);
  const totalFlips = await readContract(client.publicClient, {
    address: CONTRACT,
    abi: quantumFlipAbi,
    functionName: "totalFlips",
  });
  const totalWins = await readContract(client.publicClient, {
    address: CONTRACT,
    abi: quantumFlipAbi,
    functionName: "totalWins",
  });
  console.log(`totals:   ${totalFlips} flips, ${totalWins} wins`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
