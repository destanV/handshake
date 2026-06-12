import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount, mnemonicToAccount, type HDAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import type { RuntimeConfig } from "./types.js";
import { appendReport } from "./report.js";
import { requireMnemonic, requireTreasuryPrivateKey } from "./config.js";

export interface SeedWallet {
  index: number;
  path: string;
  account: HDAccount;
}

export function deriveSeedWallets(mnemonic: string, count: number): SeedWallet[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    path: `m/44'/60'/0'/0/${index}`,
    account: mnemonicToAccount(mnemonic, { accountIndex: index }),
  }));
}

export async function persistWalletMetadata(
  config: RuntimeConfig,
  wallets: SeedWallet[],
): Promise<void> {
  await mkdir(config.outputDir, { recursive: true });
  await writeFile(
    path.join(config.outputDir, "wallets.json"),
    JSON.stringify(
      wallets.map((wallet) => ({
        index: wallet.index,
        path: wallet.path,
        address: wallet.account.address,
      })),
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

export async function fundSeedWallets(config: RuntimeConfig, dryRun: boolean): Promise<void> {
  const mnemonic = requireMnemonic(config);
  const wallets = deriveSeedWallets(mnemonic, config.modelCount);
  await persistWalletMetadata(config, wallets);

  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(config.rpcUrl),
  });
  const minBalance = parseEther(config.minWalletBalanceAvax);
  const topUpAmount = parseEther(config.topUpAmountAvax);

  if (dryRun) {
    for (const wallet of wallets) {
      const balance = await publicClient.getBalance({ address: wallet.account.address });
      console.log(
        `wallet[${wallet.index}] ${wallet.account.address} balance=${formatEther(balance)} AVAX`,
      );
    }
    await appendReport(config, "fund.dry_run", { walletCount: wallets.length });
    return;
  }

  const treasury = privateKeyToAccount(requireTreasuryPrivateKey(config));
  const walletClient = createWalletClient({
    account: treasury,
    chain: avalancheFuji,
    transport: http(config.rpcUrl),
  });

  for (const wallet of wallets) {
    const balance = await publicClient.getBalance({ address: wallet.account.address });
    if (balance >= minBalance) {
      await appendReport(config, "fund.skip", {
        walletIndex: wallet.index,
        address: wallet.account.address,
        balance: formatEther(balance),
      });
      continue;
    }

    const hash = await walletClient.sendTransaction({
      to: wallet.account.address,
      value: topUpAmount,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await appendReport(config, "fund.tx", {
      walletIndex: wallet.index,
      address: wallet.account.address,
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      amount: config.topUpAmountAvax,
    });
    console.log(`funded wallet[${wallet.index}] ${wallet.account.address}: ${receipt.transactionHash}`);
  }
}
