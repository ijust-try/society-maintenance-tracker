# Add these imports to your existing main.py:
from society_auth_routes import router as society_auth_router
from society_routes import router as society_router

# Add these after your existing app.include_router(...) calls:
app.include_router(society_auth_router)
app.include_router(society_router)

# Replace wildcard CORS with an allowlist read from FRONTEND_ORIGINS.
# Example:
# allowed_origins = [x.strip() for x in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173").split(",") if x.strip()]
# app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True,
#                    allow_methods=["GET","POST","PATCH","PUT","DELETE","OPTIONS"],
#                    allow_headers=["Authorization","Content-Type"])
