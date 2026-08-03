from fastapi import APIRouter, HTTPException

from ingest import aggregate, snapshot

router = APIRouter()


@router.get("/current")
def get_current():
    summary = snapshot.load_current_summary()
    if summary is None:
        raise HTTPException(status_code=404, detail="No spreadsheet uploaded yet.")
    return summary


@router.get("/deal/{deal_id}")
def get_deal(deal_id: int):
    tables = snapshot.load_current_tables()
    if not tables or "open_deals" not in tables:
        raise HTTPException(status_code=404, detail="No spreadsheet uploaded yet.")
    df = tables["open_deals"]
    if deal_id < 0 or deal_id >= len(df):
        raise HTTPException(status_code=404, detail="Deal not found in the current snapshot.")
    return aggregate.build_deal_detail(df.iloc[deal_id])


@router.get("/seller/{seller_id}")
def get_seller(seller_id: int):
    tables = snapshot.load_current_tables()
    if not tables or "sellers" not in tables or "open_deals" not in tables:
        raise HTTPException(status_code=404, detail="No spreadsheet uploaded yet.")
    df = tables["sellers"]
    if seller_id < 0 or seller_id >= len(df):
        raise HTTPException(status_code=404, detail="Seller not found in the current snapshot.")
    return aggregate.build_seller_detail(df.iloc[seller_id], tables["open_deals"])
