"""
Data Review Queue — Persists cross-reference warnings, hallucination rejections,
and data quality issues for weekly review.

Attempts to write to Supabase `data_review_queue` table first.
Falls back to a local JSONL file if the table doesn't exist yet.
"""
import os
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger("dtl-scraper")

REVIEW_LOG_PATH = os.getenv("REVIEW_LOG_PATH", "/app/data_review_queue.jsonl")


def _write_to_supabase(supabase, entry: dict) -> bool:
    """Try to insert into the Supabase data_review_queue table."""
    try:
        supabase.table("data_review_queue").insert(entry).execute()
        return True
    except Exception as e:
        # Table likely doesn't exist yet — fall through to file
        logger.debug(f"Supabase review queue insert failed (expected if table missing): {e}")
        return False


def _write_to_file(entry: dict):
    """Append to local JSONL file as fallback."""
    try:
        with open(REVIEW_LOG_PATH, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")
    except Exception as e:
        logger.error(f"Failed to write to review log file: {e}")


def queue_review(
    supabase,
    venue_id: str,
    venue_name: str,
    review_type: str,
    title: str,
    severity: str = "info",
    details: dict = None,
):
    """
    Queue a data quality issue for weekly review.

    review_type: one of
        - cross_reference_mismatch
        - hallucination_rejected
        - price_variance
        - stale_url
        - scrape_failure
        - manual_flag

    severity: info | warning | critical
    """
    entry = {
        "venue_id": venue_id,
        "venue_name": venue_name,
        "review_type": review_type,
        "severity": severity,
        "title": title,
        "details": details or {},
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if not _write_to_supabase(supabase, entry):
        _write_to_file(entry)

    logger.info(f"[REVIEW QUEUED] [{severity.upper()}] {venue_name}: {title}")


def get_pending_reviews(supabase, limit: int = 50) -> list:
    """Fetch pending review items for the weekly audit."""
    try:
        result = (
            supabase.table("data_review_queue")
            .select("*")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception:
        # Fall back to reading the local file
        try:
            items = []
            with open(REVIEW_LOG_PATH, "r") as f:
                for line in f:
                    item = json.loads(line.strip())
                    if item.get("status") == "pending":
                        items.append(item)
            return items[-limit:]
        except FileNotFoundError:
            return []


def get_review_summary(supabase) -> dict:
    """Get a summary of the review queue for the weekly audit."""
    items = get_pending_reviews(supabase, limit=500)

    summary = {
        "total_pending": len(items),
        "by_severity": {},
        "by_type": {},
        "by_venue": {},
    }

    for item in items:
        sev = item.get("severity", "info")
        rtype = item.get("review_type", "unknown")
        venue = item.get("venue_name", "unknown")

        summary["by_severity"][sev] = summary["by_severity"].get(sev, 0) + 1
        summary["by_type"][rtype] = summary["by_type"].get(rtype, 0) + 1
        summary["by_venue"][venue] = summary["by_venue"].get(venue, 0) + 1

    return summary
