# NexusRAG

> **AI-powered repository intelligence for understanding large codebases.**

NexusRAG is a codebase intelligence platform that combines **Retrieval-Augmented Generation (RAG)**, semantic search, lexical search, and code dependency graphs to help developers understand and navigate complex repositories.

Instead of feeding an entire repository into an LLM, NexusRAG parses, indexes, and retrieves only the code and context relevant to a developer's question.

```text
"Where is authentication implemented?"

"Explain how requests flow from the API to the database."

"What depends on UserService?"

"Where should I modify the code to add OAuth?"

"Explain the architecture of this repository."
```

---

## ✨ What NexusRAG Does

Understanding an unfamiliar codebase usually means jumping between files, searching symbols, tracing imports, and manually reconstructing how different parts of the system interact.

NexusRAG builds an **intelligence layer over the repository**.

It can:

* 📦 Ingest and index Git repositories
* 🌳 Parse source code using Tree-sitter
* 🧩 Create code-aware chunks instead of blindly splitting files
* 🧠 Generate embeddings for semantic code search
* 🔎 Perform hybrid semantic + lexical retrieval
* 🕸️ Build relationships between files, symbols, functions, and modules
* 💬 Answer natural-language questions about the codebase
* 📚 Retrieve relevant code before querying the LLM
* 🏗️ Help developers understand repository architecture and dependencies

---

## 🧠 Why RAG?

Large repositories can contain **thousands of files and millions of tokens**.

Sending the entire repository to an LLM is expensive, slow, and often impossible because of context-window limitations.

NexusRAG instead follows a retrieval pipeline:

```text
Developer Question
        │
        ▼
Query Understanding
        │
        ▼
Hybrid Retrieval
 ┌──────┼──────┐
 │      │      │
 ▼      ▼      ▼
Vector Lexical Graph
Search  Search  Search
 │      │      │
 └──────┼──────┘
        │
        ▼
     Reranking
        │
        ▼
Relevant Code Context
        │
        ▼
       LLM
        │
        ▼
Grounded Answer
```

Only the most relevant repository context is provided to the model.

---

# 🏗️ Architecture

```text
                         NexusRAG
                            │
                    ┌───────▼────────┐
                    │     Next.js    │
                    │  Web + API     │
                    └───────┬────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
        PostgreSQL                      Redis
          Prisma                  Sessions / Queue
                                              │
                                              ▼
                                           Workers
                                              │
                                              ▼
                                      Repository Ingestion
                                              │
                                              ▼
                                      GitHub Repository
                                              │
                                              ▼
                                       Repository Snapshot
                                              │
                                              ▼
                                         S3 / MinIO
                                              │
                                              ▼
                                         Tree-sitter
                                              │
                                              ▼
                                      Parse + Chunk Code
                                              │
                                              ▼
                                      ┌──────────────┐
                                      │  AI Service  │
                                      │   FastAPI    │
                                      └──────┬───────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          │                  │                  │
                          ▼                  ▼                  ▼
                       Qdrant              Neo4j          Elasticsearch
                    Vector Search        Code Graph      Lexical Search
                          │                  │                  │
                          └──────────────────┼──────────────────┘
                                             │
                                             ▼
                                       RAG Pipeline
                                             │
                                             ▼
                                            LLM
                                             │
                                             ▼
                                     Grounded Response
```

---

# ⚙️ How It Works

## 1. Repository Ingestion

A user connects or imports a Git repository.

```text
GitHub
   │
   ▼
Repository Clone
   │
   ▼
Repository Snapshot
   │
   ▼
Object Storage
```

Repository snapshots can be persisted using an S3-compatible object store such as **MinIO**.

---

## 2. Code Parsing

Raw source files are parsed using **Tree-sitter**.

Unlike naive text chunking, Tree-sitter understands the syntactic structure of source code.

This allows NexusRAG to identify constructs such as:

```text
Repository
 ├── Files
 │
 ├── Classes
 │   ├── Methods
 │   └── Properties
 │
 ├── Functions
 │
 ├── Imports
 │
 └── Exports
```

This produces **code-aware chunks** that preserve meaningful program structure.

---

## 3. Embedding & Indexing

Each code chunk is transformed into an embedding.

```text
Code Chunk
    │
    ▼
Embedding Model
    │
    ▼
Vector
    │
    ▼
Qdrant
```

These embeddings allow NexusRAG to retrieve code based on **meaning**, not just matching keywords.

For example:

```text
"Where do we verify users?"
```

could retrieve:

```ts
async function validateSession() {
    ...
}
```

even if the word `verify` never appears in the source code.

---

## 4. Code Graph

Semantic similarity alone cannot represent how a program is connected.

NexusRAG therefore maintains a **code graph** using Neo4j.

Example:

```text
AuthController
      │
      │ CALLS
      ▼
 AuthService
      │
      │ USES
      ▼
 UserRepository
      │
      │ QUERIES
      ▼
   PostgreSQL
```

Possible relationships include:

```text
IMPORTS
CALLS
EXTENDS
IMPLEMENTS
CONTAINS
EXPORTS
DEPENDS_ON
REFERENCES
```

This allows NexusRAG to answer structural questions such as:

```text
"What depends on AuthService?"
```

or:

```text
"Trace the authentication flow."
```

---

## 5. Hybrid Retrieval

Different questions require different retrieval strategies.

NexusRAG combines multiple search systems.

### Semantic Search — Qdrant

Finds code with similar meaning.

```text
"logic responsible for validating JWT tokens"
```

### Lexical Search — Elasticsearch

Finds exact identifiers and textual matches.

```text
validateAccessToken
```

### Graph Search — Neo4j

Finds structural relationships.

```text
AuthController
      ↓
AuthService
      ↓
TokenService
```

Combining these signals produces better context than relying on embeddings alone.

---

## 6. Context Construction

Retrieved results are ranked and combined into a compact context.

```text
User Question
      │
      ▼
Candidate Retrieval
      │
 ┌────┼────┐
 ▼    ▼    ▼
Vector Text Graph
      │
      ▼
   Reranking
      │
      ▼
Context Builder
      │
      ▼
Relevant Repository Context
```

The goal is to provide the LLM with the **smallest amount of context necessary to answer accurately**.

---

## 7. LLM Answer Generation

The final context is passed to the language model.

```text
Question
   +
Retrieved Code
   +
Repository Metadata
   +
Dependency Context
        │
        ▼
       LLM
        │
        ▼
Repository-aware Answer
```

Answers can reference the files and symbols used to generate the response.

---

# 🛠️ Tech Stack

| Layer                  | Technology       |
| ---------------------- | ---------------- |
| Frontend               | Next.js          |
| Application API        | Next.js          |
| AI Service             | FastAPI          |
| Monorepo               | Turborepo + pnpm |
| Database               | PostgreSQL       |
| ORM                    | Prisma           |
| Cache / Sessions       | Redis            |
| Job Queue              | Redis            |
| Code Parsing           | Tree-sitter      |
| Vector Database        | Qdrant           |
| Graph Database         | Neo4j            |
| Lexical Search         | Elasticsearch    |
| Object Storage         | S3 / MinIO       |
| Repository Integration | GitHub           |
| AI                     | LLM + Embeddings |

---

# 📁 Project Structure

```text
nexusrag/
│
├── apps/
│   ├── web/                  # Next.js application
│   └── ai-service/           # FastAPI AI/RAG service
│
├── packages/
│   ├── database/             # Prisma + PostgreSQL
│   ├── redis/                # Redis client / sessions
│   ├── github/               # GitHub integration
│   ├── parser/               # Tree-sitter parsing
│   ├── embeddings/           # Embedding generation
│   ├── retrieval/            # Hybrid retrieval
│   ├── graph/                # Code graph utilities
│   └── shared/               # Shared types/utilities
│
├── workers/
│   └── ingestion/            # Repository indexing workers
│
├── docker/
│
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

> The exact structure may evolve as NexusRAG develops.

---

# 💬 Example Queries

Once a repository has been indexed, developers can ask questions naturally.

### Code Discovery

```text
Where is authentication implemented?
```

### Architecture

```text
Explain how the backend is structured.
```

### Dependency Analysis

```text
What components depend on UserService?
```

### Execution Flow

```text
Trace what happens when POST /api/login is called.
```

### Feature Development

```text
Where would I need to make changes to add OAuth authentication?
```

### Code Explanation

```text
Explain how the payment processing pipeline works.
```

### Repository Exploration

```text
What are the most important modules in this repository?
```

---

# 🚀 Getting Started

## Prerequisites

Make sure you have the following installed:

* Node.js
* pnpm
* Python
* Docker
* PostgreSQL
* Redis

The remaining infrastructure can be started through Docker.

---

## Clone the Repository

```bash
git clone https://github.com/<your-username>/NexusRAG.git

cd NexusRAG
```

---

## Install Dependencies

```bash
pnpm install
```

Install the Python dependencies for the AI service according to its package configuration.

---

## Environment Variables

Create a `.env` file in the project root.

```env
# Database
DATABASE_URL=

# Redis
REDIS_URL=

# GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Object Storage
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=

# Vector Database
QDRANT_URL=

# Graph Database
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=

# Search
ELASTICSEARCH_URL=

# AI
LLM_API_KEY=
EMBEDDING_API_KEY=
```

Never commit `.env` files or secrets to version control.

---

## Start Infrastructure

```bash
docker compose up -d
```

This can start services such as:

```text
PostgreSQL
Redis
Qdrant
Neo4j
Elasticsearch
MinIO
```

---

## Database Setup

Generate the Prisma client:

```bash
pnpm prisma generate
```

Run database migrations:

```bash
pnpm prisma migrate dev
```

---

## Start Development

```bash
pnpm dev
```

The Turborepo development command can start the required workspace applications.

---

# 🗺️ Development Roadmap

### Phase 1 — Repository Infrastructure

* [ ] GitHub repository connection
* [ ] Repository cloning
* [ ] Repository metadata storage
* [ ] Repository snapshots
* [ ] Background ingestion jobs

### Phase 2 — Code Intelligence

* [ ] Tree-sitter parsing
* [ ] Language detection
* [ ] Code-aware chunking
* [ ] Symbol extraction
* [ ] Import/export analysis

### Phase 3 — Semantic Retrieval

* [ ] Embedding pipeline
* [ ] Qdrant indexing
* [ ] Semantic code search
* [ ] Metadata filtering

### Phase 4 — Hybrid Retrieval

* [ ] Elasticsearch indexing
* [ ] Lexical search
* [ ] Retrieval fusion
* [ ] Result reranking

### Phase 5 — Code Graph

* [ ] Neo4j integration
* [ ] Dependency extraction
* [ ] Function relationships
* [ ] Module relationships
* [ ] Graph traversal

### Phase 6 — RAG

* [ ] Query understanding
* [ ] Hybrid retrieval
* [ ] Context construction
* [ ] LLM integration
* [ ] Source attribution

### Phase 7 — Developer Experience

* [ ] Repository dashboard
* [ ] AI codebase chat
* [ ] File references
* [ ] Code previews
* [ ] Repository architecture visualization
* [ ] Dependency exploration

---

# 🎯 Project Goals

NexusRAG is designed around several core principles.

### Repository-Aware

The system should understand that code is structured and interconnected rather than treating a repository as a collection of unrelated text files.

### Retrieval First

Retrieve relevant information before involving the LLM.

### Code-Aware

Chunking and indexing should respect functions, classes, modules, imports, and other programming constructs.

### Grounded Answers

Responses should be grounded in actual repository content whenever possible.

### Scalable

The architecture should support repositories much larger than an LLM's context window.

---

# 🔮 Future Ideas

Potential future capabilities include:

* Multi-repository knowledge
* Incremental indexing after commits
* Branch-aware indexes
* Commit-aware code history
* Architecture diagrams generated from the code graph
* Natural-language dependency exploration
* IDE integration
* Repository onboarding summaries
* Documentation generation
* Dead-code detection
* Impact analysis before code changes
* GitHub pull request integration
* Local/self-hosted LLM support

---

# 🤝 Contributing

NexusRAG is currently under active development.

Contributions, ideas, bug reports, and architectural discussions are welcome.

---

# 📄 License

This project is licensed under the **MIT License**.

---

<p align="center">
  <b>NexusRAG</b><br/>
  Understand the codebase. Not just the code.
</p>
