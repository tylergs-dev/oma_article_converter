from pydantic import BaseModel, HttpUrl


class ConvertRequest(BaseModel):
    url: HttpUrl


class ConvertResponse(BaseModel):
    title: str
    author: str | None
    source: str | None
    date: str | None
    html: str
