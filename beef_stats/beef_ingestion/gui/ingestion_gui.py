import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QTextCursor
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout,
    QHBoxLayout, QLabel, QLineEdit, QPushButton,
    QCheckBox, QComboBox, QGroupBox, QPlainTextEdit
)

if TYPE_CHECKING:
    from PySide6.QtCore import QThread
    from workers.scraper_worker import ScraperWorker


class _QtStream(QObject):
    """Redirects writes to a Qt signal while mirroring an original stream."""

    message_written = Signal(str)

    def __init__(self, original_stream):
        super().__init__()
        self._original_stream = original_stream

    def write(self, message: str) -> None:
        if self._original_stream is not None:
            self._original_stream.write(message)
        if message:
            self.message_written.emit(message)

    def flush(self) -> None:
        if self._original_stream is not None:
            self._original_stream.flush()


class IngestionUI(QWidget):
    _TABLE_HISTORY_PATH = (
        Path(__file__).resolve().parent.parent / "db" / "table_history.json"
    )

    def __init__(self):
        super().__init__()
        self.setWindowTitle("David's Ingestion")
        self.setMaximumWidth(1920)
        self.setMinimumWidth(1000)
        self.setMinimumHeight(700)
        self.setMaximumHeight(1080)

        # 🔹 Forward-declared types
        self._thread: "QThread | None" = None
        self._worker: "ScraperWorker | None" = None

        main_layout = QVBoxLayout(self)

        # Url Input
        url_layout = QHBoxLayout()
        url_label = QLabel("URL")
        self.url_input = QLineEdit()
        url_layout.addWidget(url_label)
        url_layout.addWidget(self.url_input)

        # File Type Checkboxes
        file_layout = QHBoxLayout()
        file_label = QLabel("File Type")
        self.pdf_cb = QCheckBox("PDF")
        self.txt_cb = QCheckBox("TXT")
        self.csv_cb = QCheckBox("CSV")
        file_layout.addWidget(file_label)
        file_layout.addWidget(self.pdf_cb)
        file_layout.addWidget(self.txt_cb)
        file_layout.addWidget(self.csv_cb)

        # Table Name
        table_layout = QHBoxLayout()
        table_label = QLabel("Table")
        self.table_input = QLineEdit()
        table_layout.addWidget(table_label)
        table_layout.addWidget(self.table_input)

        # Pull Button
        self.pull_button = QPushButton("Pull")

        # Update dropdown
        update_layout = QHBoxLayout()
        self.update_button = QPushButton("Update")
        self.update_dropdown = QComboBox()
        self.update_dropdown.addItem("Update All")
        update_layout.addWidget(self.update_button)
        update_layout.addWidget(self.update_dropdown)

        # Track table history for the update dropdown
        self._table_history: dict[str, dict[str, Any]] = {}

        # Grouping box
        group = QGroupBox("David's Ingestion")
        group_layout = QVBoxLayout()
        group_layout.addLayout(url_layout)
        group_layout.addLayout(file_layout)
        group_layout.addLayout(table_layout)
        group_layout.addWidget(self.pull_button)
        group_layout.addLayout(update_layout)

        # Status label
        self.status_label = QLabel("Ready")
        group_layout.addWidget(self.status_label)

        # Scrollable log output
        self.log_output = QPlainTextEdit()
        self.log_output.setReadOnly(True)
        self.log_output.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)  # ✅ correct enum
        group_layout.addWidget(self.log_output)

        group.setLayout(group_layout)
        main_layout.addWidget(group)

        # Redirect stdout/stderr to the GUI log
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._stdout_stream = _QtStream(self._original_stdout)
        self._stderr_stream = _QtStream(self._original_stderr)
        self._stdout_stream.message_written.connect(self.append_log)
        self._stderr_stream.message_written.connect(self.append_log)
        sys.stdout = self._stdout_stream
        sys.stderr = self._stderr_stream

        self._load_table_history()
        self._refresh_update_controls()

    def append_log(self, message: str) -> None:
        if not message:
            return
        cursor = self.log_output.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)  # ✅ correct enum
        cursor.insertText(message)
        self.log_output.setTextCursor(cursor)
        self.log_output.ensureCursorVisible()

    def handle_progress(self, message: str) -> None:
        self.status_label.setText(message)
        self.append_log(f"{message}\n")

    def remember_table(self, table_name: str, url: str) -> None:
        """Persist a table + URL pair and expose it in the update dropdown."""

        table = table_name.strip()
        source_url = url.strip()
        if not table or not source_url:
            return

        metadata = self._table_history.get(table, {})
        metadata["url"] = source_url
        self._table_history[table] = metadata

        if self.update_dropdown.findText(table) == -1:
            self.update_dropdown.addItem(table)

        self._save_table_history()
        self._refresh_update_controls()

    def record_table_state(self, table_name: str, metadata: dict[str, Any]) -> None:
        table = table_name.strip()
        if not table:
            return

        current = self._table_history.get(table, {})
        current.update({k: v for k, v in metadata.items() if v is not None})
        self._table_history[table] = current

        if self.update_dropdown.findText(table) == -1:
            self.update_dropdown.addItem(table)

        self._save_table_history()
        self._refresh_update_controls()

    def get_table_url(self, table_name: str) -> str | None:
        table = table_name.strip()
        if not table:
            return None
        metadata = self._table_history.get(table, {})
        url = metadata.get("url")
        if isinstance(url, str) and url.strip():
            return url.strip()
        return None

    def get_tracked_tables(self) -> list[str]:
        return list(self._table_history.keys())

    def set_busy(self, busy: bool) -> None:
        self.pull_button.setEnabled(not busy)
        self.update_dropdown.setEnabled(not busy)
        if busy:
            self.update_button.setEnabled(False)
        else:
            self._refresh_update_controls()

    def closeEvent(self, event):  # type: ignore[override]
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr
        super().closeEvent(event)

    def _load_table_history(self) -> None:
        if not self._TABLE_HISTORY_PATH.exists():
            return

        try:
            with self._TABLE_HISTORY_PATH.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:  # pragma: no cover - best effort logging
            self.append_log(f"⚠️ Could not load table history: {exc}\n")
            return

        parsed: dict[str, dict[str, Any]] = {}
        if isinstance(data, list):  # legacy format
            for table in data:
                if isinstance(table, str) and table.strip():
                    parsed[table.strip()] = {}
        elif isinstance(data, dict):
            for table, metadata in data.items():
                if isinstance(table, str) and table.strip():
                    parsed[table.strip()] = metadata if isinstance(metadata, dict) else {}
        else:
            self.append_log("⚠️ Table history file malformed; ignoring.\n")
            return

        self._table_history = parsed

        for table in self._table_history:
            if self.update_dropdown.findText(table) == -1:
                self.update_dropdown.addItem(table)

    def _save_table_history(self) -> None:
        try:
            self._TABLE_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
            with self._TABLE_HISTORY_PATH.open("w", encoding="utf-8") as fh:
                json.dump(self._table_history, fh, indent=2)
        except Exception as exc:  # pragma: no cover - best effort logging
            self.append_log(f"⚠️ Could not save table history: {exc}\n")

    def _refresh_update_controls(self) -> None:
        has_targets = any(
            isinstance(meta.get("url"), str) and meta.get("url").strip()
            for meta in self._table_history.values()
        )
        self.update_button.setEnabled(has_targets)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = IngestionUI()
    window.show()
    sys.exit(app.exec())
