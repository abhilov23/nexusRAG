"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  GitBranch,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Quote,
  Sparkles,
  Terminal,
  X,
  Activity,
} from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
};
type Repository = {
  id: string;
  name: string;
  branch: string;
  sourceFile: string;
};
const repositories: Repository[] = [
  {
    id: "agent-runtime",
    name: "nexus-labs / agent-runtime",
    branch: "main",
    sourceFile: "src/retrieval/hybrid.py",
  },
  {
    id: "rag-pipeline",
    name: "nexus-labs / rag-pipeline",
    branch: "main",
    sourceFile: "retrieval/pipeline.py",
  },
  {
    id: "docs-platform",
    name: "nexus-labs / docs-platform",
    branch: "main",
    sourceFile: "src/search/indexer.ts",
  },
  {
    id: "eval-harness",
    name: "nexus-labs / eval-harness",
    branch: "develop",
    sourceFile: "src/evaluators/relevance.py",
  },
  {
    id: "web-console",
    name: "nexus-labs / web-console",
    branch: "main",
    sourceFile: "src/views/repositories.tsx",
  },
  {
    id: "vector-store",
    name: "nexus-labs / vector-store",
    branch: "main",
    sourceFile: "internal/index.go",
  },
];
const initialMessages: Message[] = [
  {
    id: "welcome-user",
    role: "user",
    text: "How does hybrid search combine vector and keyword results in the pipeline?",
  },
  {
    id: "welcome-assistant",
    role: "assistant",
    text: "Hybrid search runs vector similarity and BM25 keyword retrieval in parallel. Reciprocal rank fusion combines the ranked lists without needing to normalize their different score scales.\n\nRRF(d) = Σ 1 / (k + rankᵢ(d))\n\nThe `HybridRetriever` merges both result sets, then passes the highest-ranked chunks to the answer generator.",
  },
];

function ActivityIcon() {
  return (
    <span className="trace-icon-spark">
      <Sparkles size={13} />
    </span>
  );
}
function SearchIcon() {
  return <BookOpen size={14} />;
}

export default function ChatClient() {
  const searchParams = useSearchParams();
  const requestedRepo = searchParams.get("repo");
  const foundRepo = repositories.find((repo) => repo.id === requestedRepo);
  const selectedRepo = (foundRepo ?? repositories[0]) as Repository;
  const [conversations, setConversations] = useState<Record<string, Message[]>>(
    {
      "agent-runtime": initialMessages,
    },
  );
  const messages = conversations[selectedRepo.id] ?? [];
  const [prompt, setPrompt] = useState("");
  const [traceOpen, setTraceOpen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1201px)").matches : false,
  );
  const [activeModel, setActiveModel] = useState("claude-3.5-sonnet");
  const [retrieval, setRetrieval] = useState({
    Vector: true,
    BM25: true,
    Graph: true,
    "Cross-Encoder": false,
  });
  const [allChunksOpen, setAllChunksOpen] = useState(false);
  const [citationFile, setCitationFile] = useState("src/retrieval/hybrid.py");
  const traceQuery =
    [...messages].reverse().find((message) => message.role === "user")?.text ??
    "Your next question will appear here.";
  const [activeSource, setActiveSource] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        setTraceOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setActiveSource(false);
        setTraceOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const send = () => {
    const text = prompt.trim();
    if (!text) return;
    const repoId = selectedRepo.id;
    const responseId = `answer-${Date.now()}`;
    setConversations((current) => ({
      ...current,
      [repoId]: [
        ...(current[repoId] ?? []),
        { id: `${responseId}-question`, role: "user", text },
        { id: responseId, role: "assistant", text: "", loading: true },
      ],
    }));
    setPrompt("");
    const answer = `Searching ${selectedRepo.name} on the ${selectedRepo.branch} branch, I found the relevant implementation in ${selectedRepo.sourceFile}. The indexed code shows how this repository handles the requested behavior. Open the source citation to inspect the matching code path.`;
    const words = answer.split(" ");
    let visibleWords = 0;
    window.setTimeout(() => {
      const stream = window.setInterval(() => {
        visibleWords = Math.min(visibleWords + 3, words.length);
        setConversations((current) => ({
          ...current,
          [repoId]: (current[repoId] ?? []).map((message) =>
            message.id === responseId
              ? {
                  ...message,
                  text: words.slice(0, visibleWords).join(" "),
                  loading: visibleWords < words.length,
                }
              : message,
          ),
        }));
        if (visibleWords === words.length) window.clearInterval(stream);
      }, 45);
    }, 450);
  };
  const selectRepository = (repoId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("repo", repoId);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new Event("popstate"));
    setActiveSource(false);
  };
  const toggleRetrieval = (name: keyof typeof retrieval) => {
    setRetrieval((current) => ({ ...current, [name]: !current[name] }));
  };
  const copyAnswer = async (text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopyDone(true);
    window.setTimeout(() => setCopyDone(false), 1400);
  };

  return (
    <div className={`chat-layout ${traceOpen ? "with-trace" : ""}`}>
      <section className="chat-main">
        <div className="chat-topline">
          <div>
            <label className="chat-repo-select">
              <span className="repo-mini-icon">
                <Code2 size={13} />
              </span>
              <select
                aria-label="Chat with repository"
                value={selectedRepo.id}
                onChange={(event) => selectRepository(event.target.value)}
              >
                {repositories.map((repo) => (
                  <option value={repo.id} key={repo.id}>
                    {repo.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <span className="chat-branch">
              <GitBranch size={12} />
              {selectedRepo.branch}
            </span>
          </div>
          <div className="chat-header-tools">
            <label className="model-select">
              <Sparkles size={13} />
              <select
                aria-label="Active language model"
                value={activeModel}
                onChange={(event) => setActiveModel(event.target.value)}
              >
                <option value="claude-3.5-sonnet">claude-3.5-sonnet</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <button className="trace-header-trigger" onClick={() => setTraceOpen((open) => !open)}>
              <PanelRightOpen size={14} />
              {traceOpen ? "Close inspector" : "Open Trace Inspector"}
              <kbd>⌘I</kbd>
            </button>
          </div>
        </div>
        <div className="conversation-scroll">
          <div className="conversation-content">
            <div className="chat-intro">
              <div className="intro-spark">
                <Sparkles size={20} />
              </div>
              <p className="page-eyebrow">NEXUSRAG ASSISTANT</p>
              <h1>
                Ask this repository<span>.</span>
              </h1>
              <p>
                Answers grounded in {selectedRepo.name}, with sources you can
                trust.
              </p>
            </div>
            <div className="message-list">
              {messages.map((message) => (
                <div
                  className={`message message-${message.role}`}
                  key={message.id}
                >
                  <div
                    className={`message-avatar ${message.role === "assistant" ? "assistant-avatar" : ""}`}
                  >
                    {message.role === "assistant" ? (
                      <div className="brand-mark mini-brand">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      "AG"
                    )}
                  </div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>
                        {message.role === "assistant" ? "NexusRAG" : "You"}
                      </strong>
                      <span>
                        {message.role === "assistant"
                          ? "just now"
                          : "2 min ago"}
                      </span>
                    </div>
                    {message.loading && !message.text ? (
                      <div className="typing">
                        <i />
                        <i />
                        <i />
                        <span>Searching your codebase...</span>
                      </div>
                    ) : (
                      <div className="message-text">
                        {message.text.split("\n").map((line, lineIndex) =>
                          line.startsWith("The `") ? (
                            <p key={lineIndex}>
                              The <code>HybridRetriever</code> merges both result sets, then passes the highest-ranked chunks to the answer generator.
                            </p>
                          ) : line.startsWith("RRF(") ? (
                            <pre className="answer-code" key={lineIndex}><code>{line}</code></pre>
                          ) : line ? (
                            <p key={lineIndex}>{line}</p>
                          ) : null,
                        )}
                        {message.role === "assistant" && (
                          <div className="citation-wrap">
                            <button className="citation-chip" onClick={() => { setCitationFile(selectedRepo.sourceFile); setActiveSource(true); }}>
                              <Quote size={12} /> S1: {selectedRepo.sourceFile}#L42–L88 <span>↗</span>
                            </button>
                            <button className="citation-chip" onClick={() => { setCitationFile(selectedRepo.id === "agent-runtime" ? "src/retrieval/fusion.py" : selectedRepo.sourceFile); setActiveSource(true); }}>
                              <Quote size={12} /> S2: fusion.py#L15 <span>↗</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {message.role === "assistant" && !message.loading && (
                      <div className="message-tools">
                        <button onClick={() => copyAnswer(message.text)}>
                          <Copy size={13} />
                          {copyDone ? "Copied" : "Copy"}
                        </button>
                        <button onClick={() => setTraceOpen(true)}>
                          <ActivityIcon />
                          Show trace
                        </button>
                        <button>
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="suggestion-row">
              <button
                onClick={() =>
                  setPrompt(
                    `Where is authentication handled in ${selectedRepo.name}?`,
                  )
                }
              >
                <span>↗</span>Where is authentication handled?
              </button>
              <button
                onClick={() =>
                  setPrompt(
                    `Explain the indexing pipeline in ${selectedRepo.name}`,
                  )
                }
              >
                <span>↗</span>Explain the indexing pipeline
              </button>
            </div>
          </div>
        </div>
        <div className="composer-area">
          <div className="composer">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about architecture, call graphs, or search symbols (e.g. ERR_CONN_RESET)..."
              rows={2}
            />
            <div className="retrieval-toggles">
              {(Object.keys(retrieval) as (keyof typeof retrieval)[]).map((name) => (
                <button className={retrieval[name] ? "is-enabled" : ""} key={name} onClick={() => toggleRetrieval(name)} aria-pressed={retrieval[name]}>
                  {retrieval[name] && <Check size={11} />}{name}
                </button>
              ))}
            </div>
            <div className="composer-bottom">
              <label className="composer-context">
                <span className="context-dot" />
                Using
                <select
                  aria-label="Repository context for chat"
                  value={selectedRepo.id}
                  onChange={(event) => selectRepository(event.target.value)}
                >
                  {repositories.map((repo) => (
                    <option value={repo.id} key={repo.id}>
                      {repo.name.split(" / ").pop()}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              <div className="composer-actions">
                <span><kbd>↵</kbd> Submit <i>·</i> <kbd>⇧ ↵</kbd> New line <i>·</i> <kbd>⌘ K</kbd> Commands</span>
                <button
                  className="send-button"
                  disabled={!prompt.trim()}
                  onClick={send}
                  aria-label="Send message"
                >
                  <ArrowUp size={17} />
                </button>
              </div>
            </div>
          </div>
          <p className="composer-disclaimer">
            NexusRAG can make mistakes. Verify important answers against the
            source.
          </p>
        </div>
      </section>
      <aside className={`trace-panel ${traceOpen ? "trace-open" : ""}`}>
        <div className="trace-header">
          <div>
            <span className="trace-live-dot" />
            <strong>Trace inspector</strong>
          </div>
          <button
            className="icon-button"
            onClick={() => setTraceOpen(false)}
            aria-label="Close trace inspector"
          >
            <PanelRightClose size={17} />
          </button>
        </div>
        <div className="trace-content">
          <div className="trace-query">
            <span className="trace-label">QUERY</span>
            <p>{traceQuery}</p>
            <span>
              {selectedRepo.name} · {selectedRepo.branch}
            </span>
          </div>
          <div className="trace-timeline">
            <div className="trace-step">
              <div className="trace-step-icon">
                <SearchIcon />
              </div>
              <div>
                <div className="trace-step-head">
                  <strong>Query understanding</strong>
                  <span>24ms</span>
                </div>
                <p>Intent: code explanation</p>
                <span className="trace-model">gpt-4o-mini</span>
              </div>
            </div>
            <div className="trace-step">
              <div className="trace-step-icon">
                <GitBranch size={14} />
              </div>
              <div>
                <div className="trace-step-head">
                  <strong>Hybrid retrieval</strong>
                  <span>318ms</span>
                </div>
                <p>Vector + BM25 · top 8 chunks</p>
                <div className="retrieval-item">
                  <span>1</span>
                  <div>
                    <strong>{selectedRepo.sourceFile.split("/").pop()}</strong>
                    <small>relevance 0.94</small>
                  </div>
                </div>
                <div className="retrieval-item">
                  <span>2</span>
                  <div>
                    <strong>
                      {selectedRepo.id === "agent-runtime"
                        ? "fusion.py"
                        : selectedRepo.sourceFile.split("/").pop()}
                    </strong>
                    <small>relevance 0.87</small>
                  </div>
                </div>
                {allChunksOpen && [3, 4, 5, 6, 7, 8].map((rank) => (
                  <div className="retrieval-item extra-candidate" key={rank}>
                    <span>{rank}</span><div><strong>{rank % 2 ? "chunking.py" : "search/index.py"}</strong><small>relevance {(0.82 - rank * 0.025).toFixed(2)}</small></div>
                  </div>
                ))}
                <button className="trace-link" onClick={() => setAllChunksOpen((open) => !open)}>
                  {allChunksOpen ? "Show fewer chunks" : "View all 8 chunks"} <ArrowDown size={12} />
                </button>
              </div>
            </div>
            <div className="trace-step">
              <div className="trace-step-icon">
                <Sparkles size={14} />
              </div>
              <div>
                <div className="trace-step-head">
                  <strong>Reranking</strong>
                  <span>82ms</span>
                </div>
                <p>Cross-encoder · top 5 selected</p>
              </div>
            </div>
            <div className="trace-step last">
              <div className="trace-step-icon">
                <Terminal size={14} />
              </div>
              <div>
                <div className="trace-step-head">
                  <strong>Answer generation</strong>
                  <span>996ms</span>
                </div>
                <p>1,284 input · 186 output tokens</p>
                <span className="trace-model">{activeModel}</span>
              </div>
            </div>
          </div>
          <div className="trace-footer">
            <span>
              <Check size={13} />
              Trace complete
            </span>
            <button>
              <ExternalLink size={13} />
              Full details
            </button>
          </div>
        </div>
      </aside>
      {traceOpen && <div className="trace-backdrop" aria-hidden="true" />}
      {activeSource && (
        <div className="citation-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveSource(false); }}>
          <section className="citation-modal" role="dialog" aria-modal="true" aria-label="Source code citation">
            <header><div><FileCode2 size={15} /><span><strong>{citationFile.split("/").pop()}</strong><small>{selectedRepo.name} / {citationFile}</small></span></div><button className="icon-button" onClick={() => setActiveSource(false)} aria-label="Close source preview"><X size={16} /></button></header>
            <div className="citation-scope"><span>class HybridRetriever</span><span>src/retrieval/hybrid.py · lines 42–88</span></div>
            <pre className="citation-code"><code>{[
              [39, "class HybridRetriever:"],
              [40, "    def retrieve(self, query: str) -> list[Chunk]:"],
              [41, "        vector_hits = self.vector.search(query, limit=20)"],
              [42, "        keyword_hits = self.bm25.search(query, limit=20)"],
              [43, "        return reciprocal_rank_fusion("],
              [44, "            vector_hits, keyword_hits, k=60"],
              [45, "        )"],
              [46, ""],
              [47, "def reciprocal_rank_fusion(*ranked_lists, k=60):"],
              [48, "    scores = defaultdict(float)"],
              [49, "    for results in ranked_lists:"],
              [50, "        for rank, chunk in enumerate(results, start=1):"],
              [51, "            scores[chunk.id] += 1 / (k + rank)"],
              [52, "    return sorted(scores, key=scores.get, reverse=True)"],
            ].map(([line, code]) => <span className={line === 42 || line === 43 || line === 51 ? "highlighted-code-line" : ""} key={line}><i>{line}</i>{code}</span>)}</code></pre>
            <footer><span><Check size={13} /> Preview from demo snapshot</span><button onClick={() => setActiveSource(false)}>Close preview</button></footer>
          </section>
        </div>
      )}
      {!traceOpen && (
        <button
          className="trace-open-button"
          onClick={() => setTraceOpen(true)}
        >
          <PanelRightOpen size={15} />
          Show trace
        </button>
      )}
    </div>
  );
}