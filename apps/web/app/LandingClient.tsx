"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  Code2,
  GitBranch,
  MessageSquareText,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";

export default function LandingClient() {
  const { theme, toggleTheme } = useTheme();

  return (
    <main className={`landing-page nexus-app ${theme === "light" ? "light-app" : ""}`}>
      <header className="landing-nav">
        <Link className="landing-brand" href="/" aria-label="NexusRAG home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            nexus<span>rag</span>
          </span>
        </Link>
        <nav className="landing-nav-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className="landing-nav-actions">
          <Link className="landing-signin" href="/login">
            Sign in
          </Link>
          <button
            className="landing-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <Link className="landing-nav-cta" href="/signup">
            Get started <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <section className="landing-hero" id="how-it-works">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">
            <span /> CODEBASE INTELLIGENCE, IN CONTEXT
          </div>
          <h1>
            Make your codebase <em>conversational.</em>
          </h1>
          <p className="landing-lede">
            Understand how your software really works. Ask questions across your
            repositories and get clear answers grounded in the source.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-cta" href="/signup">
              Explore NexusRAG <ArrowRight size={15} />
            </Link>
            <Link className="landing-secondary-cta" href="/workspace">
              View workspace <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="landing-assurance">
            <ShieldCheck size={15} />
            <span>
              Private by design. Every answer points back to its source.
            </span>
          </div>
        </div>

        <div
          className="landing-demo-wrap"
          aria-label="Preview of a repository-grounded answer"
        >
          <div className="landing-demo-window">
            <div className="landing-demo-topbar">
              <div className="landing-window-dots">
                <i />
                <i />
                <i />
              </div>
              <span>REPOSITORY CHAT</span>
              <span className="landing-demo-live">
                <i /> INDEXED
              </span>
            </div>
            <div className="landing-demo-repo">
              <span>
                <Code2 size={14} />
              </span>
              <div>
                <strong>nexus-labs / agent-runtime</strong>
                <small>
                  <GitBranch size={11} /> main branch
                </small>
              </div>
              <Boxes size={15} />
            </div>
            <div className="landing-demo-conversation">
              <div className="landing-demo-question">
                <span>AG</span>
                <p>
                  Where does hybrid search combine vector and keyword results?
                </p>
              </div>
              <div className="landing-demo-answer">
                <span className="landing-demo-spark">
                  <Sparkles size={15} />
                </span>
                <div>
                  <strong>A grounded answer</strong>
                  <p>
                    <b>HybridRetriever</b> runs semantic and keyword search in
                    parallel, then merges the ranked results before generation.
                  </p>
                  <div className="landing-demo-citation">
                    <Code2 size={12} /> src/retrieval/hybrid.py{" "}
                    <ArrowUpRight size={11} />
                  </div>
                </div>
              </div>
            </div>
            <div className="landing-demo-composer">
              <span>Ask about this repository...</span>
              <span>
                <ArrowRight size={13} />
              </span>
            </div>
          </div>
          <div className="landing-demo-caption">
            <span>
              <Check size={13} /> Answers stay connected to your code
            </span>
            <span>01 / 03</span>
          </div>
        </div>
      </section>

      <section className="landing-process" aria-label="How NexusRAG works">
        <div>
          <span>01</span>
          <strong>Connect your repositories</strong>
        </div>
        <i />
        <div>
          <span>02</span>
          <strong>Build a shared understanding</strong>
        </div>
        <i />
        <div>
          <span>03</span>
          <strong>Ask better questions</strong>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-heading">
          <span>YOUR CODE, WITH CONTEXT</span>
          <h2>Less searching. More understanding.</h2>
          <p>
            Go from scattered source files to answers you can follow all the way
            back to the code.
          </p>
        </div>
        <div className="landing-feature-grid">
          <article>
            <span className="landing-feature-icon">
              <Search size={17} />
            </span>
            <span className="landing-feature-kicker">01 / SEARCH</span>
            <h3>Find the thread across your code</h3>
            <p>
              Find ideas by meaning or jump straight to a symbol, file, or exact
              phrase. Search across connected repositories without losing the
              architecture around each result.
            </p>
            <div className="landing-feature-meta">
              <span>Conceptual search</span>
              <span>Exact code matches</span>
            </div>
          </article>
          <article>
            <span className="landing-feature-icon">
              <MessageSquareText size={17} />
            </span>
            <span className="landing-feature-kicker">02 / ASK</span>
            <h3>Talk to a repository, not a black box</h3>
            <p>
              Choose a repository, ask in plain language, and get an answer
              shaped by that codebase—not a generic response detached from your
              implementation.
            </p>
            <div className="landing-feature-meta">
              <span>Repository-scoped chats</span>
              <span>Source citations</span>
            </div>
          </article>
          <article>
            <span className="landing-feature-icon">
              <Boxes size={17} />
            </span>
            <span className="landing-feature-kicker">03 / INSPECT</span>
            <h3>Follow every answer to its source</h3>
            <p>
              Inspect the files and chunks behind a response, follow retrieval
              and reranking steps, and verify important details before acting on
              them.
            </p>
            <div className="landing-feature-meta">
              <span>Retrieved files</span>
              <span>Search traces</span>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-usecases">
        <div className="landing-section-heading">
          <span>WHEN CONTEXT MATTERS</span>
          <h2>Useful from the first question.</h2>
          <p>
            Bring a new teammate, a tricky change, or an unclear answer into
            focus.
          </p>
        </div>
        <div className="landing-usecase-list">
          <article>
            <span>01</span>
            <div>
              <h3>Get oriented in an unfamiliar service</h3>
              <p>
                Ask where a request enters, which modules it touches, and where
                the core behavior lives.
              </p>
            </div>
            <b>ONBOARDING</b>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Understand the impact of a change</h3>
              <p>
                Trace related files and dependencies before editing a shared
                interface or flow.
              </p>
            </div>
            <b>CODE EXPLORATION</b>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Verify how an answer was formed</h3>
              <p>
                Review retrieved sources and the search trace instead of taking
                a response on faith.
              </p>
            </div>
            <b>INVESTIGATION</b>
          </article>
        </div>
      </section>

      <section className="landing-faq">
        <div className="landing-section-heading">
          <span>GOOD TO KNOW</span>
          <h2>Keep the source in view.</h2>
        </div>
        <div className="landing-faq-grid">
          <article>
            <h3>What can I ask about?</h3>
            <p>
              Ask about behavior, ownership, dependencies, or where a particular
              flow is implemented in the repositories you're exploring.
            </p>
          </article>
          <article>
            <h3>How do I verify an answer?</h3>
            <p>
              Follow the cited source paths and inspect the retrieved context
              and trace behind the response.
            </p>
          </article>
          <article>
            <h3>Can I keep work separated by repository?</h3>
            <p>
              Yes. Select a repository for a chat and keep its conversation
              focused on that codebase.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-bottom-cta">
        <div>
          <span>START WITH YOUR CODE</span>
          <h2>Make the next question easier to answer.</h2>
        </div>
        <Link className="landing-primary-cta" href="/signup">
          Get started <ArrowRight size={15} />
        </Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand" href="/" aria-label="NexusRAG home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            nexus<span>rag</span>
          </span>
        </Link>
        <span>Clarity for the code you build.</span>
        <Link href="/login">
          Sign in <ArrowUpRight size={12} />
        </Link>
      </footer>
    </main>
  );
}