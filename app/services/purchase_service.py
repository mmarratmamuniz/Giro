from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.purchase import Purchase, PurchaseItem
from app.models.product import Product
from app.schemas.purchase import PurchaseCreate
from app.services.inventory_service import InventoryService


class PurchaseService:
    @staticmethod
    def create_purchase(db: Session, purchase: PurchaseCreate, user_id: int):
        """
        Registra uma nova entrada de mercadoria.
        - Calcula o total a partir dos itens (sem confiar no payload).
        - Aumenta o estoque de cada produto e grava a movimentação com o usuário.
        """
        # ── 1. Validar produtos ──────────────────────────────────────────────
        for item in purchase.items:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Produto com ID {item.product_id} não encontrado.",
                )

        # ── 2. Calcular total ────────────────────────────────────────────────
        total_amount = sum(item.quantity * item.unit_cost for item in purchase.items)

        # ── 3. Gravar a compra ───────────────────────────────────────────────
        db_purchase = Purchase(
            supplier=purchase.supplier,
            total_amount=total_amount,
        )
        db.add(db_purchase)
        db.flush()  # obtém o ID antes de commitar

        # ── 4. Adicionar itens e atualizar estoque ───────────────────────────
        for item in purchase.items:
            db.add(PurchaseItem(
                purchase_id=db_purchase.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
            ))
            InventoryService.update_stock(
                db,
                product_id=item.product_id,
                quantity=item.quantity,
                mode="add",
                origin="PURCHASE",
                user_id=user_id,
                note=f"Compra #{db_purchase.id} — fornecedor: {purchase.supplier or 'N/A'}",
            )

        db.commit()
        db.refresh(db_purchase)
        return db_purchase

    @staticmethod
    def get_purchases(
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        start_date: str = None,
        end_date: str = None
    ):
        from sqlalchemy import func
        query = db.query(Purchase)
        if start_date:
            query = query.filter(func.date(Purchase.date) >= start_date)
        if end_date:
            query = query.filter(func.date(Purchase.date) <= end_date)
            
        return query.order_by(Purchase.date.desc()).offset(skip).limit(limit).all()
