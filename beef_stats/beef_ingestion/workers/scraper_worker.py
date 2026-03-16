# workers/scraper_worker.py
from datetime import datetime, timezone

from threading import Event

from PySide6.QtCore import QObject, Signal

from scraper.cornell_scraper import ScrapeResult, scrape_cornell
from db.db_manager import (
    get_connection,
    insert_file_record,
    ensure_table_exists,
    fetch_existing_urls,
)

class ScraperWorker(QObject):
    finished = Signal()
    progress = Signal(str)
    state_updated = Signal(str, dict)

    def __init__(self, url: str, table: str, operation: str = "pull"):
        super().__init__()
        self.url = url
        self.table = table
        self.operation = operation
        self._cancel_event = Event()

    def request_cancel(self) -> None:
        """Signal that the current job should be cancelled."""
        self._cancel_event.set()

    def run(self):
        conn = None
        cancelled = False
        try:
            self.progress.emit(
                f"{self.operation.title()} starting for table '{self.table}' from {self.url}"
            )

            if self._cancel_event.is_set():
                cancelled = True
                return

            conn = get_connection()

            # 🔹 ensure table exists under beef_data schema
            ddl_path = ensure_table_exists(conn, self.table)
            self.progress.emit(
                f"Ensured table 'beef_data.{self.table}' exists (wrote {ddl_path.name})"
            )

            existing_urls = fetch_existing_urls(conn, self.table)
            self.progress.emit(
                f"Detected {len(existing_urls)} existing file(s) for '{self.table}'"
            )

            if self._cancel_event.is_set():
                cancelled = True
                return

            scrape_result: ScrapeResult = scrape_cornell(
                self.url, known_urls=existing_urls
            )
            pdf_items = scrape_result.items  # [(url, release_date), ...]

            self.progress.emit(
                f"Fetched {len(pdf_items)} candidate file(s) across "
                f"{scrape_result.pages_visited} page(s)"
            )

            if scrape_result.stopped_due_to_known and scrape_result.stop_url:
                self.progress.emit(
                    "Encountered known file; stopping pagination at "
                    f"{scrape_result.stop_url}"
                )

            # Deduplicate while preserving order
            seen = set()
            inserted = 0
            for pdf_url, release_date in pdf_items:
                if self._cancel_event.is_set():
                    cancelled = True
                    break

                if pdf_url in seen:
                    continue
                seen.add(pdf_url)

                # Normalize release_date string -> Python date
                try:
                    report_date = datetime.fromisoformat(
                        release_date.split("T")[0]
                    ).date()
                except Exception:
                    self.progress.emit(f"⚠️ Skipping malformed date: {release_date}")
                    continue

                # Insert into DB
                insert_file_record(conn, self.table, pdf_url, report_date)
                if pdf_url not in existing_urls:
                    inserted += 1
                existing_urls.add(pdf_url)
                self.progress.emit(f"Inserted (if new): {pdf_url} ({report_date})")

            if cancelled:
                return

            self.progress.emit(f"✅ Inserted {inserted} new file(s)")

            last_known_url = (
                pdf_items[0][0]
                if pdf_items
                else scrape_result.stop_url
            )
            self.state_updated.emit(
                self.table,
                {
                    "url": self.url,
                    "last_page": scrape_result.pages_visited,
                    "last_seen_url": last_known_url,
                    "last_operation": self.operation,
                    "last_run_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            self.progress.emit(f"❌ Error: {e}")
        finally:
            if conn:
                conn.close()
            if cancelled:
                self.progress.emit(
                    f"⏹️ {self.operation.title()} cancelled for table '{self.table}'"
                )
            self.finished.emit()
