import argparse
import os
import sqlite3
from datetime import datetime, timezone
import pandas as pd
from dateutil import parser as dtparser

DEFAULT_DB = "runs.db"

HEADER_MAP = {
    "users load": "users_load",
    "user load": "users_load",
    "users": "users_load",
    "load": "users_load",
    "endpoint name": "endpoint_name",
    "endpoint": "endpoint_name",
    "name": "endpoint_name",
    "average response": "avg_ms",
    "avg": "avg_ms",
    "avg ms": "avg_ms",
    "average": "avg_ms",
    "min": "min_ms",
    "minimum": "min_ms",
    "max": "max_ms",
    "maximum": "max_ms",
}

REQUIRED = {"users_load", "endpoint_name", "avg_ms", "min_ms", "max_ms"}


def normalize_columns(cols):
    out = []
    for c in cols:
        key = str(c).strip().lower()
        key = " ".join(key.split())
        out.append(HEADER_MAP.get(key, key.replace(" ", "_")))
    return out


def ensure_schema(conn):
    with open(os.path.join(os.path.dirname(__file__), "schema.sql"), "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()


def migrate_runs_table(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(runs)").fetchall()}

    def add(col_def: str):
        conn.execute(f"ALTER TABLE runs ADD COLUMN {col_def}")

    if "is_baseline" not in cols:
        add("is_baseline INTEGER NOT NULL DEFAULT 0")
    if "release_name" not in cols:
        add("release_name TEXT")
    if "environment" not in cols:
        add("environment TEXT")
    if "commit_sha" not in cols:
        add("commit_sha TEXT")
    if "test_type" not in cols:
        add("test_type TEXT")
    if "sla_avg_ms" not in cols:
        add("sla_avg_ms REAL")
    if "sla_max_ms" not in cols:
        add("sla_max_ms REAL")
    if "regression_pct" not in cols:
        add("regression_pct REAL")
    if "is_excluded" not in cols:
        add("is_excluded INTEGER NOT NULL DEFAULT 0")

    conn.commit()


def parse_run_ts(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")
    dt = dtparser.parse(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def read_excel(path: str, sheet: str | None):
    # If sheet_name=None, pandas returns dict(sheet->df) for multi-sheet files.
    # We always want a single DataFrame.
    if sheet:
        df = pd.read_excel(path, sheet_name=sheet)
    else:
        df = pd.read_excel(path)  # first sheet only

    df.columns = normalize_columns(df.columns)
    df = df.dropna(how="all")

    missing = REQUIRED - set(df.columns)
    if missing:
        raise SystemExit(
            f"Missing required columns: {sorted(missing)}\n"
            f"Found columns: {list(df.columns)}\n\n"
            "Expected headers like: Users load, Endpoint Name, Average Response, Min, Max"
        )

    df = df[list(REQUIRED)].copy()
    df["endpoint_name"] = df["endpoint_name"].astype(str).str.strip()
    df["users_load"] = pd.to_numeric(df["users_load"], errors="coerce").astype("Int64")
    for col in ["avg_ms", "min_ms", "max_ms"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["endpoint_name", "users_load", "avg_ms", "min_ms", "max_ms"])
    df["users_load"] = df["users_load"].astype(int)
    df = df[(df["avg_ms"] >= 0) & (df["min_ms"] >= 0) & (df["max_ms"] >= 0)]
    return df


def main():
    ap = argparse.ArgumentParser(description="Import load test results from Excel into SQLite.")
    ap.add_argument("--file", required=True, help="Path to .xlsx file")
    ap.add_argument("--sheet", default=None, help="Excel sheet name (optional)")
    ap.add_argument("--db", default=DEFAULT_DB, help="Path to SQLite DB (default: runs.db)")
    ap.add_argument("--run-name", required=True, help="Name for this run (e.g., 2026-01-21_Nightly)")
    ap.add_argument("--run-ts", default=None, help="Run timestamp (optional; defaults to now UTC)")
    ap.add_argument("--notes", default=None, help="Optional notes")

    ap.add_argument("--baseline", action="store_true", help="Mark this run as the baseline (clears previous baseline)")
    ap.add_argument("--release", default=None, help="Release name (e.g., R1-2026.01)")
    ap.add_argument("--env", default=None, help="Environment (e.g., QA/Perf/Stage)")
    ap.add_argument("--commit", default=None, help="Commit SHA")
    ap.add_argument("--test-type", default=None, help="Load/Stress/Soak/Spike")
    ap.add_argument("--sla-avg-ms", type=float, default=None, help="Avg SLA threshold in ms")
    ap.add_argument("--sla-max-ms", type=float, default=None, help="Max SLA threshold in ms")
    ap.add_argument("--regression-pct", type=float, default=None, help="Regression threshold percent (e.g. 15)")

    args = ap.parse_args()

    if not os.path.exists(args.file):
        raise SystemExit(f"File not found: {args.file}")

    run_ts = parse_run_ts(args.run_ts)
    df = read_excel(args.file, args.sheet)

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    ensure_schema(conn)
    migrate_runs_table(conn)

    if args.baseline:
        conn.execute("UPDATE runs SET is_baseline=0")
        conn.commit()

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO runs(
          run_name, run_ts, source_file, notes,
          is_baseline, release_name, environment, commit_sha, test_type,
          sla_avg_ms, sla_max_ms, regression_pct
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            args.run_name,
            run_ts,
            os.path.basename(args.file),
            args.notes,
            1 if args.baseline else 0,
            args.release,
            args.env,
            args.commit,
            args.test_type,
            args.sla_avg_ms,
            args.sla_max_ms,
            args.regression_pct,
        ),
    )
    run_id = cur.lastrowid

    rows = [
        (run_id, int(r.users_load), r.endpoint_name, float(r.avg_ms), float(r.min_ms), float(r.max_ms))
        for r in df.itertuples(index=False)
    ]
    cur.executemany(
        "INSERT INTO measurements(run_id, users_load, endpoint_name, avg_ms, min_ms, max_ms) VALUES (?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    conn.close()

    print(f"Imported {len(rows)} rows into run_id={run_id} ({args.run_name}) @ {run_ts}. Baseline={bool(args.baseline)}")


if __name__ == "__main__":
    main()
