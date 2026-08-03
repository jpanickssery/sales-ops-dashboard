"""Parses the raw HGS pipeline workbook into pandas DataFrames.

Reads only the raw per-record tabs (Open Deals, Closed Deals, Line Items,
Seller Performance, Sales Hygiene, and the snapshot archive tabs) — every
other tab in the workbook is an Excel-side pivot of these and is
recomputed in aggregate.py instead of parsed directly.
"""

import pandas as pd

# Each raw tab has a title/refresh-date banner above the real header row.
# header= is the 0-indexed row containing the column names.
_HEADER_ROWS = {
    "Open Deals (Data)": 3,
    "Closed Deals (Data)": 3,
    "Line Items (Data)": 3,
    "Seller Performance": 5,
    "Sales Hygiene": 9,
    "_SnapWeekly": 0,
    "_SnapMonthly": 0,
    "_SnapArchive": 0,
}


def load_workbook_sheets(path: str) -> dict[str, pd.DataFrame]:
    sheets = {}
    with pd.ExcelFile(path) as xls:
        for name, header_row in _HEADER_ROWS.items():
            sheets[name] = pd.read_excel(xls, sheet_name=name, header=header_row)
    return sheets
