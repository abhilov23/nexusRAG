"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Boxes, ChevronDown, CircleHelp, FileCode2, GitBranch, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";

type HelpTopic =
  "Getting started" | "Repositories" | "Chat & answers" | "Account";
type Article = { category: HelpTopic; question: string; answer: string };
const topics = [
  "All topics",
  "Getting started",
  "Repositories",
  "Chat & answers",
  "Account",
] as const;
const articles: Article[] = [
  {
    category: "Getting started",
    question: "How do I get started with NexusRAG?",
    answer:
      "Open your workspace, connect a repository, and let indexing prepare its files for search. Once indexing finishes, start a chat scoped to that repository.",
  },
  {
    category: "Repositories",
    question: "How do I connect a repository?",
    answer:
      "From Workspace, choose Add repository and provide the repository source. NexusRAG will add it to your workspace and begin building its searchable code context.",
  },
  {
    category: "Repositories",
    question: "What does repository indexing do?",
    answer:
      "Indexing reads supported source files, splits them into searchable code chunks, and records file references so answers can point back to their source.",
  },
  {
    category: "Repositories",
    question: "Why might indexing fail?",
    answer:
      "The source may be unavailable, access may have changed, or a sync may have encountered an issue. Check the repository status and try re-indexing after confirming access.",
  },
  {
    category: "Chat & answers",
    question: "How do I chat with one specific repository?",
    answer:
      "Open Chat playground and choose a repository from the selector at the top or in the composer. The conversation stays associated with that repository.",
  },
  {
    category: "Chat & answers",
    question: "Where do answer citations come from?",
    answer:
      "Citations refer to files retrieved from the selected repository. Open a citation to inspect the source path and compare the answer with the underlying code.",
  },
  {
    category: "Chat & answers",
    question: "What is the trace inspector?",
    answer:
      "The trace inspector summarizes query understanding, retrieval, reranking, and answer generation, helping you see how a response was formed.",
  },
  {
    category: "Account",
    question: "Can I change the appearance?",
    answer:
      "Yes. Use the theme button in the top bar or choose Light or Dark in Settings. Your theme preference is saved on this device.",
  },
  {
    category: "Account",
    question: "Where can I change workspace preferences?",
    answer:
      "Open Settings from the sidebar to update workspace details, indexing defaults, appearance, and notification preferences.",
  },
];

export default function EvaluationsPage() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<(typeof topics)[number]>("All topics");
  const filteredArticles = useMemo(() => {
    const search = query.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesTopic = topic === "All topics" || article.category === topic;
      const matchesSearch =
        !search ||
        `${article.question} ${article.answer} ${article.category}`
          .toLowerCase()
          .includes(search);
      return matchesTopic && matchesSearch;
    });
  }, [query, topic]);

  return (
    <div className="eval-page">
      <div className="eval-heading">
        <div className="eval-overline">
          <span />
          EVALUATIONS
        </div>
        <h1>Evaluation <span>runs</span></h1>
        <p>Track quality, latency, and regressions across experiments.</p>
      </div>
      <div className="experiment-panel">
        <div className="experiment-icon">
          <Sparkles size={18} />
        </div>
        <div className="experiment-copy">
          <div className="eval-label">CURRENT EXPERIMENT</div>
          <strong>Hybrid retrieval v2.1</strong>
          <span>Comparing RRF fusion vs. cross-encoder reranking on agent-runtime</span>
        </div>
        <div className="experiment-controls">
          <label>
            <span>DATASET</span>
            <div className="select-wrap">
              <select>
                <option value="agent-runtime">agent-runtime · 248 questions</option>
                <option value="rag-pipeline">rag-pipeline · 156 questions</option>
              </select>
            </div>
          </label>
          <label>
            <span>METRIC</span>
            <div className="select-wrap">
              <select>
                <option value="answer-relevance">Answer relevance</option>
                <option value="citation-precision">Citation precision</option>
              </select>
            </div>
          </label>
          <button className="eval-run-button">
            <span className="eval-spin" /> Run evaluation
          </button>
        </div>
      </div>
      <div className="eval-run-meta">
        <span>
          <span className="run-status-dot" />
          <b>Last run</b> 2 hours ago
        </span>
        <span className="run-divider" />
        <span>
          <b>Status</b> Completed
        </span>
      </div>
      <div className="eval-summary-grid">
        <div className="eval-score-card">
          <div className="eval-card-top">
            <span>ANSWER RELEVANCE</span>
            <span>
              <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M8 2L12 6H4L8 2Z" stroke="currentColor" strokeWidth="1.5"/></svg>
            </span>
          </div>
          <div className="eval-score-value">0.87<small>/1.00</small></div>
          <div className="eval-score-bottom">
            <span className="score-track"><i style={{width: "87%"}} /></span>
            <span>+0.03 vs baseline</span>
          </div>
        </div>
        <div className="eval-score-card">
          <div className="eval-card-top">
            <span>CITATION PRECISION</span>
            <span>
              <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M8 2L12 6H4L8 2Z" stroke="currentColor" strokeWidth="1.5"/></svg>
            </span>
          </div>
          <div className="eval-score-value">0.72<small>/1.00</small></div>
          <div className="eval-score-bottom">
            <span className="score-track"><i style={{background: "#bd7557", width: "72%"}} /></span>
            <span>-0.01 vs baseline</span>
          </div>
        </div>
        <div className="eval-score-card">
          <div className="eval-card-top">
            <span>P95 LATENCY</span>
            <span>
              <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M8 2L12 6H4L8 2Z" stroke="currentColor" strokeWidth="1.5"/></svg>
            </span>
          </div>
          <div className="eval-score-value">1.8<small>s</small></div>
          <div className="latency-detail">
            <b>1.4s</b> retrieval · <b>0.4s</b> generation
          </div>
        </div>
        <div className="eval-score-card">
          <div className="eval-card-top">
            <span>TOKEN COST</span>
            <span>
              <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M8 2L12 6H4L8 2Z" stroke="currentColor" strokeWidth="1.5"/></svg>
            </span>
          </div>
          <div className="eval-score-value">$0.002<small>/q</small></div>
          <div className="neutral-change">No significant change</div>
        </div>
      </div>
      <div className="eval-chart-panel">
        <div className="eval-chart-heading">
          <h2>Answer relevance trend</h2>
          <div className="chart-period">Last 30 days <ChevronDown size={12} /></div>
        </div>
        <div className="chart-legend">
          <span><i className="legend-sage" /> Baseline</span>
          <span><i className="legend-coral" /> Current run</span>
          <span><i className="legend-gold" /> Target</span>
        </div>
        <div className="chart-area">
          <div className="chart-axis">
            <span>1.0</span>
            <span>0.8</span>
            <span>0.6</span>
            <span>0.4</span>
          </div>
          <div className="chart-lines">
            <i className="chart-grid-line line-one" />
            <i className="chart-grid-line line-two" />
            <i className="chart-grid-line line-three" />
            <i className="chart-grid-line line-four" />
            <svg viewBox="0 0 600 130" preserveAspectRatio="none">
              <path className="chart-path path-sage" d="M0 100 C60 95 120 70 180 78 S300 95 360 68 S480 50 540 38 S580 42 600 30" />
              <path className="chart-path path-coral" d="M0 85 C60 80 120 55 180 62 S300 78 360 52 S480 35 540 24 S580 28 600 18" />
              <path className="chart-path path-gold" d="M0 40 C60 40 120 40 180 40 S300 40 360 40 S480 40 540 40 S580 40 600 40" strokeDasharray="6 4" />
            </svg>
            <div className="chart-x-labels">
              <span>Apr 28</span>
              <span>May 5</span>
              <span>May 12</span>
              <span>May 19</span>
              <span>May 26</span>
            </div>
          </div>
          <div className="quality-breakdown">
            <div className="eval-label">QUALITY BREAKDOWN</div>
            <div className="quality-metric">
              <div><b>Hallucination rate</b><span>2.1%</span></div>
              <div className="quality-track"><i className="bar-sage" style={{width: "15%"}} /></div>
              <small><span>Baseline: 3.4%</span></small>
            </div>
            <div className="quality-metric">
              <div><b>Missing citations</b><span>8.7%</span></div>
              <div className="quality-track"><i className="bar-coral" style={{width: "22%"}} /></div>
              <small><span>Baseline: 11.2%</span></small>
            </div>
            <div className="quality-metric">
              <div><b>Incorrect file refs</b><span>4.3%</span></div>
              <div className="quality-track"><i className="bar-gold" style={{width: "11%"}} /></div>
              <small><span>Baseline: 5.8%</span></small>
            </div>
          </div>
        </div>
      </div>
      <div className="eval-results-section">
        <div className="eval-results-heading">
          <h2>Question-level results <span>(248 questions)</span></h2>
          <div className="table-filter">
            <Search size={12} />
            <input placeholder="Filter questions" />
          </div>
        </div>
        <div className="eval-table-wrap">
          <table className="eval-table">
            <thead>
              <tr>
                <th>QUESTION</th>
                <th>RELEVANCE</th>
                <th>CITATION</th>
                <th>LATENCY</th>
                <th>TRACE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="question-index">01</span>
                  <span className="answer-cell">How does hybrid search combine vector and keyword results?</span>
                </td>
                <td><span className="metric-pill good">0.94</span></td>
                <td><span className="metric-pill good">0.89</span></td>
                <td className="latency-cell">1.2s</td>
                <td><a className="trace-link-button" href="#">View trace</a></td>
              </tr>
              <tr>
                <td>
                  <span className="question-index">02</span>
                  <span className="answer-cell">Where is authentication handled in the API layer?</span>
                </td>
                <td><span className="metric-pill good">0.91</span></td>
                <td><span className="metric-pill watch">0.67</span></td>
                <td className="latency-cell">0.9s</td>
                <td><a className="trace-link-button" href="#">View trace</a></td>
              </tr>
              <tr>
                <td>
                  <span className="question-index">03</span>
                  <span className="answer-cell">Explain the indexing pipeline for Python repositories.</span>
                </td>
                <td><span className="metric-pill good">0.88</span></td>
                <td><span className="metric-pill good">0.82</span></td>
                <td className="latency-cell">1.5s</td>
                <td><a className="trace-link-button" href="#">View trace</a></td>
              </tr>
              <tr>
                <td>
                  <span className="question-index">04</span>
                  <span className="answer-cell">What triggers a re-index of a repository?</span>
                </td>
                <td><span className="metric-pill watch">0.72</span></td>
                <td><span className="metric-pill watch">0.55</span></td>
                <td className="latency-cell">2.1s</td>
                <td><a className="trace-link-button" href="#">View trace</a></td>
              </tr>
              <tr>
                <td>
                  <span className="question-index">05</span>
                  <span className="answer-cell">How are code chunks sized for embedding?</span>
                </td>
                <td><span className="metric-pill good">0.95</span></td>
                <td><span className="metric-pill good">0.93</span></td>
                <td className="latency-cell">0.8s</td>
                <td><a className="trace-link-button" href="#">View trace</a></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="eval-table-footer">
          <span>Showing 5 of 248 questions</span>
          <button>Load more <ArrowRight size={12} /></button>
        </div>
      </div>
      <div className="eval-footnote">
        <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4v6M8 12v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        Demo data — connect your evaluation harness to track real runs.
      </div>
    </div>
  );
}