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
import time
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

# (connect, read) seconds. The read budget is generous because these payloads are
# large -- the parquet and the embeddings are hundreds of MB -- but it is FINITE,
# which is the entire point: see the comment in _fetch_bytes.
_FETCH_TIMEOUT = (10, 120)
_FETCH_ATTEMPTS = 3
_FETCH_BACKOFF_SECONDS = 5


def _cache_path(filename: str):
    """Local cache location for `filename`, or None when caching is off.

    OPT-IN and off by default: with DUNKAI_HF_CACHE unset, _fetch_bytes behaves
    exactly as before and nothing touches disk.

    It exists because the no-cache design has a hard failure mode on a slow or
    lossy link. These payloads total ~850MB (parquet 93MB, embeddings 754MB,
    index), they are re-fetched on every process start, and a plain
    `requests.get` has no resume. Observed here three times in one run:

        Component Agent failed: HF fetch of 'component_embeddings.npy' failed
        after 3 attempts: ('Connection broken: IncompleteRead(509219477 bytes
        read, 244793835 more expected)')

    The existing retry cannot help, because each attempt restarts from byte 0 —
    so a link that cannot hold ~754MB open will never succeed, no matter how
    many attempts are allowed. The cache is populated out-of-band by a resumable
    downloader (huggingface_hub.hf_hub_download), which is what makes the run
    reproducible on a connection that drops.
    """
    root = os.environ.get("DUNKAI_HF_CACHE")
    if not root:
        return None
    from pathlib import Path

    return Path(root).expanduser() / filename


def _fetch_bytes(filename: str) -> bytes:
    """Stream a file's raw bytes from the HF dataset repo — nothing touches disk.

    The timeout is load-bearing, not defensive boilerplate. This call previously
    had none, and `requests` with no timeout blocks forever. Against this HF
    stream that produced two different symptoms of one bug:

      * a surfaced error -- ConnectionResetError(54, 'Connection reset by peer')
        mid-transfer, which the pipeline reported honestly and recovered from;
      * a silent freeze -- the peer half-closed (socket left in CLOSE_WAIT) and
        the read blocked indefinitely. Observed twice, once for 24 minutes and
        once for 2h48m, both at 0% CPU with RSS flat, log stuck on the line
        before the fetch. Nothing timed out, nothing errored, nothing logged.

    A hang is strictly worse than a failure: it cannot be retried, reported, or
    even distinguished from slow progress without inspecting the process. With a
    finite read timeout the second symptom collapses into the first, and the
    retry below then covers the transient case.
    """
    cached = _cache_path(filename)
    if cached is not None and cached.is_file() and cached.stat().st_size > 0:
        print(f"HF cache hit: {filename} ({cached.stat().st_size:,} bytes)")
        return cached.read_bytes()

    url = hf_hub_url(repo_id=HF_REPO_ID, filename=filename, repo_type=HF_REPO_TYPE)

    last_error: Exception | None = None
    for attempt in range(1, _FETCH_ATTEMPTS + 1):
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=_FETCH_TIMEOUT)
            resp.raise_for_status()
            return resp.content
        except requests.exceptions.RequestException as exc:
            # The BASE class on purpose, not an enumerated tuple. This previously
            # caught (Timeout, ConnectionError, HTTPError) and a real run still
            # escaped it: a transfer that dies mid-body surfaces from
            # `resp.content` as ChunkedEncodingError, which is a SIBLING of those
            # three under RequestException, not a subclass of any of them -- so it
            # bypassed the retry entirely and killed the Component Agent on a
            # failure that was plainly transient:
            #     Connection broken: IncompleteRead(393355889 bytes read,
            #                                       360657423 more expected)
            # Observed 2026-08-25 on a ~754MB parquet fetch. Enumerating one more
            # type would just move the whack-a-mole one square over; the base class
            # ends it. The status check below is what keeps the widening safe --
            # anything definitively client-side still re-raises on attempt 1.
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status is not None and 400 <= status < 500 and status != 429:
                raise
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status is not None and 400 <= status < 500 and status != 429:
                raise
            last_error = exc
            if attempt < _FETCH_ATTEMPTS:
                delay = _FETCH_BACKOFF_SECONDS * attempt
                print(
                    f"HF fetch of {filename!r} failed ({type(exc).__name__}: {exc}); "
                    f"retrying in {delay}s [attempt {attempt}/{_FETCH_ATTEMPTS}]"
                )
                time.sleep(delay)

    raise RuntimeError(
        f"HF fetch of {filename!r} failed after {_FETCH_ATTEMPTS} attempts: {last_error}"
    ) from last_error

# =============================================================================
# Dataset (loaded fully in memory)
# =============================================================================

DATASET_DF = pd.read_parquet(io.BytesIO(_fetch_bytes("components_ml.parquet")))

EMBEDDINGS = np.load(io.BytesIO(_fetch_bytes("component_embeddings.npy")))

_index_bytes = _fetch_bytes("component_faiss.index")
FAISS_INDEX = faiss.deserialize_index(np.frombuffer(_index_bytes, dtype=np.uint8))

# Release the serialised copy. `_index_bytes` is a MODULE-level name, so without
# this it stays reachable for the life of the process — 754MB held after the only
# thing that needed it has finished.
#
# This is not micro-optimisation. Loading this module needs the parquet
# DataFrame, a 754MB embeddings array and a 754MB index live at once, and on a
# 16GB machine with ~5GB free that allocation failed outright:
#
#     ERROR | Component Agent failed: std::bad_alloc
#
# faiss raises that from C++, so it is not a MemoryError and nothing upstream
# catches it as one; the Component Agent simply reports failure and the BOM,
# EDA and PCB nodes then fail in turn for want of rows.
del _index_bytes

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