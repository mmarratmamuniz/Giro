from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import get_db
from app.models.stock_movement import StockMovement
from app.models.product import Product
from app.models.user import User
from app.api.deps import get_current_user
from app.services.inventory_service import InventoryService
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


# ─── Schemas de saída ────────────────────────────────────────────────────────

class StockMovementOut(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    movement_type: str
    quantity: int
    origin: str
    note: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    date: datetime

    class Config:
        from_attributes = True


class LowStockOut(BaseModel):
    id: int
    name: str
    sku: str
    stock_quantity: int
    min_stock: int
    deficit: int  # Quantidade que falta para atingir o mínimo

    class Config:
        from_attributes = True


class StagnantProductOut(BaseModel):
    id: int
    name: str
    sku: str
    stock_quantity: int
    days_stagnant: Optional[int] = None

    class Config:
        from_attributes = True


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/movements", response_model=List[StockMovementOut])
def get_movements(
    product_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista o histórico de movimentações de estoque com filtros opcionais."""
    query = db.query(StockMovement)
    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    if start_date:
        query = query.filter(func.date(StockMovement.date) >= start_date)
    if end_date:
        query = query.filter(func.date(StockMovement.date) <= end_date)

    movements = query.order_by(StockMovement.date.desc()).limit(500).all()

    # Enriquecer com nome do produto e do usuário
    for m in movements:
        product = db.query(Product).filter(Product.id == m.product_id).first()
        m.product_name = product.name if product else f"Produto #{m.product_id}"
        if m.user_id:
            user = db.query(User).filter(User.id == m.user_id).first()
            m.user_name = (user.full_name or user.username) if user else None

    return movements


@router.get("/low-stock", response_model=List[LowStockOut])
def get_low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista produtos com estoque igual ou abaixo do mínimo configurado."""
    products = InventoryService.get_low_stock_products(db)
    return [
        {
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "stock_quantity": p.stock_quantity,
            "min_stock": p.min_stock,
            "deficit": max(0, p.min_stock - p.stock_quantity),
        }
        for p in products
    ]


@router.get("/stagnant")
def get_stagnant_products(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista produtos ativos com estoque > 0 que não tiveram saída nos últimos N dias."""
    from datetime import timedelta
    products = InventoryService.get_stagnant_products(db, days=days)
    cutoff = datetime.utcnow() - timedelta(days=days)

    result = []
    for p in products:
        # Busca a última movimentação de saída deste produto
        last_out = (
            db.query(func.max(StockMovement.date))
            .filter(StockMovement.product_id == p.id, StockMovement.movement_type == "OUT")
            .scalar()
        )
        days_stagnant = (datetime.utcnow() - last_out).days if last_out else None
        result.append({
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "stock_quantity": p.stock_quantity,
            "days_stagnant": days_stagnant,
        })

    return result


@router.get("/top-products")
def get_top_products(
    limit: int = 10,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna os produtos mais vendidos por quantidade nos últimos N dias."""
    return InventoryService.get_top_products(db, limit=limit, days=days)
