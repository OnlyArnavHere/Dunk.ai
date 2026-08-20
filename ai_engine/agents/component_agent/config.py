"""
CircuitMind Component Agent
Configuration
"""

import os

# ---------------------------------------------------------------------------
# OpenMP duplicate-runtime guard -- MUST run before faiss/torch are imported.
#
# NOT a generic "for stability" tweak. Do not remove, reorder, or "clean up"
# without reading this and re-running the repro below.
#
# Three packages here each bundle their own OpenMP runtime:
#     faiss/.dylibs/libomp.dylib      (libfaiss.dylib -> @loader_path/.dylibs/libomp.dylib)
#     torch/lib/libomp.dylib          (libtorch_cpu.dylib -> @rpath/libomp.dylib)
#     sklearn/.dylibs/libomp.dylib
#
# Loading two of them into one process on macOS/arm64 kills the supervisor
# pipeline at retrieval.py `_search_index` -> index.search(), on the FIRST
# component, every time. Two distinct failure modes, both fatal and NEITHER
# raising a Python exception -- so nothing upstream can catch or report them,
# and the pipeline dies writing no output at all:
#     * SIGABRT (exit 134) "OMP: Error #15: ... libomp.dylib already initialized"
#     * SIGSEGV (exit 139) in __kmp_suspend_initialize_thread
# Original incident: crash report Python-2026-08-20-130527.ips, PID 2230,
# 2026-08-20.
#
# Measured over 5 trials each, reproduced without the HF dataset (import torch
# + faiss, one matmul, one 200k x 384 IndexFlatIP search):
#     nothing set .................. 0/5 pass  (5x SIGABRT 134)
#     OMP_NUM_THREADS=1 alone ...... 0/5 pass  (5x SIGABRT 134)
#     KMP_DUPLICATE_LIB_OK alone ... 0/5 pass  (5x SIGSEGV 139)
#     both of the above ............ 5/5 pass
#     this combination below ....... 5/5 pass
# NEITHER SETTING WORKS ALONE. KMP_DUPLICATE_LIB_OK lets the second runtime
# load instead of aborting; capping faiss's threads stops the parallel region
# that then segfaults. Both halves are load-bearing.
#
# Set via os.environ rather than .env because OpenMP reads its config at
# library-load time, and load_dotenv() below runs after these imports -- a
# value in .env arrives far too late. setdefault() so a real environment
# value still wins.
#
# The thread cap is applied to faiss ONLY (faiss.omp_set_num_threads(1) after
# the imports), not via a global OMP_NUM_THREADS=1, so torch keeps full
# threading for embedding: measured torch_threads=4, faiss_threads=1.
# ---------------------------------------------------------------------------
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import io
import requests
import numpy as np
import pandas as pd
import faiss
import torch

# Second half of the OpenMP guard above -- see that comment block.
faiss.omp_set_num_threads(1)
from dotenv import load_dotenv
from huggingface_hub import hf_hub_url
load_dotenv() 
# =============================================================================
# Hugging Face Hub
# =============================================================================

HF_REPO_ID = "rayyanshk/dunkai"
HF_REPO_TYPE = "dataset"

# Private repo -> needs a token with read access.
# Set as an environment variable, never hardcode:
#   export HF_TOKEN="hf_xxxxxxxxxxxx"
HF_TOKEN = os.environ.get("HF_TOKEN_READ")

_HEADERS = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}

def _fetch_bytes(filename: str) -> bytes:
    """Stream a file's raw bytes from the HF dataset repo — nothing touches disk."""
    url = hf_hub_url(repo_id=HF_REPO_ID, filename=filename, repo_type=HF_REPO_TYPE)
    resp = requests.get(url, headers=_HEADERS)
    resp.raise_for_status()
    return resp.content

# =============================================================================
# Dataset (loaded fully in memory)
# =============================================================================

DATASET_DF = pd.read_parquet(io.BytesIO(_fetch_bytes("components_ml.parquet")))

EMBEDDINGS = np.load(io.BytesIO(_fetch_bytes("component_embeddings.npy")))

_index_bytes = _fetch_bytes("component_faiss.index")
FAISS_INDEX = faiss.deserialize_index(np.frombuffer(_index_bytes, dtype=np.uint8))

# =============================================================================
# Embedding Model
# =============================================================================

MODEL_NAME = "BAAI/bge-small-en-v1.5"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# =============================================================================
# Retrieval
# =============================================================================

TOP_K = 20

SIMILARITY_THRESHOLD = 0.70

BATCH_SIZE = 256

# =============================================================================
# Output
# =============================================================================

DEFAULT_QTY = 1

# =============================================================================
# Supported JSON Section
# =============================================================================

ARCHITECTURE_SECTION = "architecture_model"

# =============================================================================
# Logging
# =============================================================================

VERBOSE = True

# =============================================================================
# Gradio
# =============================================================================

APP_TITLE = "CircuitMind Component Agent"

APP_DESCRIPTION = """
AI-powered Electronic Component Selection Engine

Input:
Architecture Agent JSON

Output:
Bill of Materials (BOM)
"""

# =============================================================================

if VERBOSE:

    print("=" * 60)
    print("CircuitMind Component Agent")
    print("=" * 60)

    print(f"HF Repo: {HF_REPO_ID} (in-memory, no local cache)")

    print(f"\nDataset rows: {len(DATASET_DF)}")

    print(f"\nEmbeddings shape: {EMBEDDINGS.shape}")

    print(f"\nFAISS vectors: {FAISS_INDEX.ntotal}")

    print("\nModel")
    print(MODEL_NAME)

    print("\nDevice")
    print(DEVICE)

    print("=" * 60)