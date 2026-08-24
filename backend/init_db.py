from pathlib import Path

from society_db import get_conn


def _run_sql_file(cur, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    cur.execute(sql)


def main() -> None:
    root = Path(__file__).resolve().parent
    conn = get_conn()
    cur = conn.cursor()
    try:
        _run_sql_file(cur, root / "bootstrap_schema.sql")
        _run_sql_file(cur, root / "society_schema.sql")
        conn.commit()
        print("Database schema initialized successfully.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
