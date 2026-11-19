/**
 * streak-badge.test.ts - end-to-end tests for the StreakBadge companion
 * contract on a local in-memory Ganache chain (plain EVM, no PQC window:
 * the window is a QoreChain admission rule, not contract logic).
 *
 * StreakBadge reads eligibility from the real QuantumFlip contract
 * (`getStats(player).bestStreak`), so the tests deploy BOTH contracts and
 * play real flips to build streaks. Flip outcomes on Ganache come from
 * real block hashes, so they are effectively random: the tests flip until
 * a streak target is reached (bounded loops), rather than assuming any
 * particular outcome.
 *
 * The accounts are Ganache's built-in deterministic test accounts. They are
 * public test keys that exist only on this throwaway local chain; they are
 * NEVER funded anywhere and must never be used on testnet or mainnet.
 *
 * Run: npm test
 */
import { before, describe, it } from "node:test";
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
import { streakBadgeAbi, streakBadgeBytecode } from "../contracts/StreakBadge.artifact.js";

/**
 * The well-known public test mnemonic (Hardhat's default). It funds NOTHING
 * outside this throwaway local chain: Ganache mints its local accounts from
 * it, and viem derives the same local signers from it. Never use this
 * mnemonic anywhere else.
 */
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

const localChain = defineChain({
  id: 1337,
  name: "Ganache Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

type Clients = ReturnType<typeof createClients>;
type Account = ReturnType<typeof mnemonicToAccount>;

function createClients(provider: ReturnType<typeof Ganache.provider>) {
  const transport = custom(provider as never);
  return {
    public: createPublicClient({ chain: localChain, transport }),
    wallet: createWalletClient({ chain: localChain, transport }),
  };
}

describe("StreakBadge artifact", () => {
  it("exposes the expected ABI entries and non-empty bytecode", () => {
    const names = new Set(
      streakBadgeAbi
        .filter((e): e is { type: string; name: string } => "name" in e)
        .map((e) => e.name),
    );
    for (const name of ["claim", "badgesOf", "eligibleTiers", "tierCount", "tiers", "hasBadge", "issuedCount", "totalIssued", "quantumFlip", "BadgeIssued"]) {
      assert.ok(names.has(name), `ABI is missing ${name}`);
    }
    assert.ok(streakBadgeBytecode.startsWith("0x"));
    assert.ok(streakBadgeBytecode.length > 100, "bytecode looks too short");
  });
});

describe("StreakBadge contract", () => {
  let clients: Clients;
  let flip: Address;
  let badge: Address;
  let player1: Account;
  let player2: Account;

  async function bestStreakOf(player: Address): Promise<bigint> {
    const stats = (await clients.public.readContract({
      address: flip,
      abi: quantumFlipAbi,
      functionName: "getStats",
      args: [player],
    })) as unknown as { bestStreak: bigint };
    return stats.bestStreak;
  }

  async function flipOnce(player: Account, guessHeads: boolean): Promise<void> {
    const hash = await clients.wallet.writeContract({
      address: flip,
      abi: quantumFlipAbi,
      functionName: "flip",
      args: [guessHeads],
      account: player,
      chain: localChain,
    });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
  }

  /** Flip until `player` reaches a best streak of at least `target`. */
  async function flipUntilStreak(player: Account, target: bigint): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if ((await bestStreakOf(player.address)) >= target) return;
      await flipOnce(player, i % 2 === 0);
    }
    throw new Error(`player ${player.address} never reached bestStreak ${target} in 200 flips`);
  }

  before(async () => {
    const provider = Ganache.provider({
      wallet: { mnemonic: TEST_MNEMONIC },
      logging: { quiet: true },
    });
    clients = createClients(provider);
    player1 = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
    player2 = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 1 });

    const flipHash = await clients.wallet.deployContract({
      abi: quantumFlipAbi,
      bytecode: quantumFlipBytecode as Hex,
      account: player1,
      chain: localChain,
    });
    const flipReceipt = await clients.public.waitForTransactionReceipt({ hash: flipHash });
    assert.ok(flipReceipt.contractAddress, "flip deployment receipt has no contract address");
    assert.equal(flipReceipt.status, "success");
    flip = flipReceipt.contractAddress;

    const badgeHash = await clients.wallet.deployContract({
      abi: streakBadgeAbi,
      bytecode: streakBadgeBytecode as Hex,
      args: [flip],
      account: player1,
      chain: localChain,
    });
    const badgeReceipt = await clients.public.waitForTransactionReceipt({ hash: badgeHash });
    assert.ok(badgeReceipt.contractAddress, "badge deployment receipt has no contract address");
    assert.equal(badgeReceipt.status, "success");
    badge = badgeReceipt.contractAddress;
  });

  it("starts with three tiers, zero badges, and the flip contract linked", async () => {
    assert.equal(
      await clients.public.readContract({ address: badge, abi: streakBadgeAbi, functionName: "tierCount" }),
      3n,
    );
    const tier0 = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "tiers", args: [0n],
    })) as unknown as [string, bigint];
    const tier1 = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "tiers", args: [1n],
    })) as unknown as [string, bigint];
    const tier2 = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "tiers", args: [2n],
    })) as unknown as [string, bigint];
    assert.deepEqual(tier0, ["Double Up", 2n]);
    assert.deepEqual(tier1, ["Hat Trick", 3n]);
    assert.deepEqual(tier2, ["Hot Streak", 5n]);
    assert.equal(
      await clients.public.readContract({ address: badge, abi: streakBadgeAbi, functionName: "totalIssued" }),
      0n,
    );
    const linked = await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "quantumFlip",
    });
    assert.equal((linked as string).toLowerCase(), flip.toLowerCase());
  });

  it("reports no eligibility and no badges for a player with no flips", async () => {
    const eligible = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "eligibleTiers", args: [player1.address],
    })) as boolean[];
    assert.deepEqual(eligible, [false, false, false]);
    const held = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "badgesOf", args: [player1.address],
    })) as boolean[];
    assert.deepEqual(held, [false, false, false]);
  });

  it("rejects a claim from a player whose best streak is too low", async () => {
    await assert.rejects(
      clients.wallet.writeContract({
        address: badge,
        abi: streakBadgeAbi,
        functionName: "claim",
        args: [0],
        account: player1,
        chain: localChain,
      }),
      /revert/i,
      "claiming with bestStreak 0 must revert",
    );
    assert.equal(
      await clients.public.readContract({ address: badge, abi: streakBadgeAbi, functionName: "totalIssued" }),
      0n,
      "a reverted claim must not issue a badge",
    );
  });

  it("issues the Double Up badge once bestStreak reaches 2", async () => {
    await flipUntilStreak(player1, 2n);
    assert.ok((await bestStreakOf(player1.address)) >= 2n);

    const eligible = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "eligibleTiers", args: [player1.address],
    })) as boolean[];
    assert.equal(eligible[0], true, "tier 0 must be eligible at bestStreak >= 2");

    const hash = await clients.wallet.writeContract({
      address: badge,
      abi: streakBadgeAbi,
      functionName: "claim",
      args: [0],
      account: player1,
      chain: localChain,
    });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    const events = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: streakBadgeAbi, data: log.data, topics: log.topics });
        } catch {
          return null;
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .filter((e) => e.eventName === "BadgeIssued");
    assert.equal(events.length, 1, "claim must emit exactly one BadgeIssued");
    const args = events[0].args as unknown as { player: Address; tierId: bigint; bestStreak: bigint };
    assert.equal(args.player.toLowerCase(), player1.address.toLowerCase());
    assert.equal(args.tierId, 0n);
    assert.ok(args.bestStreak >= 2n);

    assert.equal(
      await clients.public.readContract({
        address: badge, abi: streakBadgeAbi, functionName: "hasBadge", args: [player1.address, 0n],
      }),
      true,
    );
    const held = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "badgesOf", args: [player1.address],
    })) as boolean[];
    assert.deepEqual(held, [true, false, false]);
    assert.equal(
      await clients.public.readContract({
        address: badge, abi: streakBadgeAbi, functionName: "issuedCount", args: [0n],
      }),
      1n,
    );
    assert.equal(
      await clients.public.readContract({ address: badge, abi: streakBadgeAbi, functionName: "totalIssued" }),
      1n,
    );
  });

  it("rejects a double claim of the same tier", async () => {
    await assert.rejects(
      clients.wallet.writeContract({
        address: badge,
        abi: streakBadgeAbi,
        functionName: "claim",
        args: [0],
        account: player1,
        chain: localChain,
      }),
      /revert/i,
      "claiming an already-held badge must revert",
    );
    assert.equal(
      await clients.public.readContract({ address: badge, abi: streakBadgeAbi, functionName: "totalIssued" }),
      1n,
      "a reverted double claim must not change totalIssued",
    );
  });

  it("rejects an unknown tier", async () => {
    for (const badTier of [3, 255]) {
      await assert.rejects(
        clients.wallet.writeContract({
          address: badge,
          abi: streakBadgeAbi,
          functionName: "claim",
          args: [badTier],
          account: player1,
          chain: localChain,
        }),
        /revert/i,
        `claiming tier ${badTier} must revert`,
      );
    }
  });

  it("tracks tiers independently per player", async () => {
    await flipUntilStreak(player2, 3n);
    const eligible = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "eligibleTiers", args: [player2.address],
    })) as boolean[];
    assert.deepEqual(eligible, [true, true, false], "bestStreak 3 unlocks tiers 0 and 1 only");

    // Claiming tier 1 directly, without tier 0: tiers are independent.
    const hash = await clients.wallet.writeContract({
      address: badge,
      abi: streakBadgeAbi,
      functionName: "claim",
      args: [1],
      account: player2,
      chain: localChain,
    });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    const p2Held = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "badgesOf", args: [player2.address],
    })) as boolean[];
    assert.deepEqual(p2Held, [false, true, false]);
    const p1Held = (await clients.public.readContract({
      address: badge, abi: streakBadgeAbi, functionName: "badgesOf", args: [player1.address],
    })) as boolean[];
    assert.deepEqual(p1Held, [true, false, false], "player 1 badges must be untouched by player 2's claim");
    assert.equal(
      await clients.public.readContract({ address: badge, abi: streakBadgeAbi, functionName: "totalIssued" }),
      2n,
    );
    assert.equal(
      await clients.public.readContract({
        address: badge, abi: streakBadgeAbi, functionName: "issuedCount", args: [1n],
      }),
      1n,
    );
  });

  it("refuses deployment with a zero flip address", async () => {
    await assert.rejects(
      clients.wallet.deployContract({
        abi: streakBadgeAbi,
        bytecode: streakBadgeBytecode as Hex,
        args: ["0x0000000000000000000000000000000000000000"],
        account: player1,
        chain: localChain,
      }),
      /revert/i,
      "deploying with the zero address must revert",
    );
  });
});
