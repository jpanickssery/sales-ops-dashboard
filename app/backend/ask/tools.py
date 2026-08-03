"""The pandas query tool Claude uses to answer open-ended pipeline questions.

Rather than letting Claude free-hand a chart, it can only see the data
through this constrained filter/group/aggregate operation over the
normalized deal-level tables — so a question always resolves to a real
number pulled from the current snapshot.
"""

import pandas as pd

_OPS = {
    "==": lambda s, v: s == v,
    "!=": lambda s, v: s != v,
    ">": lambda s, v: s > v,
    "<": lambda s, v: s < v,
    ">=": lambda s, v: s >= v,
    "<=": lambda s, v: s <= v,
    "contains": lambda s, v: s.astype(str).str.contains(str(v), case=False, na=False),
}

_AGGS = {"sum": "sum", "mean": "mean", "count": "count", "min": "min", "max": "max"}

MAX_ROWS = 50

QUERY_DATA_TOOL = {
    "name": "query_data",
    "description": (
        "Query the pipeline data. Choose a table, optionally filter rows, "
        "optionally group by a column and aggregate metric columns. "
        "Returns up to 50 rows as JSON. Call this as many times as needed "
        "before answering — e.g. once per region, or once to list deals and "
        "once to compute a total."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "table": {
                "type": "string",
                "enum": ["open_deals", "closed_deals", "sellers", "hygiene", "line_items"],
                "description": (
                    "open_deals: current open pipeline, one row per deal. "
                    "closed_deals: FY27 won/lost history, one row per deal (has a 'won' boolean). "
                    "sellers: one row per rep (quota, win rate, region). "
                    "hygiene: open deals with data-quality issue counts. "
                    "line_items: product/SKU-level detail per deal."
                ),
            },
            "filters": {
                "type": "array",
                "description": "AND-combined filters applied before grouping.",
                "items": {
                    "type": "object",
                    "properties": {
                        "column": {"type": "string"},
                        "op": {"type": "string", "enum": list(_OPS.keys())},
                        "value": {},
                    },
                    "required": ["column", "op", "value"],
                },
            },
            "group_by": {
                "type": "string",
                "description": "Column to group by, e.g. 'region' or 'owner'. Omit to aggregate over all filtered rows, or to list raw rows.",
            },
            "metrics": {
                "type": "array",
                "description": "Aggregations to compute per group (or overall, if no group_by). Omit entirely to list raw filtered rows instead.",
                "items": {
                    "type": "object",
                    "properties": {
                        "column": {"type": "string"},
                        "agg": {"type": "string", "enum": list(_AGGS.keys())},
                    },
                    "required": ["column", "agg"],
                },
            },
            "sort_by": {"type": "string", "description": "Column name to sort results by (a metric name like 'tcv_sum', or a raw column)."},
            "sort_desc": {"type": "boolean", "default": True},
            "limit": {"type": "integer", "default": 20, "maximum": MAX_ROWS},
        },
        "required": ["table"],
    },
}

FINAL_ANSWER_TOOL = {
    "name": "final_answer",
    "description": "Give the final answer to the user's question. Call this once you have enough data.",
    "input_schema": {
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": "A concise (1-3 sentence) plain-language answer.",
            },
            "hasBars": {"type": "boolean", "default": False},
            "bars": {
                "type": "array",
                "description": "Bar-chart rows, only if hasBars is true. pct must be 0-100, scaled so the largest bar is ~100.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "value": {"type": "string", "description": "Display value, e.g. '$4.2M' or '186 (36%)'."},
                        "pct": {"type": "number"},
                    },
                    "required": ["name", "value", "pct"],
                },
            },
            "hasTable": {"type": "boolean", "default": False},
            "tableHeader": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Column headers, only if hasTable is true.",
            },
            "tableRows": {
                "type": "array",
                "description": "Table rows, only if hasTable is true. Each row is a list of display strings matching tableHeader's length.",
                "items": {"type": "array", "items": {"type": "string"}},
            },
        },
        "required": ["answer"],
    },
}

TOOLS = [QUERY_DATA_TOOL, FINAL_ANSWER_TOOL]


def execute_query(tables: dict[str, pd.DataFrame], input: dict) -> dict:
    table_name = input["table"]
    if table_name not in tables:
        return {"error": f"Unknown table '{table_name}'. Available: {list(tables.keys())}"}

    df = tables[table_name]

    for f in input.get("filters", []) or []:
        col, op, value = f["column"], f["op"], f["value"]
        if col not in df.columns:
            return {"error": f"Unknown column '{col}' in table '{table_name}'. Columns: {list(df.columns)}"}
        if op not in _OPS:
            return {"error": f"Unknown op '{op}'"}
        df = df[_OPS[op](df[col], value)]

    metrics = input.get("metrics") or []
    group_by = input.get("group_by")

    if metrics:
        agg_map = {}
        rename_map = {}
        for m in metrics:
            col, agg = m["column"], m["agg"]
            if col not in df.columns and agg != "count":
                return {"error": f"Unknown column '{col}' for metric"}
            key = f"{col}_{agg}"
            agg_map[key] = (col, _AGGS[agg])
            rename_map[key] = key
        if group_by:
            if group_by not in df.columns:
                return {"error": f"Unknown group_by column '{group_by}'"}
            result = df.groupby(group_by, dropna=False).agg(**agg_map).reset_index()
        else:
            result = pd.DataFrame([{k: getattr(df[v[0]], v[1])() for k, v in agg_map.items()}])
    elif group_by:
        if group_by not in df.columns:
            return {"error": f"Unknown group_by column '{group_by}'"}
        result = df.groupby(group_by, dropna=False).size().reset_index(name="count")
    else:
        result = df

    sort_by = input.get("sort_by")
    if sort_by and sort_by in result.columns:
        result = result.sort_values(sort_by, ascending=not input.get("sort_desc", True))

    limit = min(int(input.get("limit", 20)), MAX_ROWS)
    result = result.head(limit)

    result = result.where(pd.notna(result), None)
    for col in result.columns:
        if pd.api.types.is_datetime64_any_dtype(result[col]):
            result[col] = result[col].astype(str)

    return {"rows": result.to_dict(orient="records"), "row_count": int(len(result))}
