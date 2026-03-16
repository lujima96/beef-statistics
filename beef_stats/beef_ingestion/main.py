import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QThread

from gui.ingestion_gui import IngestionUI
from workers.scraper_worker import ScraperWorker   # ✅ now using worker

def main():
    app = QApplication(sys.argv)

    window = IngestionUI()

    pending_jobs: list[tuple[str, str, str]] = []  # (url, table, operation)
    shutting_down = False

    def start_next_job() -> None:
        nonlocal pending_jobs, shutting_down

        if shutting_down or not pending_jobs:
            if shutting_down:
                window.status_label.setText("Shutting down…")
            else:
                window.status_label.setText("Ready")
            window.set_busy(False)
            return

        url, table, operation = pending_jobs.pop(0)

        thread = QThread()
        worker = ScraperWorker(url, table, operation)
        worker.moveToThread(thread)

        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)

        worker.progress.connect(window.handle_progress)
        worker.state_updated.connect(window.record_table_state)

        def _cleanup() -> None:
            window._thread = None
            window._worker = None
            if shutting_down:
                window.set_busy(False)
                window.status_label.setText("Shutting down…")
            else:
                start_next_job()

        thread.finished.connect(_cleanup)

        window._thread = thread
        window._worker = worker

        window.set_busy(True)
        window.status_label.setText(
            f"{operation.title()} in progress for table '{table}'"
        )
        thread.start()

    def queue_jobs(jobs: list[tuple[str, str, str]]) -> None:
        nonlocal pending_jobs, shutting_down
        if shutting_down or not jobs:
            return

        pending_jobs.extend(jobs)

        if window._thread is None:
            start_next_job()

    # ────────── Wire up "Pull" button with QThread ──────────
    def on_pull_clicked() -> None:
        url = window.url_input.text().strip()
        table = window.table_input.text().strip() or "usda_files"

        if not url:
            window.status_label.setText("⚠️ No URL entered")
            return

        window.remember_table(table, url)
        queue_jobs([(url, table, "pull")])

    def on_update_clicked() -> None:
        selection = window.update_dropdown.currentText()

        if selection == "Update All":
            jobs: list[tuple[str, str, str]] = []
            for table in window.get_tracked_tables():
                table_url = window.get_table_url(table)
                if table_url:
                    jobs.append((table_url, table, "update"))
                else:
                    window.handle_progress(
                        f"⚠️ Skipping '{table}' — no source URL recorded."
                    )

            if not jobs:
                window.status_label.setText("⚠️ No tables available for update")
                return

            queue_jobs(jobs)
            return

        table = selection.strip()
        if not table:
            window.status_label.setText("⚠️ No table selected for update")
            return

        table_url = window.get_table_url(table)
        if not table_url:
            window.status_label.setText(
                f"⚠️ No URL stored for '{table}'. Run a pull first."
            )
            return

        queue_jobs([(table_url, table, "update")])

    window.pull_button.clicked.connect(on_pull_clicked)
    window.update_button.clicked.connect(on_update_clicked)

    def shutdown() -> None:
        nonlocal shutting_down, pending_jobs
        if shutting_down:
            return

        shutting_down = True
        pending_jobs.clear()

        worker = window._worker
        thread = window._thread

        if worker is not None:
            worker.request_cancel()

        if thread is not None:
            thread.requestInterruption()
            thread.quit()
            if not thread.wait(5000):
                thread.terminate()
                thread.wait()

        window._thread = None
        window._worker = None
        window.set_busy(False)
        window.status_label.setText("Shutting down…")

    window.show()
    app.aboutToQuit.connect(shutdown)
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
