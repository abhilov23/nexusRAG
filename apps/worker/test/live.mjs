import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { downloadArchive, ArchiveTooLargeError } from "../dist/download.js";
import { getIngestionQueueStats } from "@repo/queue";

// The test imports modules directly rather than through src/index.ts, so the
// worker bootstrap's dotenv call never runs. Load it explicitly.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(rootDir, ".env") });

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const ARCHIVE = "https://codeload.github.com/expressjs/express/tar.gz/refs/heads/master";

/** Drains a stream, returning any error it produced. */
async function drain(stream) {
  try {
    for await (const chunk of stream) void chunk;
    return null;
  } catch (error) {
    return error;
  }
}

check("counted bytes match GitHub's content-length", async () => {
  const { stream, declaredLength, bytesRead } = await downloadArchive({
    url: ARCHIVE,
    maxBytes: 512 * 1024 * 1024,
    timeoutMs: 60_000,
  });
  const error = await drain(stream);
  assert.equal(error, null, `unexpected stream error: ${error?.message}`);
  assert.ok(bytesRead() > 0, "expected a positive byte count");
  assert.equal(declaredLength, 133634, "GitHub should declare a content-length");
  assert.equal(bytesRead(), declaredLength, "counted bytes must match the declared length");
  return { bytes: bytesRead() };
});

check("oversized archive is rejected before a byte is read", async () => {
  // GitHub declares 133634, which is over this cap, so downloadArchive refuses
  // up front instead of streaming megabytes it already knows are too large.
  let threw = null;
  try {
    await downloadArchive({ url: ARCHIVE, maxBytes: 64 * 1024, timeoutMs: 60_000 });
  } catch (error) {
    threw = error;
  }
  assert.ok(threw, "expected an early rejection");
  assert.equal(threw.name, "ArchiveTooLargeError");
  assert.equal(threw.maxBytes, 64 * 1024);
  return { message: threw.message };
});

check("streaming guard trips when content-length is withheld", async () => {
  // GitHub frequently serves archives chunked with no content-length, so the
  // ceiling has to hold on the bytes themselves rather than on a header.
  const CAP = 64 * 1024;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/gzip" }); // no content-length
    let sent = 0;
    const push = () => {
      while (sent < 4 * 1024 * 1024) {
        sent += 64 * 1024;
        if (!res.write(Buffer.alloc(64 * 1024))) {
          res.once("drain", push);
          return;
        }
      }
      res.end();
    };
    push();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const { stream, declaredLength, bytesRead } = await downloadArchive({
      url: `http://127.0.0.1:${port}/archive.tar.gz`,
      maxBytes: CAP,
      timeoutMs: 30_000,
    });
    assert.equal(declaredLength, undefined, "server sent no content-length");

    const error = await drain(stream);
    assert.ok(error, "expected the streaming guard to abort");
    assert.equal(error.name, "ArchiveTooLargeError");
    assert.equal(error.maxBytes, CAP);
    assert.ok(
      bytesRead() > CAP && bytesRead() <= CAP + 64 * 1024,
      `guard should trip on the first chunk past the cap, counted ${bytesRead()}`,
    );
    return { counted: bytesRead(), cap: CAP };
  } finally {
    server.close();
  }
});

check("a stalled response is cut off by the timeout", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/gzip" });
    res.write(Buffer.alloc(1024));
    // Never end the response.
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const { stream } = await downloadArchive({
      url: `http://127.0.0.1:${port}/slow.tar.gz`,
      maxBytes: 512 * 1024 * 1024,
      timeoutMs: 1500,
    });
    const error = await drain(stream);
    assert.ok(error, "expected the timeout to abort the stream");
    assert.match(error.message ?? "", /abort|timeout/i);
    return { message: error.message };
  } finally {
    server.close();
  }
});

check("a 404 keeps its own status instead of flattening to 502", async () => {
  // Preserving 404 (and 429) keeps the upstream reason legible on the job, so a
  // deleted branch is not confused with a GitHub outage.
  let threw = null;
  try {
    await downloadArchive({
      url: "https://codeload.github.com/expressjs/express/tar.gz/refs/heads/no-such-branch",
      maxBytes: 512 * 1024 * 1024,
      timeoutMs: 30_000,
    });
  } catch (error) {
    threw = error;
  }
  assert.ok(threw, "expected a 404 to raise");
  assert.equal(threw.name, "ArchiveDownloadError");
  assert.equal(threw.status, 404);
  return { message: threw.message };
});

check("queue stats read live from redis", async () => {
  const stats = await getIngestionQueueStats();
  for (const key of ["waiting", "active", "delayed", "failed", "paused", "total"]) {
    assert.equal(typeof stats[key], "number", `${key} must be a number`);
  }
  assert.equal(
    stats.total,
    stats.waiting + stats.active + stats.delayed + stats.failed + stats.paused,
    "total must equal the sum of the buckets",
  );
  return stats;
});

let failed = 0;
for (const { name, fn } of checks) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}\n        ${error.message}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
