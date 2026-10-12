import { appendFileSync, readFileSync } from 'node:fs';
import { run } from './runner';

const warning = (message: string): void => {
  const escaped = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::warning::${escaped}`);
};

async function main(): Promise<void> {
  // The token stays only in memory. Raw failures and event contents are never logged.
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')) as unknown;
  await run({
    env: process.env,
    event,
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    warning,
    output: (name, value) => {
      if (!process.env.GITHUB_OUTPUT) throw new Error('Missing output path');
      appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    },
    summary: (markdown) => {
      if (!process.env.GITHUB_STEP_SUMMARY) throw new Error('Missing summary path');
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    },
  });
}
void main().catch(() =>
  warning(
    'Optional Ship It celebration could not start. Check the workflow event context; your deployment is unaffected.',
  ),
);
