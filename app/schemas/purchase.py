from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class PurchaseItemBase(BaseModel):
    product_id: int
    quantity: int
    unit_cost: float

class PurchaseItemCreate(PurchaseItemBase):
    pass

class PurchaseItem(PurchaseItemBase):
    id: int
    class Config:
        from_attributes = True

class PurchaseBase(BaseModel):
    supplier: Optional[str] = None
    total_amount: float

class PurchaseCreate(PurchaseBase):
    items: List[PurchaseItemCreate]

class Purchase(PurchaseBase):
    id: int
    date: datetime
    items: List[PurchaseItem]
    class Config:
        from_attributes = True
