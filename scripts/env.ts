import fs from "node:fs/promises";
export async function saveEnv(values: Record<string, string>) {
  let source = await fs.readFile(".env.local", "utf8");
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n]/.test(value))
      throw new Error("Invalid environment setting");
    const line = key + "=" + JSON.stringify(value);
    const pattern = new RegExp("^" + key + "=.*$", "m");
    source = pattern.test(source)
      ? source.replace(pattern, () => line)
      : source + "\n" + line + "\n";
  }
  await fs.writeFile(".env.local", source, { mode: 0o600 });
  await fs.chmod(".env.local", 0o600);
}
