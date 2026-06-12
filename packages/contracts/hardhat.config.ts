import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// Load packages/contracts/.env (DEPLOYER_PRIVATE_KEY, RPC, SNOWTRACE_API_KEY).
dotenv.config();

const FUJI_RPC =
  process.env.AVALANCHE_FUJI_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const SNOWTRACE_API_KEY = process.env.SNOWTRACE_API_KEY ?? "";

// Only attach an account if a key is configured, so `compile`/`test` work with no secrets.
const fujiAccounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    avalancheFuji: {
      url: FUJI_RPC,
      chainId: 43113,
      accounts: fujiAccounts,
    },
  },
  gasReporter: {
    // Always print the gas table for `hardhat test`; stay offline (no price API calls)
    // so figures are deterministic and the suite runs without external network.
    enabled: true,
    offline: true,
    currency: "USD",
  },
  etherscan: {
    // hardhat-verify uses the "etherscan" key; Fuji is verified via Routescan's
    // Etherscan-compatible endpoint (Snowtrace front-end).
    apiKey: {
      avalancheFuji: SNOWTRACE_API_KEY || "verifyContract",
    },
    customChains: [
      {
        network: "avalancheFuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://testnet.snowtrace.io",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};

export default config;
