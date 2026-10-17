"""NexusRAG AI service.

Owns the code-understanding half of NexusRAG: parsing repository snapshots with
Tree-sitter, chunking them into code-aware units, and embedding those units.

The ingestion half (GitHub -> object storage) stays in TypeScript. This service
consumes the same queue, so neither side needs to call the other over HTTP.
"""

__version__ = "0.1.0"