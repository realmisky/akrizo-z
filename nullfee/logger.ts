import chalk from "chalk";

function ts(): string {
  const d = new Date();
  return chalk.gray(`[${d.toLocaleTimeString("en-GB", { hour12: false })}]`);
}

export const log = {
  info: (msg: string) => console.log(`${ts()} ${chalk.cyan("ℹ")} ${msg}`),
  ok:   (msg: string) => console.log(`${ts()} ${chalk.green("✔")} ${msg}`),
  warn: (msg: string) => console.log(`${ts()} ${chalk.yellow("⚠")} ${msg}`),
  err:  (msg: string) => console.log(`${ts()} ${chalk.red("✖")} ${msg}`),
  step: (msg: string) => console.log(`${ts()} ${chalk.magenta("▸")} ${msg}`),
  dim:  (msg: string) => console.log(`${ts()} ${chalk.gray(msg)}`),
  raw:  (msg: string) => console.log(msg),
};
