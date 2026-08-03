import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ask.claude_client import answer_question
from ingest import snapshot

router = APIRouter()


class AskRequest(BaseModel):
    question: str


@router.post("/ask")
def ask(payload: AskRequest):
    tables = snapshot.load_current_tables()
    if not tables:
        raise HTTPException(status_code=404, detail="No spreadsheet uploaded yet.")
    try:
        return answer_question(payload.question, tables)
    except anthropic.APIStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude API request failed: {exc.message}",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - most likely missing/invalid credentials
        raise HTTPException(
            status_code=401,
            detail=(
                "Couldn't reach the Claude API. Set the ANTHROPIC_API_KEY environment "
                f"variable (or run `ant auth login`) and restart the server. ({exc})"
            ),
        ) from exc
