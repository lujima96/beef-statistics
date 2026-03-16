"""Task orchestration for the beef statistics pipeline."""

from __future__ import annotations

import argparse
import concurrent.futures
import logging
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Mapping, Set

from . import fetch, links, load, transform

logging.basicConfig(level=logging.INFO, format="%(message)s")
ROOT_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Task:
    name: str
    group: str
    fn: Callable[[], None]
    depends_on: frozenset[str] = frozenset()


@dataclass
class TaskRunResult:
    name: str
    status: str
    changed: bool | None = None
    detail: str | None = None


TASKS: List[Task] = [
    Task("links.update_all", "links", links.update_all.run),
    Task("fetch.all_text", "fetch", fetch.text.run, frozenset({"links.update_all"})),
    Task("fetch.weather", "fetch", fetch.weather.run),
    Task("transform.raw_index", "transform", transform.raw_index.run, frozenset({"fetch.all_text"})),
    Task("transform.boxed_am", "transform", transform.boxed_am.run, frozenset({"fetch.all_text"})),
    Task("transform.boxed_pm", "transform", transform.boxed_pm.run, frozenset({"fetch.all_text"})),
    Task("transform.trimmings_am", "transform", transform.trimmings_am.run, frozenset({"fetch.all_text"})),
    Task("transform.trimmings_pm", "transform", transform.trimmings_pm.run, frozenset({"fetch.all_text"})),
    Task(
        "transform.catalog",
        "transform",
        transform.catalog.run,
        frozenset(
            {
                "transform.boxed_am",
                "transform.boxed_pm",
                "transform.trimmings_am",
                "transform.trimmings_pm",
            }
        ),
    ),
    Task(
        "load.schema",
        "load",
        load.schema.run,
        frozenset(
            {
                "links.update_all",
                "fetch.all_text",
                "transform.raw_index",
                "transform.boxed_am",
                "transform.boxed_pm",
                "transform.trimmings_am",
                "transform.trimmings_pm",
                "transform.catalog",
                "fetch.weather",
            }
        ),
    ),
    Task(
        "load.boxed_am",
        "load",
        load.boxed_am.run,
        frozenset({"transform.boxed_am", "load.schema"}),
    ),
    Task(
        "load.boxed_pm",
        "load",
        load.boxed_pm.run,
        frozenset({"transform.boxed_pm", "load.schema"}),
    ),
    Task(
        "load.catalog",
        "load",
        load.catalog.run,
        frozenset({"transform.catalog", "load.schema"}),
    ),
    Task(
        "load.index",
        "load",
        load.index.run,
        frozenset({"transform.raw_index", "load.schema"}),
    ),
    Task(
        "load.trimmings_am",
        "load",
        load.trimmings_am.run,
        frozenset({"transform.trimmings_am", "load.schema"}),
    ),
    Task(
        "load.trimmings_pm",
        "load",
        load.trimmings_pm.run,
        frozenset({"transform.trimmings_pm", "load.schema"}),
    ),
    Task(
        "load.weekly_retail",
        "load",
        load.weekly_retail.run,
        frozenset({"load.schema"}),
    ),
    Task(
        "load.weekly_boxed_beef",
        "load",
        load.weekly_boxed_beef.run,
        frozenset({"load.schema"}),
    ),
    Task(
        "load.national_temperature",
        "load",
        load.national_temperature.run,
        frozenset({"fetch.weather", "load.schema"}),
    ),
    Task(
        "load.diesel",
        "load",
        load.diesel.run,
        frozenset({"fetch.weather", "load.schema"}),
    ),
    Task(
        "load.weather_occurrences",
        "load",
        load.weather_occurrences.run,
        frozenset({"fetch.weather", "load.schema"}),
    ),
    Task(
        "load.feed_costs",
        "load",
        load.feed_costs.run,
        frozenset({"load.schema"}),
    ),
]

TASK_BY_NAME: Dict[str, Task] = {task.name: task for task in TASKS}
GROUP_ORDER = ["links", "fetch", "transform", "load"]
TASK_WATCH_PATHS: Mapping[str, tuple[Path, ...]] = {
    "links.update_all": (ROOT_DIR / "links", ROOT_DIR / "beef_stats" / "links"),
    "fetch.all_text": (ROOT_DIR / "beef_stats" / "raw", ROOT_DIR / "beef_stats" / "pdfs"),
    "fetch.weather": (
        ROOT_DIR / "national_daily_average_temp.csv",
        ROOT_DIR / ".loader_state" / "national_daily_average_temperature.last",
        ROOT_DIR / "weather" / "raw",
        ROOT_DIR / "csv" / "energy" / "ulds_weekly_retail_prices.csv",
    ),
    "transform.raw_index": (ROOT_DIR / "beef_stats" / "processed" / "processed_index",),
    "transform.boxed_am": (ROOT_DIR / "beef_stats" / "processed" / "processed_boxed_am",),
    "transform.boxed_pm": (ROOT_DIR / "beef_stats" / "processed" / "processed_boxed_pm",),
    "transform.trimmings_am": (ROOT_DIR / "beef_stats" / "processed" / "processed_trimmings_am",),
    "transform.trimmings_pm": (ROOT_DIR / "beef_stats" / "processed" / "processed_trimmings_pm",),
    "transform.catalog": (ROOT_DIR / "beef_stats" / "processed" / "processed_catalog",),
    "load.boxed_am": (ROOT_DIR / ".loader_state" / "boxed_am.date",),
    "load.boxed_pm": (ROOT_DIR / ".loader_state" / "boxed_pm.date",),
    "load.catalog": (ROOT_DIR / ".loader_state" / "catalog.date",),
    "load.index": (ROOT_DIR / ".loader_state" / "index.date",),
    "load.trimmings_am": (ROOT_DIR / ".loader_state" / "trimmings_am.date",),
    "load.trimmings_pm": (ROOT_DIR / ".loader_state" / "trimmings_pm.date",),
    "load.weekly_retail": (ROOT_DIR / ".loader_state" / "weekly_retail.date",),
    "load.weekly_boxed_beef": (ROOT_DIR / ".loader_state" / "weekly_boxed_beef.date",),
    "load.national_temperature": (
        ROOT_DIR / ".loader_state" / "national_daily_average_temperature.date",
    ),
    "load.diesel": (ROOT_DIR / ".loader_state" / "diesel_weekly_prices.date",),
    "load.weather_occurrences": (
        ROOT_DIR / ".loader_state" / "weather_occurrences_sources.json",
    ),
    "load.feed_costs": (
        ROOT_DIR / ".loader_state" / "feed_costs.date",
    ),
}


def _snapshot_paths(paths: tuple[Path, ...]) -> Dict[str, tuple[int, int]]:
    snapshot: Dict[str, tuple[int, int]] = {}
    for path in paths:
        if not path.exists():
            continue
        if path.is_file():
            stat = path.stat()
            snapshot[str(path)] = (stat.st_mtime_ns, stat.st_size)
            continue
        for child in path.rglob("*"):
            if not child.is_file():
                continue
            stat = child.stat()
            snapshot[str(child)] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def _resolve_selected_tasks(groups: Iterable[str] | None) -> Set[str]:
    if groups:
        selected_groups = set(groups)
    else:
        selected_groups = set(GROUP_ORDER)

    selected: Set[str] = set()
    queue: deque[str] = deque()

    for task in TASKS:
        if task.group in selected_groups:
            selected.add(task.name)
            queue.append(task.name)

    while queue:
        name = queue.popleft()
        task = TASK_BY_NAME[name]
        for dep in task.depends_on:
            if dep not in selected:
                selected.add(dep)
                queue.append(dep)
    return selected


def _run_group(
    tasks: List[Task],
    completed: Set[str],
    failures: Dict[str, Exception],
    results: Dict[str, TaskRunResult],
) -> None:
    pending = set(task.name for task in tasks)
    task_map = {task.name: task for task in tasks}

    while pending:
        ready: List[Task] = []
        skipped: List[str] = []
        for name in list(pending):
            task = task_map[name]
            if any(dep in failures for dep in task.depends_on):
                detail = f"Skipped because dependency failed: {', '.join(sorted(task.depends_on & failures.keys()))}"
                failures[name] = RuntimeError(detail)
                results[name] = TaskRunResult(name=name, status="skipped", detail=detail)
                pending.remove(name)
                skipped.append(name)
                continue
            if task.depends_on.issubset(completed):
                ready.append(task)
                pending.remove(name)
        if not ready:
            if skipped:
                continue
            raise RuntimeError("Deadlock detected in task dependencies")

        snapshots_before = {
            task.name: _snapshot_paths(TASK_WATCH_PATHS[task.name])
            for task in ready
            if task.name in TASK_WATCH_PATHS
        }
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(ready)) as executor:
            future_to_task = {executor.submit(task.fn): task for task in ready}
            for future in concurrent.futures.as_completed(future_to_task):
                task = future_to_task[future]
                try:
                    future.result()
                except Exception as exc:  # noqa: BLE001
                    failures[task.name] = exc
                    results[task.name] = TaskRunResult(
                        name=task.name,
                        status="failed",
                        detail=str(exc),
                    )
                    logging.error("❌ %s failed: %s", task.name, exc)
                else:
                    completed.add(task.name)
                    changed: bool | None = None
                    if task.name in snapshots_before:
                        changed = snapshots_before[task.name] != _snapshot_paths(TASK_WATCH_PATHS[task.name])
                    results[task.name] = TaskRunResult(
                        name=task.name,
                        status="completed",
                        changed=changed,
                    )
                    logging.info("✅ %s completed", task.name)


def run_pipeline(groups: Iterable[str] | None = None) -> int:
    selected = _resolve_selected_tasks(groups)
    completed: Set[str] = set()
    failures: Dict[str, Exception] = {}
    results: Dict[str, TaskRunResult] = {}

    for group in GROUP_ORDER:
        group_tasks = [task for task in TASKS if task.group == group and task.name in selected]
        if not group_tasks:
            continue
        logging.info("\n==== Running %s tasks ====", group)
        _run_group(group_tasks, completed, failures, results)

    no_new_info = [
        task.name
        for task in TASKS
        if task.name in selected
        and results.get(task.name) is not None
        and results[task.name].status == "completed"
        and results[task.name].changed is False
    ]

    if failures or no_new_info:
        logging.info("\n==== Run summary ====")
        if failures:
            logging.error("Failed or skipped tasks:")
            for task in TASKS:
                result = results.get(task.name)
                if task.name not in selected or result is None or result.status not in {"failed", "skipped"}:
                    continue
                logging.error(" - %s: %s", task.name, result.detail or "unknown error")
        if no_new_info:
            logging.warning("Completed with no tracked new information:")
            for name in no_new_info:
                logging.warning(" - %s", name)

    if failures:
        logging.error("\nPipeline finished with %d failure(s)", len(failures))
        return 1
    logging.info("\nPipeline completed successfully.")
    return 0


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Beef statistics pipeline runner")
    parser.add_argument(
        "--groups",
        nargs="+",
        choices=GROUP_ORDER,
        help="Restrict execution to the specified groups (dependencies included)",
    )
    parser.add_argument("--list", action="store_true", help="List available tasks and exit")
    args = parser.parse_args(argv)

    if args.list:
        for task in TASKS:
            print(f"{task.group:10s} {task.name} -> deps: {', '.join(sorted(task.depends_on)) or 'none'}")
        return 0

    return run_pipeline(args.groups)


if __name__ == "__main__":
    raise SystemExit(main())
