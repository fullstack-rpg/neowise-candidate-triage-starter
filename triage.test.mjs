import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

let server;
const BASE = "http://127.0.0.1:3100";

before(async () => {
  server = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, PORT: "3100" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE + "/");
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});

after(() => server?.kill());

async function post(text) {
  const res = await fetch(BASE + "/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return { status: res.status, body: await res.json() };
}

test("успешный разбор возвращает ready с темой и черновиком", async () => {
  const { status, body } = await post("Не пришла доставка, где заказ?");
  assert.equal(status, 200);
  assert.equal(body.status, "ready");
  assert.equal(body.topic, "delivery");
  assert.ok(body.draft.trim().length > 0);
});

test("таймаут модели приводит к manual_review", async () => {
  const { status, body } = await post("[timeout] заявка");
  assert.equal(status, 200);
  assert.equal(body.status, "manual_review");
  assert.equal(body.topic, null);
  assert.equal(body.draft, null);
});

test("ошибка модели приводит к manual_review", async () => {
  const { status, body } = await post("[error] заявка");
  assert.equal(status, 200);
  assert.equal(body.status, "manual_review");
  assert.equal(body.topic, null);
  assert.equal(body.draft, null);
});

test("битый JSON от модели приводит к manual_review", async () => {
  const { body } = await post("[bad-json] заявка");
  assert.equal(body.status, "manual_review");
  assert.equal(body.topic, null);
  assert.equal(body.draft, null);
});

test("недопустимая тема приводит к manual_review", async () => {
  const { body } = await post("[bad-topic] заявка");
  assert.equal(body.status, "manual_review");
  assert.equal(body.topic, null);
  assert.equal(body.draft, null);
});

test("пустой черновик приводит к manual_review", async () => {
  const { body } = await post("[empty-draft] заявка");
  assert.equal(body.status, "manual_review");
  assert.equal(body.topic, null);
  assert.equal(body.draft, null);
});

test("пустой ввод возвращает 400 invalid_input", async () => {
  const { status, body } = await post("   ");
  assert.equal(status, 400);
  assert.equal(body.status, "invalid_input");
});

test("нестроковый ввод возвращает 400 invalid_input", async () => {
  const res = await fetch(BASE + "/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: 123 }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { status: "invalid_input" });
});