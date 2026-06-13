# config.py — All constants

GROQ_MODEL = "llama-3.3-70b-versatile"

# Chunking — tuned for large textbooks (300+ pages)
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Hybrid search settings
FAISS_TOP_K = 20        # Retrieve more candidates initially for reranking
BM25_TOP_K = 20         # BM25 also fetches top-20
FINAL_TOP_K = 6         # After RRF reranking, use top-6 for LLM context
RRF_K = 60              # RRF smoothing constant (standard value)

# WHY 0.25 for hybrid: Slightly lower threshold because BM25+FAISS combined
# is already more precise — fewer false positives
SIMILARITY_THRESHOLD = 0.25

# Hybrid search weight: how much to weight vector vs keyword
# 0.6 vector + 0.4 BM25 — semantic slightly more important than keyword
VECTOR_WEIGHT = 0.6
BM25_WEIGHT = 0.4

CLASSES = [str(i) for i in range(1, 13)]

SUBJECTS = [
    "Mathematics", "Science", "Physics", "Chemistry", "Biology",
    "English", "Hindi", "History", "Geography", "Civics",
    "Economics", "Computer Science", "Political Science",
    "Accountancy", "Business Studies", "Sanskrit", "Other"
]

INDEX_DIR = "indexes"
DB_PATH = "edurag.db"
