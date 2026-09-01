from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class SaleItemBase(BaseModel):
    product_id: int
    quantity: int
    unit_price: float

class SaleItemCreate(SaleItemBase):
    pass

class SaleItem(SaleItemBase):
    id: int
    product_name: Optional[str] = None
    class Config:
        from_attributes = True

class SaleBase(BaseModel):
    total_amount: float
    payment_method: str

class SaleCreate(SaleBase):
    items: List[SaleItemCreate]

class Sale(SaleBase):
    id: int
    date: datetime
    items: List[SaleItem]
    user_id: Optional[int] = None
    class Config:
        from_attributes = True
