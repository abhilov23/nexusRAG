import {
  parseGitHubRepositoryUrl,
  buildArchiveUrl,
  InvalidRepositoryUrlError,
} from "../dist/index.js";

const accept = [
  ["https://github.com/owner/repo", "owner", "repo"],
  ["https://github.com/owner/repo/", "owner", "repo"],
  ["https://github.com/owner/repo.git", "owner", "repo"],
  ["  https://github.com/owner/repo  ", "owner", "repo"],
  ["https://www.github.com/owner/repo", "owner", "repo"],
  ["https://github.com/nexus-labs/rag-pipeline", "nexus-labs", "rag-pipeline"],
  ["https://github.com/owner/repo.with.dots", "owner", "repo.with.dots"],
  ["https://github.com/owner/repo.git/", "owner", "repo"],
];

const reject = [
  "http://github.com/owner/repo",
  "https://gitlab.com/owner/repo",
  "https://evil.com/owner/repo",
  "https://github.com/owner",
  "https://github.com/owner/repo/tree/main",
  "https://github.com/owner/repo/issues/1",
  "https://github.com/owner/repo/pull/5",
  "https://github.com/settings/profile",
  "https://github.com/orgs/foo",
  "https://github.com/features",
  "https://github.com/",
  "https://github.com/owner/repo?tab=readme",
  "https://github.com/owner/repo#readme",
  "https://github.com/-owner/repo",
  "https://github.com/owner-/repo",
  "https://github.com/own..er/repo",
  "https://github.com/owner/re%2Fpo",
  "https://github.com/owner/repo/../../etc",
  "javascript:alert(1)",
  "file:///etc/passwd",
  "",
  "   ",
];

let failures = 0;

for (const [input, owner, repo] of accept) {
  try {
    const ref = parseGitHubRepositoryUrl(input);
    if (ref.owner !== owner || ref.repo !== repo) {
      console.error(
        `FAIL accept: ${JSON.stringify(input)} -> got ${ref.owner}/${ref.repo}, want ${owner}/${repo}`,
      );
      failures++;
    } else {
      console.log(`ok   accept ${JSON.stringify(input)} -> ${ref.canonicalUrl}`);
    }
  } catch (error) {
    console.error(`FAIL accept: ${JSON.stringify(input)} threw ${error.message}`);
    failures++;
  }
}

for (const input of reject) {
  try {
    const ref = parseGitHubRepositoryUrl(input);
    console.error(`FAIL reject: ${JSON.stringify(input)} -> accepted as ${ref.canonicalUrl}`);
    failures++;
  } catch (error) {
    if (error instanceof InvalidRepositoryUrlError) {
      console.log(`ok   reject ${JSON.stringify(input)}`);
    } else {
      console.error(`FAIL reject: ${JSON.stringify(input)} threw wrong type ${error.name}`);
      failures++;
    }
  }
}

// Archive URL is built only from validated segments.
const key = buildArchiveUrl({ owner: "owner", repo: "repo", commitSha: "a".repeat(40) });
if (key !== `https://github.com/owner/repo/archive/${"a".repeat(40)}.tar.gz`) {
  console.error(`FAIL archive url: ${key}`);
  failures++;
} else {
  console.log(`ok   archive url ${key}`);
}

for (const bad of [
  { owner: "../../etc", repo: "r", commitSha: "a".repeat(40) },
  { owner: "o", repo: "r/../x", commitSha: "a".repeat(40) },
  { owner: "o", repo: "r", commitSha: "../../evil" },
  { owner: "o", repo: "r", commitSha: "nothex" },
]) {
  try {
    const out = buildArchiveUrl(bad);
    console.error(`FAIL archive reject: ${JSON.stringify(bad)} -> ${out}`);
    failures++;
  } catch (error) {
    if (error instanceof InvalidRepositoryUrlError) {
      console.log(`ok   archive reject ${JSON.stringify(bad.owner + "/" + bad.repo)}`);
    } else {
      console.error(`FAIL archive reject wrong type: ${error.name}`);
      failures++;
    }
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
