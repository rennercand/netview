import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error(
    "Execute este comando em terminal interativo (Docker run -it).",
  );

let hideInput = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hideInput) process.stdout.write(chunk);
    callback();
  },
});
const terminal = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
try {
  process.env.ADMIN_EMAIL = (await terminal.question("Seu e-mail: ")).trim();
  process.env.ADMIN_NAME = (await terminal.question("Seu nome: ")).trim();
  process.stdout.write("Senha (mínimo 12 caracteres; entrada oculta): ");
  hideInput = true;
  process.env.ADMIN_PASSWORD = await terminal.question("");
  hideInput = false;
  process.stdout.write("\n");
  terminal.close();
  await import("./create-admin.js");
} finally {
  terminal.close();
  output.end();
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_NAME;
  delete process.env.ADMIN_PASSWORD;
}
