import psycopg2
from dotenv import load_dotenv

load_dotenv()

import os


def get_conn():
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be configured for the Society API")

    return psycopg2.connect(database_url)
