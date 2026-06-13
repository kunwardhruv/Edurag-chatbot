# rag_pipeline.py — Production-grade RAG with Hybrid Search
#
# ARCHITECTURE (from the reel best practices):
# ✅ PDF parsing & chunking with page metadata
# ✅ Metadata indexing (page_num, chapter hint, source)
# ✅ Hybrid search: FAISS (vector) + BM25 (keyword)
# ✅ Multi-stage retrieval & RRF reranking
# ✅ Query result caching (in-memory)
# ✅ Context window optimization (dedup + page ordering)
# ✅ Hallucination prevention + page citation in prompt

import os
import json
import hashlib
import numpy as np
import fitz  # PyMuPDF
from pathlib import Path
from sentence_transformers import SentenceTransformer
import faiss
from groq import Groq
from langchain.text_splitter import RecursiveCharacterTextSplitter
from rank_bm25 import BM25Okapi

from config import (
    CHUNK_SIZE, CHUNK_OVERLAP, EMBEDDING_MODEL,
    FAISS_TOP_K, BM25_TOP_K, FINAL_TOP_K, RRF_K,
    SIMILARITY_THRESHOLD, INDEX_DIR, GROQ_MODEL,
    VECTOR_WEIGHT, BM25_WEIGHT
)

# ─────────────────────────────────────────────────────────────────────────────
# QUERY CACHE
# WHY: Same query on same book = identical result. No point calling Groq again.
# Key: SHA256(index_name + query) — collision-proof, fast lookup.
# ─────────────────────────────────────────────────────────────────────────────
_query_cache: dict = {}

def _cache_key(query: str, index_name: str) -> str:
    raw = f"{index_name}::{query.strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: PDF EXTRACTION WITH PAGE METADATA
# WHY track page numbers: LLM will cite page refs → student can open exact page.
# WHY flag diagram pages: Tells LLM that a visual exists on that page.
# ─────────────────────────────────────────────────────────────────────────────
def extract_text_from_pdf(pdf_bytes: bytes) -> tuple:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    stats = {"total_pages": len(doc), "pages_with_images": 0, "total_images": 0, "text_length": 0}

    for page_num, page in enumerate(doc, start=1):
        text = page.get_text().strip()
        image_list = page.get_images(full=True)
        has_images = len(image_list) > 0

        if has_images:
            stats["pages_with_images"] += 1
            stats["total_images"] += len(image_list)

        if text:
            pages.append({
                "page_num": page_num,
                "text": text,
                "has_images": has_images,
                "image_count": len(image_list)
            })

    doc.close()
    stats["text_length"] = sum(len(p["text"]) for p in pages)
    return pages, stats


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: CHUNKING WITH PAGE METADATA PRESERVED PER CHUNK
# WHY: Every chunk needs to know its source page for citation later.
# ─────────────────────────────────────────────────────────────────────────────
def chunk_pages(pages: list) -> list:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    all_chunks = []
    chunk_idx = 0

    for page in pages:
        page_text = page["text"]
        if page["has_images"]:
            page_text = (
                f"[Page {page['page_num']} contains {page['image_count']} diagram(s). "
                f"The following text includes captions and explanations for these visuals.]\n\n"
                + page_text
            )

        splits = splitter.split_text(page_text)
        for split in splits:
            cleaned = split.strip()
            if len(cleaned) < 80:
                continue
            all_chunks.append({
                "text": cleaned,
                "page_num": page["page_num"],
                "has_images": page["has_images"],
                "chunk_idx": chunk_idx
            })
            chunk_idx += 1

    return all_chunks


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: EMBEDDING MODEL (lazy-loaded, module-level cache)
# ─────────────────────────────────────────────────────────────────────────────
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL)
    return _embedding_model


def embed_texts(texts: list) -> np.ndarray:
    model = get_embedding_model()
    embs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False, batch_size=32)
    return embs.astype("float32")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: BM25 INDEX
# WHY BM25: Probabilistic keyword ranking (TF-IDF based). Excellent for:
#   - Exact scientific terms: "H2O", "mitochondria", "photosynthesis"
#   - Proper nouns: "Mahatma Gandhi", "Newton", "Pythagoras"
#   - Chapter-specific jargon that semantic search might miss semantically
# BM25 and vector search are complementary, not competing.
# ─────────────────────────────────────────────────────────────────────────────
def build_bm25_index(chunks: list) -> BM25Okapi:
    tokenized = [chunk["text"].lower().split() for chunk in chunks]
    return BM25Okapi(tokenized)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: BUILD & SAVE FAISS INDEX + CHUNK METADATA
# ─────────────────────────────────────────────────────────────────────────────
def build_and_save_index(chunks, embeddings, class_name, subject, book_name, pdf_stats) -> str:
    safe_name = f"Class{class_name}_{subject}_{book_name}".replace(" ", "_")
    save_dir = Path(INDEX_DIR) / safe_name
    save_dir.mkdir(parents=True, exist_ok=True)

    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)
    faiss.write_index(index, str(save_dir / "index.faiss"))

    # Save full chunk metadata (text + page_num + has_images)
    with open(save_dir / "chunks.json", "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False)

    metadata = {
        "class": class_name,
        "subject": subject,
        "book_name": book_name,
        "total_chunks": len(chunks),
        "index_name": safe_name,
        "total_pages": pdf_stats.get("total_pages", 0),
        "pages_with_images": pdf_stats.get("pages_with_images", 0),
        "total_images": pdf_stats.get("total_images", 0),
    }
    with open(save_dir / "metadata.json", "w") as f:
        json.dump(metadata, f)

    return safe_name


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: LOAD INDEX (FAISS + BM25 rebuilt + metadata)
# ─────────────────────────────────────────────────────────────────────────────
def load_index(index_name: str):
    save_dir = Path(INDEX_DIR) / index_name
    faiss_index = faiss.read_index(str(save_dir / "index.faiss"))

    with open(save_dir / "chunks.json", "r", encoding="utf-8") as f:
        chunks = json.load(f)

    with open(save_dir / "metadata.json", "r") as f:
        metadata = json.load(f)

    # Rebuild BM25 from chunks (fast, no need to persist — pure in-memory)
    bm25 = build_bm25_index(chunks)

    return faiss_index, chunks, bm25, metadata


def list_available_indexes() -> list:
    index_dir = Path(INDEX_DIR)
    if not index_dir.exists():
        return []
    available = []
    for folder in sorted(index_dir.iterdir()):
        meta_file = folder / "metadata.json"
        if meta_file.exists():
            with open(meta_file) as f:
                available.append(json.load(f))
    return available


def delete_index(index_name: str) -> bool:
    import shutil
    save_dir = Path(INDEX_DIR) / index_name
    if save_dir.exists():
        shutil.rmtree(save_dir)
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: HYBRID RETRIEVAL — FAISS + BM25 + RRF RERANKING
#
# ALGORITHM (Reciprocal Rank Fusion):
#   score(chunk) = Σ [weight_i / (RRF_K + rank_i)]
#
# WHY RRF over score averaging:
#   FAISS scores: [0.2, 0.9] range
#   BM25 scores: [0.0, 150.0] range  ← completely different scale!
#   Can't just average them. RRF uses RANK POSITIONS (1,2,3...) which are
#   always comparable regardless of score magnitude.
#
# A chunk in TOP 3 of both FAISS and BM25 = very high RRF score.
# A chunk in TOP 3 of only one = medium score.
# ─────────────────────────────────────────────────────────────────────────────
def hybrid_retrieve(query: str, faiss_index, chunks: list, bm25: BM25Okapi) -> tuple:
    # 1. FAISS vector search
    model = get_embedding_model()
    query_emb = model.encode([query], normalize_embeddings=True).astype("float32")
    faiss_scores, faiss_indices = faiss_index.search(query_emb, FAISS_TOP_K)
    faiss_scores = faiss_scores[0]
    faiss_indices = faiss_indices[0]
    best_vector_score = float(faiss_scores[0]) if len(faiss_scores) > 0 else 0.0

    # 2. BM25 keyword search
    query_tokens = query.lower().split()
    bm25_scores = bm25.get_scores(query_tokens)
    bm25_top_indices = np.argsort(bm25_scores)[::-1][:BM25_TOP_K]

    # 3. Reciprocal Rank Fusion
    rrf_scores: dict = {}

    for rank, chunk_idx in enumerate(faiss_indices):
        if chunk_idx < 0 or chunk_idx >= len(chunks):
            continue
        contribution = VECTOR_WEIGHT / (RRF_K + rank + 1)
        rrf_scores[int(chunk_idx)] = rrf_scores.get(int(chunk_idx), 0.0) + contribution

    for rank, chunk_idx in enumerate(bm25_top_indices):
        contribution = BM25_WEIGHT / (RRF_K + rank + 1)
        rrf_scores[int(chunk_idx)] = rrf_scores.get(int(chunk_idx), 0.0) + contribution

    sorted_indices = sorted(rrf_scores.keys(), key=lambda i: rrf_scores[i], reverse=True)
    top_indices = sorted_indices[:FINAL_TOP_K]

    # 4. Context window optimization
    top_chunks = [chunks[i] for i in top_indices if i < len(chunks)]

    # Sort by page number — gives LLM naturally ordered, coherent context
    top_chunks.sort(key=lambda c: c.get("page_num", 0))

    # Deduplicate overlapping chunks (chunk overlap can produce near-identical chunks)
    deduped = []
    seen_starts = set()
    for chunk in top_chunks:
        key = chunk["text"][:100].strip()
        if key not in seen_starts:
            deduped.append(chunk)
            seen_starts.add(key)

    return deduped, best_vector_score


# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: LLM GENERATION WITH PAGE CITATIONS
# ─────────────────────────────────────────────────────────────────────────────
def generate_answer(query: str, retrieved_chunks: list, book_name: str, groq_api_key: str) -> str:
    client = Groq(api_key=groq_api_key)

    # Build context with page number labels — LLM will cite these
    context_parts = []
    for i, chunk in enumerate(retrieved_chunks, 1):
        page_ref = f"[Page {chunk.get('page_num', '?')}]"
        diagram_note = " [DIAGRAM PAGE]" if chunk.get("has_images") else ""
        context_parts.append(f"--- Excerpt {i} {page_ref}{diagram_note} ---\n{chunk['text']}")
    context = "\n\n".join(context_parts)

    system_prompt = f"""You are a helpful educational assistant for students studying from the textbook: "{book_name}".

=== STRICT RULES — NEVER BREAK THESE ===

RULE 1: Answer ONLY using the provided context below. NEVER use external knowledge.

RULE 2: If the answer is NOT in the context, respond EXACTLY:
"❌ This information is not available in the book \"{book_name}\". Please check another chapter or resource."

RULE 3: NEVER guess or hallucinate. Only state what the context explicitly says.

RULE 4: Always cite page numbers at the end: "(Source: Page 12, Page 13)"
If a diagram page appears, mention: "📊 A diagram on Page X illustrates this concept."

RULE 5: Keep answers clear and student-friendly. Use bullet points or numbered steps when helpful.

=== CONTEXT FROM "{book_name}" ===

{context}

=== END CONTEXT — Answer using ONLY the above ==="""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ],
        temperature=0.05,
        max_tokens=1200
    )
    return response.choices[0].message.content


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
def answer_query(query: str, faiss_index, chunks: list, bm25: BM25Okapi, metadata: dict, groq_api_key: str) -> dict:
    """
    Full pipeline:
    1. Cache check → instant return if seen before
    2. Hybrid retrieval (FAISS + BM25 + RRF)
    3. Threshold filter (vector score < 0.25 = out of scope)
    4. LLM generation with page citations
    5. Cache store → future calls instant
    """
    index_name = metadata["index_name"]

    # Cache check
    cache_key = _cache_key(query, index_name)
    if cache_key in _query_cache:
        cached = _query_cache[cache_key].copy()
        cached["from_cache"] = True
        return cached

    # Hybrid retrieval
    retrieved_chunks, best_vector_score = hybrid_retrieve(query, faiss_index, chunks, bm25)

    # Threshold filter — vector score is the reliable off-topic signal
    if best_vector_score < SIMILARITY_THRESHOLD:
        result = {
            "answer": f'❌ This information is not available in the book "{metadata["book_name"]}". The query appears to be outside the scope of this material.',
            "score": best_vector_score,
            "chunks_used": 0,
            "source": "threshold_filter",
            "pages_referenced": [],
            "from_cache": False
        }
        _query_cache[cache_key] = result
        return result

    # LLM generation
    answer = generate_answer(query, retrieved_chunks, metadata["book_name"], groq_api_key)

    pages_referenced = sorted(set(c.get("page_num", 0) for c in retrieved_chunks if c.get("page_num")))

    result = {
        "answer": answer,
        "score": best_vector_score,
        "chunks_used": len(retrieved_chunks),
        "source": "llm",
        "pages_referenced": pages_referenced,
        "from_cache": False
    }
    _query_cache[cache_key] = result
    return result
