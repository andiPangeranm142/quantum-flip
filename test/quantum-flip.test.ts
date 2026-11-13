/**
 * quantum-flip.test.ts - end-to-end tests for the QuantumFlip contract on a
 * local in-memory Ganache chain (plain EVM, no PQC window: the window is a
 * QoreChain admission rule, not contract logic).
 *
 * The accounts are Ganache's built-in deterministic test accounts. They are
 * public test keys that exist only on this throwaway local chain; they are
 * NEVER funded anywhere and must never be used on testnet or mainnet.
 *
 * Run: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import Ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { quantumFlipAbi, quantumFlipBytecode } from "../contracts/QuantumFlip.artifact.js";

/**
 * The well-known public test mnemonic (Hardhat's default). It funds NOTHING
 * outside this throwaway local chain: Ganache mints its local accounts from
 * it, and viem derives the same local signers from it, so transactions go
 * through viem's local-account path (with gas estimation) exactly like the
 * real deploy script does. Never use this mnemonic anywhere else.
 */
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

const localChain = defineChain({
  id: 1337,
  name: "Ganache Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

type Clients = ReturnType<typeof createClients>;

function createClients(provider: ReturnType<typeof Ganache.provider>) {
  const transport = custom(provider as never);
  return {
    public: createPublicClient({ chain: localChain, transport }),
    wallet: createWalletClient({ chain: localChain, transport }),
  };
}

describe("QuantumFlip artifact", () => {
  it("exposes the expected ABI entries and non-empty bytecode", () => {
    const names = new Set(
      quantumFlipAbi
        .filter((e): e is { type: string; name: string } => "name" in e)
        .map((e) => e.name),
    );
    for (const name of ["flip", "getStats", "playerCount", "players", "stats", "totalFlips", "totalWins", "FlipResult", "PlayerJoined"]) {
      assert.ok(names.has(name), `ABI is missing ${name}`);
    }
    assert.ok(quantumFlipBytecode.startsWith("0x"));
    assert.ok(quantumFlipBytecode.length > 100, "bytecode looks too short");
  });
});

describe("QuantumFlip contract", () => {
  let clients: Clients;
  let contract: Address;
  let player1: ReturnType<typeof mnemonicToAccount>;
  let player2: ReturnType<typeof mnemonicToAccount>;

  before(async () => {
    const provider = Ganache.provider({
      wallet: { mnemonic: TEST_MNEMONIC },
      logging: { quiet: true },
    });
    clients = createClients(provider);
    // Local signers derived from the same mnemonic Ganache uses, so the
    // test accounts hold the local chain's funds and viem estimates gas
    // (an address-only account would make viem skip estimation and rely on
    // the node's default gas limit, which is too low for a deployment).
    player1 = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
    player2 = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 1 });

    const hash = await clients.wallet.deployContract({
      abi: quantumFlipAbi,
      bytecode: quantumFlipBytecode as Hex,
      account: player1,
      chain: localChain,
    });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    assert.ok(receipt.contractAddress, "deployment receipt has no contract address");
    contract = receipt.contractAddress;
    assert.equal(receipt.status, "success");
  });

  after(async () => {
    await clients.public.transport.request({ method: "eth_chainId" }).catch(() => undefined);
  });

  it("starts empty", async () => {
    assert.equal(await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "totalFlips" }), 0n);
    assert.equal(await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "totalWins" }), 0n);
    assert.equal(await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "playerCount" }), 0n);
  });

  it("records the first flip with a consistent event and state", async () => {
    const hash = await clients.wallet.writeContract({
      address: contract,
      abi: quantumFlipAbi,
      functionName: "flip",
      args: [true],
      account: player1,
      chain: localChain,
    });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    const events = receipt.logs.map((log) => {
      try {
        return decodeEventLog({ abi: quantumFlipAbi, data: log.data, topics: log.topics });
      } catch {
        return null;
      }
    }).filter((e): e is NonNullable<typeof e> => e !== null);

    const joined = events.filter((e) => e.eventName === "PlayerJoined");
    assert.equal(joined.length, 1, "first flip must emit exactly one PlayerJoined");
    const flips = events.filter((e) => e.eventName === "FlipResult");
    assert.equal(flips.length, 1, "flip must emit exactly one FlipResult");

    const args = flips[0].args as unknown as {
      player: Address;
      guessHeads: boolean;
      resultHeads: boolean;
      won: boolean;
      flips: bigint;
      wins: bigint;
      currentStreak: bigint;
    };
    assert.equal(args.player.toLowerCase(), player1.address.toLowerCase());
    assert.equal(args.guessHeads, true);
    assert.equal(args.won, args.resultHeads === args.guessHeads, "won must match guess vs result");
    assert.equal(args.flips, 1n);
    assert.equal(args.wins, args.won ? 1n : 0n);
    assert.equal(args.currentStreak, args.won ? 1n : 0n);

    const stats = (await clients.public.readContract({
      address: contract,
      abi: quantumFlipAbi,
      functionName: "stats",
      args: [player1.address],
    })) as [bigint, bigint, bigint, bigint];
    assert.deepEqual(stats, [1n, args.wins, args.currentStreak, args.won ? 1n : 0n]);
    assert.equal(await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "playerCount" }), 1n);
  });

  it("tracks a second player independently", async () => {
    const hash = await clients.wallet.writeContract({
      address: contract,
      abi: quantumFlipAbi,
      functionName: "flip",
      args: [false],
      account: player2,
      chain: localChain,
    });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    assert.equal(await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "playerCount" }), 2n);

    const p1 = (await clients.public.readContract({
      address: contract, abi: quantumFlipAbi, functionName: "stats", args: [player1.address],
    })) as [bigint, bigint, bigint, bigint];
    assert.equal(p1[0], 1n, "player 1 flip count must be unchanged by player 2's flip");
    const p2 = (await clients.public.readContract({
      address: contract, abi: quantumFlipAbi, functionName: "stats", args: [player2.address],
    })) as [bigint, bigint, bigint, bigint];
    assert.equal(p2[0], 1n);

    const first = await clients.public.readContract({
      address: contract, abi: quantumFlipAbi, functionName: "players", args: [0n],
    });
    const second = await clients.public.readContract({
      address: contract, abi: quantumFlipAbi, functionName: "players", args: [1n],
    });
    assert.equal((first as string).toLowerCase(), player1.address.toLowerCase());
    assert.equal((second as string).toLowerCase(), player2.address.toLowerCase());
  });

  it("keeps totals and streaks consistent over many flips", async () => {
    for (let i = 0; i < 10; i++) {
      const hash = await clients.wallet.writeContract({
        address: contract,
        abi: quantumFlipAbi,
        functionName: "flip",
        args: [i % 2 === 0],
        account: player1,
        chain: localChain,
      });
      const receipt = await clients.public.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
    }

    const p1 = (await clients.public.readContract({
      address: contract, abi: quantumFlipAbi, functionName: "getStats", args: [player1.address],
    })) as unknown as { flips: bigint; wins: bigint; currentStreak: bigint; bestStreak: bigint };
    const p2 = (await clients.public.readContract({
      address: contract, abi: quantumFlipAbi, functionName: "getStats", args: [player2.address],
    })) as unknown as { flips: bigint; wins: bigint; currentStreak: bigint; bestStreak: bigint };
    const totalFlips = await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "totalFlips" });
    const totalWins = await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "totalWins" });

    assert.equal(p1.flips, 11n, "player 1: 1 + 10 flips");
    assert.equal(p2.flips, 1n);
    assert.equal(totalFlips, p1.flips + p2.flips, "totalFlips must equal the sum of player flips");
    assert.equal(totalWins, p1.wins + p2.wins, "totalWins must equal the sum of player wins");
    assert.ok(p1.wins <= p1.flips);
    assert.ok(p1.currentStreak <= p1.bestStreak, "current streak can never exceed best streak");
    assert.ok(p1.bestStreak <= p1.flips);
    assert.equal(await clients.public.readContract({ address: contract, abi: quantumFlipAbi, functionName: "playerCount" }), 2n, "no duplicate players");
  });
});
