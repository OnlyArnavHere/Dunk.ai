"""
retrieval.py
...
"""

from __future__ import annotations

import logging
from typing import Dict, List, Any, Tuple
import json
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

from config import (
    DATASET_DF,
    EMBEDDINGS,
    FAISS_INDEX,
    MODEL_NAME,
    DEVICE,
    TOP_K,
    SIMILARITY_THRESHOLD,
)

# ---------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(message)s"
)

logger = logging.getLogger(__name__)

import config as _config

CATEGORY_RESOLUTION_TOP_N = getattr(_config, "CATEGORY_RESOLUTION_TOP_N", 5)
CATEGORY_RESOLUTION_MIN_SIMILARITY = getattr(
    _config, "CATEGORY_RESOLUTION_MIN_SIMILARITY", 0.35
)


class ComponentRetriever:

    def __init__(self):

        logger.info("Initializing Component Retriever...")

        # These are already loaded once in config.py at import time —
        # no disk/network access happens here anymore.
        self.dataset = DATASET_DF
        self.embeddings = EMBEDDINGS
        self.index = FAISS_INDEX

        self.model = self._load_embedding_model()

        (
            self.category_labels,
            self.category_embeddings,
            self.category_row_counts,
        ) = self._build_category_index()

        logger.info("Retriever initialized successfully.")

    # ------------------------------------------------------------------
    # Embedding Model
    # ------------------------------------------------------------------

    def _load_embedding_model(self):
        logger.info("Loading embedding model: %s", MODEL_NAME)
        model = SentenceTransformer(MODEL_NAME, device=DEVICE)
        logger.info("Embedding model loaded.")
        return model

    # ------------------------------------------------------------------
    # Dynamic Category Index
    # ------------------------------------------------------------------

    def _build_category_index(self) -> Tuple[List[str], np.ndarray, np.ndarray]:
        """Build the taxonomy label index, merging case-variant duplicates.

        The catalogue carries the SAME label under several casings -- 46 groups
        of them, including 'Inductors/Coils/Transformers'(24259) vs
        'inductors/coils/transformers'(1), 'Switches'(11471) vs 'switches'(1),
        and 'Pre-ordered MCUs'(1029) vs 'Pre-Ordered MCUs'(2). Deduping on the
        exact string (the previous behaviour) kept both, and because their
        embeddings are near-identical they rank adjacently -- so one concept
        consumed TWO slots of a top-N window. The MCU query lost four of its
        top ten slots to two such pairs.

        Merging is safe because the only consumer that MATCHES on these strings
        (_filter_candidates) already lowercases both sides, so a canonical
        'WiFi Modules' still matches a candidate labelled 'WIFI Modules'. The
        canonical casing is therefore cosmetic; it is chosen as the variant
        covering the most rows so the label shown in logs and in the query's
        "Likely taxonomy:" line is the one that actually describes the
        catalogue.

        Row counts are summed across merged variants and returned alongside, so
        callers can weigh how much catalogue a label actually covers.
        """
        counts: Dict[str, int] = {}
        for column in ("category", "subcategory"):
            if column not in self.dataset.columns:
                continue
            series = self.dataset[column].dropna().astype(str).str.strip()
            for label, n in series.value_counts().items():
                if label:
                    counts[label] = counts.get(label, 0) + int(n)

        # Group by casefolded form; one canonical entry per concept.
        groups: Dict[str, List[str]] = {}
        for label in counts:
            groups.setdefault(label.lower(), []).append(label)

        unique_labels: List[str] = []
        row_counts: List[int] = []
        for key in sorted(groups):
            variants = groups[key]
            # Most-covered variant wins; the label itself breaks ties so the
            # choice is deterministic across runs.
            canonical = max(variants, key=lambda v: (counts[v], v))
            unique_labels.append(canonical)
            row_counts.append(sum(counts[v] for v in variants))

        merged = sum(len(v) - 1 for v in groups.values())
        if merged:
            logger.info(
                "Taxonomy index: merged %d case-variant label(s) into their "
                "canonical form (%d concepts from %d raw labels).",
                merged, len(unique_labels), len(counts),
            )

        if not unique_labels:
            logger.warning(
                "No category/subcategory values found in dataset -- "
                "category resolution will be a no-op."
            )
            return (
                [],
                np.zeros((0, self.embeddings.shape[1]), dtype=np.float32),
                np.zeros((0,), dtype=np.int64),
            )

        logger.info(
            "Building category index over %d unique taxonomy labels...",
            len(unique_labels)
        )

        label_embeddings = self.model.encode(
            unique_labels,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        ).astype(np.float32)

        return unique_labels, label_embeddings, np.asarray(row_counts, dtype=np.int64)

    def _resolve_category(
        self,
        text: str,
        top_n: int = CATEGORY_RESOLUTION_TOP_N,
        min_similarity: float = CATEGORY_RESOLUTION_MIN_SIMILARITY,
    ) -> List[str]:

        if not text or not text.strip() or len(self.category_labels) == 0:
            return []

        query_embedding = self._embed_query(text)[0]

        similarities = self.category_embeddings @ query_embedding

        top_indices = np.argsort(-similarities)[:top_n]

        resolved = [
            self.category_labels[i]
            for i in top_indices
            if similarities[i] >= min_similarity
        ]

        logger.debug("Resolved '%s' -> %s", text, resolved)

        return resolved

    # ------------------------------------------------------------------
    # Query Builder
    # ------------------------------------------------------------------

    def _build_query(self, request: Dict[str, Any]) -> str:

        parts: List[str] = []

        subsystem = request.get("subsystem")
        category = request.get("category")
        component_type = request.get("type")

        interfaces = request.get("interfaces", [])
        power_interfaces = request.get("power_interfaces", [])
        connections = request.get("connections", [])

        if subsystem:
            parts.append(subsystem)

        if category:
            parts.append(f"Category: {category}")

        if component_type:
            parts.append(f"Type: {component_type}")

        if interfaces:
            parts.append("Interfaces: " + ", ".join(interfaces))

        if power_interfaces:
            parts.append("Power interfaces: " + ", ".join(power_interfaces))

        resolved_categories = self._resolve_category(
            f"{subsystem or ''} {category or ''}".strip()
        )
        if resolved_categories:
            parts.append("Likely taxonomy: " + ", ".join(resolved_categories[:3]))

        if connections:
            neighbour_descriptions = [
                f"{c.get('subsystem')} via {c.get('interface')}"
                for c in connections
                if c.get("subsystem") and c.get("interface")
            ]
            if neighbour_descriptions:
                parts.append("Connected to: " + "; ".join(neighbour_descriptions))

        query = "\n".join(parts)

        logger.debug("Semantic Query:\n%s", query)

        return query

    # ------------------------------------------------------------------
    # Query Embedding
    # ------------------------------------------------------------------

    def _embed_query(self, query: str) -> np.ndarray:
        embedding = self.model.encode(
            query,
            normalize_embeddings=True,
            convert_to_numpy=True
        )
        embedding = embedding.astype(np.float32)
        return embedding.reshape(1, -1)

    # ------------------------------------------------------------------
    # FAISS Search
    # ------------------------------------------------------------------

    def _search_index(self, embedding: np.ndarray, top_k: int = TOP_K):
        distances, indices = self.index.search(embedding, top_k)
        return distances[0], indices[0]

    # ------------------------------------------------------------------
    # Candidate Extraction
    # ------------------------------------------------------------------

    def _get_candidates(self, indices, similarities):

        candidates = []

        indices = np.asarray(indices).flatten()
        similarities = np.asarray(similarities).flatten()

        for idx, score in zip(indices, similarities):

            idx = int(idx)

            candidate = self.dataset.iloc[idx].to_dict()

            extra = candidate.get("extra_params")

            if isinstance(extra, str):
                try:
                    candidate["extra_params"] = json.loads(extra)
                except Exception:
                    candidate["extra_params"] = {}
            else:
                candidate["extra_params"] = {}

            candidate["similarity_score"] = float(score)

            candidates.append(candidate)

        return candidates

    # ------------------------------------------------------------------
    # Candidate Filtering
    # ------------------------------------------------------------------

    def _filter_candidates(
        self,
        candidates: List[Dict[str, Any]],
        request: Dict[str, Any]
    ) -> List[Dict[str, Any]]:

        request_category = request.get("category", "").strip().lower()

        if not request_category:
            return candidates

        literal_matches = [
            c for c in candidates
            if request_category in str(c.get("category", "")).lower()
        ]
        if literal_matches:
            logger.info(
                "Filtered to %d candidates via literal category match '%s'.",
                len(literal_matches), request_category,
            )
            return literal_matches

        resolved = self._resolve_category(
            f"{request.get('subsystem', '')} {request_category}".strip()
        )
        if resolved:
            resolved_lower = {r.lower() for r in resolved}
            semantic_matches = [
                c for c in candidates
                if str(c.get("category", "")).lower() in resolved_lower
                or str(c.get("subcategory", "")).lower() in resolved_lower
            ]
            if semantic_matches:
                logger.info(
                    "Filtered to %d candidates via resolved taxonomy %s.",
                    len(semantic_matches), resolved,
                )
                return semantic_matches

        logger.warning(
            "Category '%s' matched 0 candidates literally or via resolved "
            "taxonomy %s -- falling back to unfiltered semantic results "
            "(ranking will score relevance).",
            request_category, resolved,
        )
        return candidates

    # ------------------------------------------------------------------
    # Public Retrieval API
    # ------------------------------------------------------------------

    def retrieve(self, request: Dict[str, Any]) -> Dict[str, Any]:

        logger.info("Retrieving component for %s", request.get("subsystem"))

        query = self._build_query(request)

        embedding = self._embed_query(query)

        distances, indices = self._search_index(embedding)

        candidates = self._get_candidates(indices, distances)

        candidates = self._filter_candidates(candidates, request)

        return {
            "request": request,
            "query": query,
            "candidate_count": len(candidates),
            "candidates": candidates
        }

    # ------------------------------------------------------------------
    # Batch Retrieval
    # ------------------------------------------------------------------

    def retrieve_all(self, requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results = []
        for request in requests:
            results.append(self.retrieve(request))
        return results


if __name__ == "__main__":
    retriever = ComponentRetriever()

    request = {
        "reference": "U1",
        "type": "sensor",
        "subsystem": "Temperature Sensor",
        "category": "Sensor",
        "interfaces": ["I2C"],
        "power_interfaces": [],
        "connections": [],
    }

    result = retriever.retrieve(request)

    print("\nTop candidates:\n")

    for i, candidate in enumerate(result["candidates"][:5], start=1):
        print(f"{i}. {candidate['manufacturer']} - {candidate['mfr_part']}")
        print(f"   Similarity: {candidate['similarity_score']:.4f}")
        print(f"   {candidate['description']}\n")