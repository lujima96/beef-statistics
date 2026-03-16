from __future__ import annotations

from typing import Any, Dict, List

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from psycopg import sql as psql

from config import config

router = APIRouter()


@router.get("/api/weekly-retail/reports")
def list_weekly_retail_reports(
    limit: int = Query(1000, ge=1, le=10000)
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL(
        """
        SELECT id, report_date::text, report_code, filename, file_size, sha256, source_url
        FROM {}.{}
        ORDER BY report_date DESC NULLS LAST, id DESC
        LIMIT %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("weekly_retail_price_pdfs"))

    rows: List[Dict[str, Any]] = []
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [limit])
            for rid, d, code, fn, sz, sh, url in cur.fetchall():
                rows.append(
                    {
                        "id": int(rid),
                        "report_date": str(d),
                        "report_code": str(code) if code else None,
                        "filename": str(fn),
                        "file_size": int(sz) if sz else None,
                        "sha256": str(sh) if sh else None,
                        "source_url": str(url) if url else None,
                    }
                )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    return JSONResponse({"reports": rows})


@router.get("/api/weekly-boxed-beef/reports")
def list_weekly_boxed_beef_reports(
    limit: int = Query(1000, ge=1, le=10000)
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL(
        """
        SELECT id, report_date::text, filename, file_size, sha256
        FROM {}.{}
        ORDER BY report_date DESC NULLS LAST, id DESC
        LIMIT %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("weekly_boxed_beef_pdfs"))

    rows: List[Dict[str, Any]] = []
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [limit])
            for rid, d, fn, sz, sh in cur.fetchall():
                rows.append(
                    {
                        "id": int(rid),
                        "report_date": str(d) if d else "",
                        "filename": str(fn),
                        "file_size": int(sz) if sz else None,
                        "sha256": str(sh) if sh else None,
                    }
                )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    return JSONResponse({"reports": rows})


@router.get("/api/weekly-retail/file")
def get_weekly_retail_pdf(
    id: int = Query(..., description="Primary key id")
) -> Response:
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL(
        """
        SELECT filename, content_type, pdf_bytes
        FROM {}.{}
        WHERE id = %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("weekly_retail_price_pdfs"))
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [id])
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Report not found")
            filename, content_type, data = row
            if not content_type:
                content_type = "application/pdf"
            headers = {"Content-Disposition": f"inline; filename={filename}"}
            return Response(content=bytes(data), media_type=content_type, headers=headers)
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")


@router.get("/api/weekly-boxed-beef/file")
def get_weekly_boxed_beef_pdf(
    id: int = Query(..., description="Primary key id")
) -> Response:
    dsn = routes.pg_dsn_from_env(config)
    q = psql.SQL(
        """
        SELECT filename, content_type, pdf_bytes
        FROM {}.{}
        WHERE id = %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("weekly_boxed_beef_pdfs"))
    try:
        with routes.psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(q, [id])
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Report not found")
            filename, content_type, data = row
            if not content_type:
                content_type = "application/pdf"
            headers = {"Content-Disposition": f"inline; filename={filename}"}
            return Response(content=bytes(data), media_type=content_type, headers=headers)
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
