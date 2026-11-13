/**
 * drill-fund.ts - fund the Q-Day Drill testnet account from the deployer.
 *
 * Sends native QOR (uqor) from the account in .env (the deployer) to the
 * drill account, so it can register its ML-DSA-87 key, open EVM windows
 * and play flips. Hybrid-signed like any other native transaction from
 * the deployer.
 *
 * Usage (testnet only):
 *   tsx --env-file=.env scripts/drill-fund.ts <cosmos-address> <amount-uqor>
 *
 * Example: 2 QOR = 2000000 uqor.
 * Prints the transaction hash and the deliver code; exits non-zero unless
 * the transaction was accepted (code 0).
 */
import { StargateClient } from "@cosmjs/stargate";
import { EthNativeSigner, deriveUnifiedAccount } from "@qorechain/sdk";

const REST = "https://api-testnet.qore.host";
const RPC = "https://rpc-testnet.qore.host";
const CHAIN_ID = "qorechain-diana";

/** Same native-lane fee as scripts/window.ts (~0.1 QOR). */
const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

async function accountSequence(address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${address}`);
    if (res.ok) {
      const body = (await res.json()) as { account?: Record<string, unknown> };
      const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
      return { accountNumber: BigInt(acc.account_number ?? "0"), sequence: BigInt(acc.sequence ?? "0") };
    }
    lastStatus = res.status;
    lastBody = (await res.text()).slice(0, 200);
    console.error(`account query attempt ${attempt}: HTTP ${lastStatus} ${lastBody}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`account query failed: HTTP ${lastStatus} ${lastBody}`);
}

async function main(): Promise<void> {
  const network = process.env.QORE_NETWORK ?? "testnet";
  if (network !== "testnet") throw new Error(`Refusing to run on network "${network}": this script is testnet-only.`);
  const to = process.argv[2]?.trim();
  const amount = process.argv[3]?.trim();
  if (!to || !/^qor1[0-9a-z]{38}$/.test(to)) throw new Error('Usage: drill-fund.ts <qor1... address> <amount-uqor>');
  if (!amount || !/^[0-9]+$/.test(amount)) throw new Error('Usage: drill-fund.ts <qor1... address> <amount-uqor>');
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("Set QORE_MNEMONIC in .env");

  const acc = await deriveUnifiedAccount(mnemonic, 0);
  console.log(`from: ${acc.evm} (${acc.cosmos})`);
  console.log(`to:   ${to} (${(Number(amount) / 1_000_000).toFixed(6)} QOR)`);
  const { accountNumber, sequence } = await accountSequence(acc.cosmos);
  const signer = new EthNativeSigner(acc, { signMode: "hybrid", rest: REST });
  const transport = await StargateClient.connect(RPC);
  try {
    const res = await signer.bankSend(transport, to, [{ denom: "uqor", amount }], {
      chainId: CHAIN_ID,
      accountNumber,
      sequence,
      fee: FEE,
      memo: "quantum-flip drill account funding",
    });
    console.log(`fund tx: ${res.transactionHash}`);
    console.log(`code: ${res.code}`);
    if (res.code !== 0) {
      console.error("Transaction was NOT accepted (code != 0).");
      process.exitCode = 1;
    }
  } finally {
    transport.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
