from pydantic import BaseModel
from typing import Optional

class ProductBase(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    cost_price: float = 0.0
    sale_price: float
    stock_quantity: int = 0
    min_stock: int = 5
    unit: Optional[str] = "un"
    is_active: Optional[bool] = True
    category_id: Optional[int] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None
    stock_quantity: Optional[int] = None
    min_stock: Optional[int] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None
    category_id: Optional[int] = None

class Product(ProductBase):
    id: int

    class Config:
        from_attributes = True
