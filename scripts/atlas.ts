import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { saveEnv } from "./env";

const run = promisify(execFile);
const projectId = process.argv[2];
const clusterName = process.argv[3] || "revisionpay";
if (!/^[a-f0-9]{24}$/.test(projectId || ""))
  throw new Error(
    "Pass the new RevisionPay Atlas project ID and cluster name.",
  );
const bin = process.env.ATLAS_BIN || "atlas";
async function atlas(args: string[]) {
  try {
    const { stdout } = await run(
      bin,
      [...args, "--projectId", projectId, "-o", "json"],
      { timeout: 60000 },
    );
    // The CLI can write its secure-storage notice before the JSON document.
    return JSON.parse(stdout.slice(stdout.indexOf("{")));
  } catch (error) {
    throw new Error(
      "Atlas could not complete " +
        args.slice(0, 2).join(" ") +
        " (" +
        String((error as NodeJS.ErrnoException).code || (error as Error).name) +
        "). Check CLI sign-in and project permissions.",
    );
  }
}
async function main() {
  const cluster = await atlas(["clusters", "describe", clusterName]);
  if (cluster.stateName !== "IDLE" || !cluster.connectionStrings?.standardSrv)
    throw new Error("The cluster is not ready yet.");
  if (
    !cluster.replicationSpecs.every((spec: any) =>
      spec.regionConfigs.every(
        (region: any) => region.electableSpecs.instanceSize === "M0",
      ),
    )
  )
    throw new Error("Expected the free M0 tier.");
  await fs.mkdir(".local", { recursive: true });
  const credentialPath = ".local/atlas-user.json";
  let user: {
    username: string;
    password: string;
    projectId: string;
    clusterName: string;
  };
  try {
    user = JSON.parse(await fs.readFile(credentialPath, "utf8"));
  } catch {
    user = {
      username: "revisionpay_app",
      password: randomBytes(32).toString("base64url"),
      projectId,
      clusterName,
    };
    await fs.writeFile(credentialPath, JSON.stringify(user), { mode: 0o600 });
  }
  if (user.projectId !== projectId || user.clusterName !== clusterName)
    throw new Error(
      "Saved credentials belong to a different project or cluster.",
    );
  const users = await atlas(["dbusers", "list"]);
  if (
    !users.results.some((existing: any) => existing.username === user.username)
  ) {
    await atlas([
      "dbusers",
      "create",
      "--username",
      user.username,
      "--password",
      user.password,
      "--role",
      "readWrite@revisionpay",
      "--scope",
      clusterName,
    ]);
  }
  const access = await atlas(["accessLists", "list"]);
  if (!access.results.some((entry: any) => entry.cidrBlock === "0.0.0.0/0"))
    await atlas([
      "accessLists",
      "create",
      "0.0.0.0/0",
      "--type",
      "cidrBlock",
      "--comment",
      "RevisionPay sandbox Vercel dynamic egress; scoped database credentials required",
    ]);
  const host = new URL(cluster.connectionStrings.standardSrv).hostname;
  const uri =
    "mongodb+srv://" +
    encodeURIComponent(user.username) +
    ":" +
    encodeURIComponent(user.password) +
    "@" +
    host +
    "/revisionpay?retryWrites=true&w=majority&authSource=admin&appName=RevisionPay";
  await saveEnv({ MONGODB_URI: uri, MONGODB_DATABASE: "revisionpay" });
  console.log(
    "Free Atlas cluster " +
      clusterName +
      " configured. Restricted application credentials saved privately in .env.local.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
