from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.extractor import (
    ExtractError,
    FetchError,
    InvalidUrlError,
    convert_url,
)
from app.models import ConvertRequest, ConvertResponse

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Article to Print")


@app.post("/api/convert", response_model=ConvertResponse)
async def api_convert(body: ConvertRequest) -> ConvertResponse:
    url = str(body.url)
    try:
        result = await convert_url(url)
    except InvalidUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ExtractError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ConvertResponse(**result)


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
