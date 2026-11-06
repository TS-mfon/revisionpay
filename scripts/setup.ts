import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { generatePrivateKey } from "viem/accounts";
const target = path.resolve(".env.local");
try {
  await fs.access(target);
  console.log(".env.local already exists; it was not overwritten.");
} catch {
  let content = await fs.readFile(".env.example", "utf8");
  for (const name of ["AUTH_SECRET", "CRON_SECRET", "CAPTURE_SECRET"])
    content = content.replace(
      name + "=\n",
      name + "=" + randomBytes(32).toString("hex") + "\n",
    );
  content = content.replace(
    "GENLAYER_PRIVATE_KEY=\n",
    "GENLAYER_PRIVATE_KEY=" + generatePrivateKey() + "\n",
  );
  await fs.writeFile(target, content, { mode: 0o600 });
  console.log(
    "Created .env.local with local secrets and a dedicated Studionet key. Secret values were not printed.",
  );
}
