# main.py — FastAPI backend (updated for hybrid search pipeline)

import os
import sys
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()  # Loads GROQ_API_KEY from backend/.env automatically
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

import database as db
from rag_pipeline import (
    extract_text_from_pdf, chunk_pages, embed_texts,
    build_and_save_index, load_index, list_available_indexes,
    delete_index, answer_query
)
from config import CLASSES, SUBJECTS

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db.init_db()
    yield
    # Shutdown (if needed)

app = FastAPI(title="EduRAG API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory index cache: index_name → (faiss_index, chunks, bm25, metadata)
_index_cache: dict = {}


def get_groq_key(provided_key: str = "") -> str:
    """Get Groq API key: use provided key, else fallback to .env environment variable"""
    key = None
    
    # Priority 1: Use key from frontend if provided and not empty
    if provided_key and provided_key.strip():
        key = provided_key.strip()
        print(f"Using Groq API key from frontend", file=sys.stderr, flush=True)
    else:
        # Priority 2: Use key from .env file (backend)
        key = os.environ.get("GROQ_API_KEY", "").strip()
        if key:
            print(f"Using Groq API key from .env file", file=sys.stderr, flush=True)
    
    if not key:
        raise HTTPException(
            status_code=400, 
            detail="Groq API key not found. Set GROQ_API_KEY in .env or enter it on the upload page."
        )
    return key


# ── BOOK ENDPOINTS ────────────────────────────────────────────────────────────

@app.post("/api/books/process")
async def process_book(
    file: UploadFile = File(...),
    class_name: str = Form(...),
    subject: str = Form(...),
    book_name: str = Form(...),
):
    try:
        print(f"\n=== UPLOAD REQUEST RECEIVED ===", file=sys.stderr, flush=True)
        print(f"File: {file.filename}, Class: {class_name}, Subject: {subject}, Book: {book_name}", file=sys.stderr, flush=True)
        
        if not file.filename.endswith(".pdf"):
            print(f"ERROR: Not a PDF file: {file.filename}", file=sys.stderr, flush=True)
            raise HTTPException(status_code=400, detail="Only PDF files supported")

        pdf_bytes = await file.read()
        print(f"PDF bytes read: {len(pdf_bytes)} bytes", file=sys.stderr, flush=True)
        
        pages, pdf_stats = extract_text_from_pdf(pdf_bytes)
        print(f"Extraction complete: {len(pages)} pages extracted, text_length: {pdf_stats['text_length']}", file=sys.stderr, flush=True)

        if pdf_stats["text_length"] < 100:
            print(f"ERROR: Not enough text extracted: {pdf_stats['text_length']}", file=sys.stderr, flush=True)
            raise HTTPException(status_code=400, detail="Could not extract text. Use a text-based PDF, not a scanned image.")

        chunks = chunk_pages(pages)
        print(f"Chunking complete: {len(chunks)} chunks", file=sys.stderr, flush=True)
        
        texts = [c["text"] for c in chunks]
        print(f"Starting embedding generation for {len(texts)} chunks...", file=sys.stderr, flush=True)
        
        embeddings = embed_texts(texts)
        print(f"Embedding complete: shape {embeddings.shape}", file=sys.stderr, flush=True)

        index_name = build_and_save_index(
            chunks=chunks,
            embeddings=embeddings,
            class_name=class_name,
            subject=subject,
            book_name=book_name,
            pdf_stats=pdf_stats
        )
        print(f"Index saved: {index_name}", file=sys.stderr, flush=True)

        result = {
            "success": True,
            "index_name": index_name,
            "stats": {
                "total_pages": pdf_stats["total_pages"],
                "total_chunks": len(chunks),
                "pages_with_images": pdf_stats["pages_with_images"],
                "total_images": pdf_stats["total_images"],
                "text_length": pdf_stats["text_length"]
            }
        }
        print(f"Returning result: {result}", file=sys.stderr, flush=True)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"\nERROR in process_book: {str(e)}", file=sys.stderr, flush=True)
        print(error_msg, file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.get("/api/books")
def get_books():
    return list_available_indexes()


@app.delete("/api/books/{index_name}")
def remove_book(index_name: str):
    _index_cache.pop(index_name, None)
    if not delete_index(index_name):
        raise HTTPException(status_code=404, detail="Book not found")
    return {"success": True}


@app.get("/api/config")
def get_config():
    return {"classes": CLASSES, "subjects": SUBJECTS}


# ── QUERY ENDPOINT ────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str
    index_name: str
    groq_api_key: Optional[str] = ""


@app.post("/api/query")
def query_book(req: QueryRequest):
    groq_key = get_groq_key(req.groq_api_key)

    # Load from cache or disk
    if req.index_name not in _index_cache:
        try:
            faiss_index, chunks, bm25, metadata = load_index(req.index_name)
            _index_cache[req.index_name] = (faiss_index, chunks, bm25, metadata)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Book index not found: {e}")

    faiss_index, chunks, bm25, metadata = _index_cache[req.index_name]

    result = answer_query(
        query=req.query,
        faiss_index=faiss_index,
        chunks=chunks,
        bm25=bm25,
        metadata=metadata,
        groq_api_key=groq_key
    )

    # Save to history (skip cache hits to avoid duplicates)
    if not result.get("from_cache"):
        record_id = db.save_qa(
            query=req.query,
            answer=result["answer"],
            book_name=metadata["book_name"],
            class_name=metadata["class"],
            subject=metadata["subject"],
            score=result["score"],
            chunks_used=result["chunks_used"],
            source=result["source"]
        )
        result["id"] = record_id

    result["book_name"] = metadata["book_name"]
    result["class"] = metadata["class"]
    result["subject"] = metadata["subject"]
    return result


# ── HISTORY ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/api/history")
def get_history(limit: int = Query(50, le=200), offset: int = Query(0), book_name: Optional[str] = None):
    if book_name:
        return db.get_history_by_book(book_name)
    return db.get_all_history(limit=limit, offset=offset)


@app.delete("/api/history/{item_id}")
def delete_history(item_id: int):
    if not db.delete_history_item(item_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


@app.delete("/api/history")
def clear_history():
    return {"deleted": db.clear_all_history()}


@app.get("/api/stats")
def get_stats():
    return db.get_stats()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
