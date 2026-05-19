#!/usr/bin/env node
/**
 * NullFee CLI — interactive runner for crosschain testnet tasks.
 *
 * Usage:
 *   npm run nullfee
 *
 * Setup:
 *   cp nullfee/.env.example .env
 *   cp nullfee/nullfee.config.example.json nullfee.config.json
 *   # edit both, then run.
 */
import chalk from "chalk";
import { loadConfig, loadCredentials } from "./config";
import { HttpClient } from "./client";
import { ensureAuthed, login, clearToken } from "./auth";
import { log } from "./logger";
import {
  runSwapLoop,
  runMysteryBox,
  runDailySpin,
  getBalance,
} from "./tasks";

const BANNER =
  chalk.cyan(`
  ███╗   ██╗██╗   ██╗██╗     ██╗     ███████╗███████╗███████╗
  ████╗  ██║██║   ██║██║     ██║     ██╔════╝██╔════╝██╔════╝
  ██╔██╗ ██║██║   ██║██║     ██║     █████╗  █████╗  █████╗
  ██║╚██╗██║██║   ██║██║     ██║     ██╔══╝  ██╔══╝  ██╔══╝
  ██║ ╚████║╚██████╔╝███████╗███████╗██║     ███████╗███████╗
  ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚══════╝╚═╝     ╚══════╝╚══════╝`) +
  chalk.gray(`
        crosschain testnet auto-runner — akrizo-z
`);

async function main() {
  console.log(BANNER);

  const cfg   = loadConfig();
  const creds = loadCredentials();
  const client = new HttpClient(cfg);

  log.info(`API base: ${cfg.apiBase}`);
  log.info(`Account:  ${creds.email}`);

  await ensureAuthed(cfg, creds, client);

  // dynamic import: inquirer v9+ is ESM only, must be loaded async from CJS
  const inquirerMod: any = await import("inquirer");
  const inquirer = inquirerMod.default ?? inquirerMod;

  // friendly: show balance once on start
  try {
    const { raw, value } = await getBalance(cfg, client);
    if (value != null) log.info(`Current balance: ${value}`);
    else if (raw)      log.dim(`Balance response: ${JSON.stringify(raw).slice(0, 200)}`);
  } catch (e: any) {
    log.warn(`Could not fetch balance: ${e.message}`);
  }

  while (true) {
    console.log("");
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: chalk.bold("Mau ngapain?"),
        choices: [
          { name: "🔁  Auto Swap loop (random pair, sampai saldo abis)", value: "swap" },
          { name: "🎁  Buka Daily Mystery Box",                          value: "box" },
          { name: "🎰  Daily Spin",                                       value: "spin" },
          { name: "🚀  Run All (Box → Spin → Swap loop)",                 value: "all" },
          { name: "💰  Cek saldo",                                        value: "balance" },
          { name: "🔄  Re-login (hapus token cache)",                     value: "relogin" },
          new inquirer.Separator(),
          { name: "❌  Keluar",                                           value: "exit" },
        ],
      },
    ]);

    try {
      switch (action) {
        case "swap":
          await runSwapLoop(cfg, client);
          break;
        case "box":
          await runMysteryBox(cfg, client);
          break;
        case "spin":
          await runDailySpin(cfg, client);
          break;
        case "all":
          await runMysteryBox(cfg, client);
          await runDailySpin(cfg, client);
          await runSwapLoop(cfg, client);
          break;
        case "balance": {
          const b = await getBalance(cfg, client);
          if (b.value != null) log.info(`Balance: ${b.value}`);
          else if (b.raw)      log.dim(`Raw: ${JSON.stringify(b.raw)}`);
          else                 log.warn("Balance endpoint not configured.");
          break;
        }
        case "relogin":
          clearToken(creds);
          await login(cfg, creds, client);
          break;
        case "exit":
          log.info("Sampai jumpa! 👋");
          return;
      }
    } catch (e: any) {
      log.err(`Task error: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
