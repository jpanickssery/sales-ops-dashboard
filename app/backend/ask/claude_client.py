"""Claude tool-calling loop that turns a natural-language pipeline question
into a chart/table answer, by letting Claude query the normalized deal
tables via the query_data tool (see tools.py) and then calling
final_answer with a structured result.
"""

import json

import anthropic

from . import tools as ask_tools

MODEL = "claude-opus-5"
MAX_ITERATIONS = 6

SYSTEM_PROMPT = """You answer questions about the HGS FY27 sales pipeline by querying the \
data with the query_data tool, then calling final_answer with a concise answer and, when it \
would help, a bar chart or a table.

Guidelines:
- Always query the data before answering — never guess numbers.
- Prefer a small number of query_data calls (group_by + metrics) over listing raw rows, unless \
the user is asking for a list of specific deals.
- For bar charts, scale pct so the largest bar is 100.
- For tables, keep it to the most relevant 5-15 rows and no more than 6 columns.
- If the question doesn't need a chart or table, just set hasBars/hasTable to false and answer \
in the "answer" text.
- Money values in "value"/table cells should be formatted like "$4.2M" or "$137,321" — no raw \
unformatted floats."""


def answer_question(question: str, tables: dict) -> dict:
    client = anthropic.Anthropic()
    messages = [{"role": "user", "content": question}]

    for _ in range(MAX_ITERATIONS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=ask_tools.TOOLS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        if not tool_use_blocks:
            text = next((b.text for b in response.content if b.type == "text"), "")
            return {"question": question, "answer": text or "I couldn't find an answer.", "hasBars": False, "hasTable": False}

        final = next((b for b in tool_use_blocks if b.name == "final_answer"), None)
        if final is not None:
            return _shape_final_answer(question, final.input)

        tool_results = []
        for block in tool_use_blocks:
            if block.name == "query_data":
                result = ask_tools.execute_query(tables, block.input)
            else:
                result = {"error": f"Unknown tool '{block.name}'"}
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, default=str),
            })
        messages.append({"role": "user", "content": tool_results})

    return {
        "question": question,
        "answer": "I wasn't able to pin down an answer in the allotted steps — try rephrasing the question.",
        "hasBars": False,
        "hasTable": False,
    }


def _shape_final_answer(question: str, input: dict) -> dict:
    msg = {
        "question": question,
        "answer": input.get("answer", ""),
        "hasBars": bool(input.get("hasBars")),
        "hasTable": bool(input.get("hasTable")),
    }
    if msg["hasBars"]:
        palette = "#356094"
        msg["bars"] = [
            {
                "name": b.get("name", ""),
                "value": b.get("value", ""),
                "pct": max(0, min(100, float(b.get("pct", 0)))),
                "color": palette,
            }
            for b in input.get("bars", [])
        ]
    else:
        msg["bars"] = []

    if msg["hasTable"]:
        header = input.get("tableHeader", [])
        rows = input.get("tableRows", [])
        msg["tableHeader"] = header
        msg["tableCols"] = " ".join(["1.6fr"] + ["1fr"] * max(0, len(header) - 1))
        msg["tableRows"] = [{"cells": row} for row in rows]
    else:
        msg["tableHeader"] = []
        msg["tableCols"] = ""
        msg["tableRows"] = []

    return msg
