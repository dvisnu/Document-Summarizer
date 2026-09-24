import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.config import get_settings
from backend.app.routes import summarize

logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="Document Summary Assistant",
    version="1.0.0",
)

async def catch_unhandled_errors(request: Request, call_next):
    """Turn an unhandled exception into a normal JSON response.

    Starlette's own 500 handler sits *outside* the CORS middleware, so a crash
    there reaches the browser with no Access-Control-Allow-Origin header and
    gets reported as a CORS failure instead of the server error it actually is.
    """
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Internal server error."},
        )


# Added first so CORS wraps it: add_middleware puts the last one added outermost,
# and the error response has to pass back out through CORS to pick up its headers.
app.add_middleware(BaseHTTPMiddleware, dispatch=catch_unhandled_errors)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(summarize.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0]
    field = first_error["loc"][-1]
    message = first_error["msg"]
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": f"Invalid {field}: {message}"},
    )