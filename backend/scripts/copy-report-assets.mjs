import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve("src/modules/report/assets/logo.png");
const destination = resolve("dist/modules/report/assets/logo.png");

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination);
