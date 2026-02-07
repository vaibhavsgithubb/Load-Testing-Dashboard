import os
import sqlite3
from datetime import datetime, timezone
from flask import Flask, jsonify, render_template, request, g, abort

DEFAULT_DB = os.environ.get("LOAD_DASHBOARD_DB", "runs.db")

app = Flask(__name__, template_folder="dashboard/templates", static_folder="dashboard/static")


def ensure_schema(conn):
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
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


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DEFAULT_DB)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON;")
        ensure_schema(g.db)
        migrate_runs_table(g.db)
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def iso_to_display(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        return iso_str


@app.get("/")
def root():
    return render_template("overview.html")


@app.get("/overview")
def overview():
    return render_template("overview.html")


@app.get("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.get("/compare")
def compare():
    return render_template("compare.html")


@app.get("/api/runs")
def api_runs():
    db = get_db()
    rows = db.execute("SELECT * FROM runs ORDER BY datetime(run_ts) DESC").fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "run_name": r["run_name"],
                "run_ts": r["run_ts"],
                "run_ts_display": iso_to_display(r["run_ts"]),
                "source_file": r["source_file"],
                "notes": r["notes"],
                "is_baseline": r["is_baseline"],
            "is_excluded": r["is_excluded"],
                "release_name": r["release_name"],
                "environment": r["environment"],
                "commit_sha": r["commit_sha"],
                "test_type": r["test_type"],
                "sla_avg_ms": r["sla_avg_ms"],
                "sla_max_ms": r["sla_max_ms"],
                "regression_pct": r["regression_pct"],
                "is_excluded": r["is_excluded"],
            }
        )
    return jsonify(out)


@app.post("/api/runs/<int:run_id>/set_baseline")
def set_baseline(run_id: int):
    db = get_db()
    exists = db.execute("SELECT id FROM runs WHERE id=?", (run_id,)).fetchone()
    if not exists:
        abort(404, "run not found")
    db.execute("UPDATE runs SET is_baseline=0")
    db.execute("UPDATE runs SET is_baseline=1 WHERE id=?", (run_id,))
    db.commit()
    return jsonify({"ok": True, "baseline_run_id": run_id})


@app.post("/api/runs/<int:run_id>/exclude")
def exclude_run(run_id: int):
    db = get_db()
    run = db.execute("SELECT id, is_baseline FROM runs WHERE id=?", (run_id,)).fetchone()
    if not run:
        abort(404, "run not found")
    if run["is_baseline"]:
        abort(400, "cannot exclude the baseline run (unset baseline first)")
    db.execute("UPDATE runs SET is_excluded=1 WHERE id=?", (run_id,))
    db.commit()
    return jsonify({"ok": True, "run_id": run_id, "is_excluded": 1})


@app.post("/api/runs/<int:run_id>/include")
def include_run(run_id: int):
    db = get_db()
    run = db.execute("SELECT id FROM runs WHERE id=?", (run_id,)).fetchone()
    if not run:
        abort(404, "run not found")
    db.execute("UPDATE runs SET is_excluded=0 WHERE id=?", (run_id,))
    db.commit()
    return jsonify({"ok": True, "run_id": run_id, "is_excluded": 0})


@app.delete("/api/runs/<int:run_id>")
def delete_run(run_id: int):
    db = get_db()
    run = db.execute("SELECT id, is_baseline FROM runs WHERE id=?", (run_id,)).fetchone()
    if not run:
        abort(404, "run not found")
    if run["is_baseline"]:
        abort(400, "cannot delete the baseline run (unset baseline first)")
    db.execute("DELETE FROM runs WHERE id=?", (run_id,))
    db.commit()
    return jsonify({"ok": True, "deleted_run_id": run_id})


@app.post("/api/runs/<int:run_id>/delete")
def delete_run_post(run_id: int):
    # convenience for environments that prefer POST over DELETE
    return delete_run(run_id)


@app.get("/api/run/<int:run_id>/data")
def api_run_data(run_id: int):
    db = get_db()
    load = request.args.get("load", type=int)
    endpoint = request.args.get("endpoint", default=None, type=str)

    q = "SELECT users_load, endpoint_name, avg_ms, min_ms, max_ms FROM measurements WHERE run_id=?"
    params = [run_id]
    if load is not None:
        q += " AND users_load=?"
        params.append(load)
    if endpoint:
        q += " AND endpoint_name=?"
        params.append(endpoint)

    q += " ORDER BY users_load ASC, endpoint_name ASC"
    rows = db.execute(q, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api/run/<int:run_id>/summary")
def api_run_summary(run_id: int):
    db = get_db()
    run = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    if not run:
        abort(404, "run not found")

    kpi = db.execute(
        """
        SELECT
          COUNT(*) AS rows_count,
          COUNT(DISTINCT endpoint_name) AS endpoints_count,
          COUNT(DISTINCT users_load) AS loads_count,
          AVG(avg_ms) AS overall_avg_ms,
          MIN(min_ms) AS overall_min_ms,
          MAX(max_ms) AS overall_max_ms
        FROM measurements
        WHERE run_id=?
        """,
        (run_id,),
    ).fetchone()

    slowest = db.execute(
        """
        SELECT endpoint_name, users_load, avg_ms, min_ms, max_ms
        FROM measurements
        WHERE run_id=?
        ORDER BY avg_ms DESC
        LIMIT 10
        """,
        (run_id,),
    ).fetchall()

    return jsonify(
        {
            "run": {
                "id": run["id"],
                "run_name": run["run_name"],
                "run_ts": run["run_ts"],
                "run_ts_display": iso_to_display(run["run_ts"]),
                "source_file": run["source_file"],
                "notes": run["notes"],
                "is_baseline": run["is_baseline"],
                "release_name": run["release_name"],
                "environment": run["environment"],
                "commit_sha": run["commit_sha"],
                "test_type": run["test_type"],
                "sla_avg_ms": run["sla_avg_ms"],
                "sla_max_ms": run["sla_max_ms"],
                "regression_pct": run["regression_pct"],
                "is_excluded": run["is_excluded"],
            },
            "kpi": dict(kpi),
            "slowest": [dict(r) for r in slowest],
        }
    )


@app.get("/api/run/<int:run_id>/exec_summary")
def exec_summary(run_id: int):
    db = get_db()
    run = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    if not run:
        abort(404, "run not found")

    baseline = db.execute("SELECT * FROM runs WHERE is_baseline=1").fetchone()
    baseline_id = None
    if baseline and baseline["id"] != run_id:
        baseline_id = baseline["id"]

    sla_avg = run["sla_avg_ms"]
    sla_max = run["sla_max_ms"]
    reg_pct = run["regression_pct"] if run["regression_pct"] is not None else 15.0

    m = db.execute(
        "SELECT endpoint_name, users_load, avg_ms, max_ms FROM measurements WHERE run_id=?",
        (run_id,),
    ).fetchall()

    sla_fail = 0
    for r in m:
        if sla_avg is not None and r["avg_ms"] > sla_avg:
            sla_fail += 1
        elif sla_max is not None and r["max_ms"] > sla_max:
            sla_fail += 1

    regressions = []
    if baseline_id:
        b = db.execute(
            "SELECT endpoint_name, users_load, avg_ms FROM measurements WHERE run_id=?",
            (baseline_id,),
        ).fetchall()
        bmap = {(x["endpoint_name"], x["users_load"]): x["avg_ms"] for x in b}

        for r in m:
            key = (r["endpoint_name"], r["users_load"])
            base = bmap.get(key)
            if base and base > 0:
                pct = ((r["avg_ms"] - base) / base) * 100.0
                if pct >= reg_pct:
                    regressions.append((pct, r["endpoint_name"], r["users_load"], r["avg_ms"], base))

        regressions.sort(reverse=True)

    status = "GREEN"
    if sla_fail > 0 or len(regressions) > 0:
        status = "AMBER"
    if sla_fail > 10 or len(regressions) > 10:
        status = "RED"

    top = [
        {"pct": round(p, 1), "endpoint": e, "load": l, "avg_ms": a, "baseline_avg_ms": b}
        for (p, e, l, a, b) in regressions[:3]
    ]

    return jsonify(
        {
            "status": status,
            "sla_fail_count": sla_fail,
            "sla_avg_ms": sla_avg,
            "sla_max_ms": sla_max,
            "regression_threshold_pct": reg_pct,
            "regressions_count": len(regressions),
            "top_risks": top,
            "baseline_run_id": baseline_id,
        }
    )


@app.post("/api/compare")
def api_compare():
    payload = request.get_json(force=True, silent=True) or {}
    run_ids = payload.get("run_ids", [])
    if not isinstance(run_ids, list) or not (1 <= len(run_ids) <= 4):
        abort(400, "run_ids must be a list of 1..4 run ids")

    load = payload.get("load")
    endpoint = payload.get("endpoint")

    placeholders = ",".join(["?"] * len(run_ids))
    db = get_db()

    runs_rows = db.execute(
        f"SELECT id, run_name, run_ts, is_baseline, is_excluded FROM runs WHERE id IN ({placeholders})",
        run_ids,
    ).fetchall()
    runs_map = {
        r["id"]: {
            "id": r["id"],
            "run_name": r["run_name"],
            "run_ts": r["run_ts"],
            "run_ts_display": iso_to_display(r["run_ts"]),
            "is_baseline": r["is_baseline"],
            "is_excluded": r["is_excluded"],
        }
        for r in runs_rows
    }

    q = f"""
      SELECT run_id, users_load, endpoint_name, avg_ms, min_ms, max_ms
      FROM measurements
      WHERE run_id IN ({placeholders})
    """
    params = list(run_ids)
    if load is not None:
        q += " AND users_load=?"
        params.append(int(load))
    if endpoint:
        q += " AND endpoint_name=?"
        params.append(str(endpoint))
    rows = db.execute(q, params).fetchall()

    matrix = {}
    for r in rows:
        key = (r["endpoint_name"], r["users_load"])
        if key not in matrix:
            matrix[key] = {"endpoint_name": r["endpoint_name"], "users_load": r["users_load"], "by_run": {}}
        matrix[key]["by_run"][r["run_id"]] = {"avg_ms": r["avg_ms"], "min_ms": r["min_ms"], "max_ms": r["max_ms"]}

    items = sorted(matrix.values(), key=lambda x: (x["users_load"], x["endpoint_name"]))

    return jsonify({"runs": [runs_map.get(i) for i in run_ids], "items": items})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)
