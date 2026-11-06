import { createServer } from "node:http";
import { config } from "dotenv";
import path from "node:path";
import handler from "./handler";
config({ path: path.resolve(process.cwd(), "../../.env.local"), quiet: true });
const server = createServer((req, res) => {
  if (req.url !== "/api/snapshot") {
    res.writeHead(404);
    res.end();
    return;
  }
  void handler(req, res);
});
server.listen(3001, "127.0.0.1", () =>
  console.log("RevisionPay capture service: http://127.0.0.1:3001"),
);
