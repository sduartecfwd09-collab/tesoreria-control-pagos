import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function setup() {
  rmSync("test.db", { force: true });
  const env = { ...process.env, DATABASE_URL: "file:./test.db" };
  execSync("npx prisma db push", { env, stdio: "ignore" });
  execSync("npx tsx seed/seed.ts", { env, stdio: "ignore" });
}
