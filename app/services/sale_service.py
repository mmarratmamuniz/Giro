from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.schemas.sale import SaleCreate
from app.services.inventory_service import InventoryService
from datetime import datetime
from typing import Optional


class SaleService:
    @staticmethod
    def create_sale(db: Session, sale: SaleCreate, user_id: int):
        """
        Registra uma nova venda.
        - Calcula o total com base nos preços do banco (proteção contra adulteração).
        - Valida e baixa estoque de todos os itens atomicamente.
        - Em caso de qualquer falha (estoque, produto inexistente), reverte tudo.
        """
        items_snapshot = []

        # ── 1. Validar todos os produtos e calcular total ────────────────────
        for item in sale.items:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Produto com ID {item.product_id} não encontrado.",
                )
            if not product.is_active:
                raise HTTPException(
                    status_code=400,
                    detail=f"Produto '{product.name}' está inativo.",
                )
            items_snapshot.append(
                {"product": product, "quantity": item.quantity, "unit_price": product.sale_price}
            )

        total_amount = sum(s["quantity"] * s["unit_price"] for s in items_snapshot)

        # ── 2. Baixar estoque atomicamente (com rollback em erro) ────────────
        try:
            for snap in items_snapshot:
                InventoryService.update_stock(
                    db,
                    product_id=snap["product"].id,
                    quantity=snap["quantity"],
                    mode="sub",
                    origin="SALE",
                    user_id=user_id,
                    note=f"Venda registrada pelo usuário ID {user_id}",
                )
        except (ValueError, LookupError) as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(e))

        # ── 3. Gravar a venda ────────────────────────────────────────────────
        db_sale = Sale(
            total_amount=total_amount,
            payment_method=sale.payment_method,
            user_id=user_id,
        )
        db.add(db_sale)
        db.flush()  # obtém o ID da venda antes de commitar

        for snap in items_snapshot:
            db.add(SaleItem(
                sale_id=db_sale.id,
                product_id=snap["product"].id,
                quantity=snap["quantity"],
                unit_price=snap["unit_price"],
            ))

        db.commit()
        db.refresh(db_sale)
        return db_sale

    @staticmethod
    def get_sales(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        payment_method: Optional[str] = None,
    ):
        query = db.query(Sale)
        if start_date:
            query = query.filter(func.date(Sale.date) >= start_date)
        if end_date:
            query = query.filter(func.date(Sale.date) <= end_date)
        if payment_method and payment_method != "Todos":
            query = query.filter(Sale.payment_method == payment_method)
        sales = query.order_by(Sale.date.desc()).offset(skip).limit(limit).all()
        # Enrich items with product names
        for sale in sales:
            for item in sale.items:
                product = db.query(Product).filter(Product.id == item.product_id).first()
                if product:
                    item.product_name = product.name
        return sales

    @staticmethod
    def get_sale_by_id(db: Session, sale_id: int):
        sale = db.query(Sale).filter(Sale.id == sale_id).first()
        if not sale:
            return None
        for item in sale.items:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product:
                item.product_name = product.name
        return sale
