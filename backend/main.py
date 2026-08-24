import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

try:
    from .society_auth_routes import router as auth_router
    from .society_routes import router as society_router
except ImportError:
    from society_auth_routes import router as auth_router
    from society_routes import router as society_router


app = FastAPI(
    title="Society Maintenance Tracker API",
    version="1.0.0",
    description="Backend API for the Society Maintenance Tracker",
)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Authentication endpoints
app.include_router(auth_router)

# Society Maintenance Tracker endpoints
app.include_router(society_router)


@app.get("/")
def health_check():
    return {
        "status": "ok",
        "service": "Society Maintenance Tracker API",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
    }
