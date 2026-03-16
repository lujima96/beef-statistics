from __future__ import annotations

from datetime import date
from typing import Dict, Literal, Optional

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from psycopg import sql as psql

from config import config

router = APIRouter()

_TABLE_MAP: Dict[str, str] = {
    "cow_sheet": "cow_sheet_csv",
    "choice": "choice_sheet_csv",
    "prime": "prime_sheet_csv",
    "select": "select_sheet_csv",
}


class TableSaveRequest(BaseModel):
    table: Literal["cow_sheet", "choice", "prime", "select"]
    report_date: date
    csv: str
    filename: str | None = None
    overwrite: bool | None = False


@router.post("/api/tables/save")
def save_table_csv(req: TableSaveRequest) -> JSONResponse:
    rel = _TABLE_MAP.get(req.table)
    if rel is None:
        raise HTTPException(status_code=400, detail="Unknown table kind")

    dsn = routes.pg_dsn_from_env(config)
    ensure_date = (
        psql.SQL("INSERT INTO {}.{} (report_date) VALUES (%s) ON CONFLICT DO NOTHING")
        .format(psql.Identifier("beef_data"), psql.Identifier("report_dates"))
    )

    q = psql.SQL(
        """
        INSERT INTO {}.{} (report_date, filename, csv_content)
        VALUES (%s, %s, %s)
        RETURNING id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier(rel))

    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(ensure_date, [req.report_date])
            if req.overwrite:
                cur.execute(
                    psql.SQL("DELETE FROM {}.{} WHERE report_date = %s").format(
                        psql.Identifier("beef_data"), psql.Identifier(rel)
                    ),
                    [req.report_date],
                )
            else:
                cur.execute(
                    psql.SQL("SELECT 1 FROM {}.{} WHERE report_date = %s LIMIT 1").format(
                        psql.Identifier("beef_data"), psql.Identifier(rel)
                    ),
                    [req.report_date],
                )
                if cur.fetchone():
                    return JSONResponse({"ok": False, "error": "exists"}, status_code=409)
            cur.execute(q, [req.report_date, req.filename, req.csv])
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=500, detail="Failed to insert: no id returned")
            new_id = row[0]
            conn.commit()
            return JSONResponse({"ok": True, "id": int(new_id)})
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to insert: {e}")


@router.get("/api/tables/list")
def list_saved_tables(
    table: Literal["cow_sheet", "choice", "prime", "select"],
    limit: int = Query(1000, ge=1, le=10000),
) -> JSONResponse:
    rel = _TABLE_MAP.get(table)
    if rel is None:
        raise HTTPException(status_code=400, detail="Unknown table kind")
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL(
        """
        SELECT id, report_date::text, COALESCE(filename,''), created_at
        FROM {}.{}
        ORDER BY report_date DESC NULLS LAST, id DESC
        LIMIT %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier(rel))
    rows = []
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [limit])
            for rid, d, fn, created_at in cur.fetchall():
                rows.append(
                    {
                        "id": int(rid),
                        "report_date": str(d),
                        "filename": str(fn) if fn else "",
                        "created_at": str(created_at),
                    }
                )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    return JSONResponse({"rows": rows})


@router.get("/api/tables/get")
def get_saved_table(
    table: Literal["cow_sheet", "choice", "prime", "select"],
    id: int = Query(...),
) -> JSONResponse:
    rel = _TABLE_MAP.get(table)
    if rel is None:
        raise HTTPException(status_code=400, detail="Unknown table kind")
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL(
        """
        SELECT id, report_date::text, COALESCE(filename,''), csv_content
        FROM {}.{}
        WHERE id = %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier(rel))
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [id])
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            rid, d, fn, csv = row
            return JSONResponse(
                {
                    "id": int(rid),
                    "report_date": str(d),
                    "filename": str(fn) if fn else "",
                    "csv": str(csv),
                }
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")


@router.get("/api/tables/exists")
def exists_saved_table(
    table: Literal["cow_sheet", "choice", "prime", "select"],
    report_date: date,
) -> JSONResponse:
    rel = _TABLE_MAP.get(table)
    if rel is None:
        raise HTTPException(status_code=400, detail="Unknown table kind")
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL("SELECT id FROM {}.{} WHERE report_date = %s LIMIT 1").format(
        psql.Identifier("beef_data"), psql.Identifier(rel)
    )
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [report_date])
            row = cur.fetchone()
            return JSONResponse({"exists": bool(row), "id": int(row[0]) if row else None})
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")


@router.delete("/api/tables/delete")
def delete_saved_table(
    table: Literal["cow_sheet", "choice", "prime", "select"],
    id: int = Query(...),
) -> JSONResponse:
    """Delete a saved table row by id.

    Returns ok: true if a row was deleted, ok: false if not found.
    """

    rel = _TABLE_MAP.get(table)
    if rel is None:
        raise HTTPException(status_code=400, detail="Unknown table kind")
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL("DELETE FROM {}.{} WHERE id = %s").format(
        psql.Identifier("beef_data"), psql.Identifier(rel)
    )
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [id])
            deleted = cur.rowcount or 0
            conn.commit()
            return JSONResponse({"ok": bool(deleted)})
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
