from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.sale import SaleItem
from datetime import datetime, timedelta
from typing import Optional


class InventoryService:
    @staticmethod
    def update_stock(
        db: Session,
        product_id: int,
        quantity: int,
        mode: str = "add",
        origin: str = "MANUAL",
        user_id: Optional[int] = None,
        note: Optional[str] = None,
    ) -> StockMovement:
        """
        Atualiza o estoque de um produto e grava movimentação no log.

        Args:
            mode: "add" para compras/entradas, "sub" para vendas/saídas
            origin: "SALE" | "PURCHASE" | "MANUAL"
            user_id: ID do usuário que realizou a operação (rastreabilidade)
            note: Observação opcional para o log

        Returns:
            O objeto StockMovement criado.

        Raises:
            ValueError: Se não houver estoque suficiente para uma saída.
            LookupError: Se o produto não for encontrado.
        """
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise LookupError(f"Produto com ID {product_id} não encontrado.")

        if mode == "add":
            product.stock_quantity += quantity
            movement_type = "IN"
        elif mode == "sub":
            if product.stock_quantity < quantity:
                raise ValueError(
                    f"Estoque insuficiente para '{product.name}'. "
                    f"Disponível: {product.stock_quantity}, Solicitado: {quantity}."
                )
            product.stock_quantity -= quantity
            movement_type = "OUT"
        else:
            raise ValueError(f"Modo inválido: '{mode}'. Use 'add' ou 'sub'.")

        movement = StockMovement(
            product_id=product_id,
            movement_type=movement_type,
            quantity=quantity,
            origin=origin,
            user_id=user_id,
            note=note,
        )
        db.add(movement)
        # Não fazemos commit aqui — deixamos o serviço pai controlar a transação.
        return movement

    @staticmethod
    def get_low_stock_products(db: Session):
        """Retorna produtos com estoque igual ou abaixo do mínimo definido."""
        return (
            db.query(Product)
            .filter(Product.stock_quantity <= Product.min_stock, Product.is_active == True)
            .order_by(Product.stock_quantity.asc())
            .all()
        )

    @staticmethod
    def get_stagnant_products(db: Session, days: int = 30):
        """
        Retorna produtos que não tiveram nenhuma saída (venda) nos últimos `days` dias.
        Considera apenas produtos ativos com estoque > 0.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Busca IDs de produtos com movimentações de saída recentes
        from app.models.stock_movement import StockMovement
        active_product_ids = (
            db.query(StockMovement.product_id)
            .filter(
                StockMovement.movement_type == "OUT",
                StockMovement.date >= cutoff,
            )
        )

        stagnant = (
            db.query(Product)
            .filter(
                Product.is_active == True,
                Product.stock_quantity > 0,
                ~Product.id.in_(active_product_ids),
            )
            .order_by(Product.name.asc())
            .all()
        )
        return stagnant


    @staticmethod
    def get_top_products(db: Session, limit: int = 10, days: int = 30):
        """
        Retorna os produtos mais vendidos (por quantidade) nos últimos `days` dias.
        """
        from app.models.sale import Sale, SaleItem
        cutoff = datetime.utcnow() - timedelta(days=days)

        results = (
            db.query(
                Product.id,
                Product.name,
                Product.sku,
                func.sum(SaleItem.quantity).label("total_sold"),
                func.sum(SaleItem.quantity * SaleItem.unit_price).label("total_revenue"),
            )
            .join(SaleItem, Product.id == SaleItem.product_id)
            .join(SaleItem.sale)
            .filter(SaleItem.sale_id.isnot(None))
            .group_by(Product.id)
            .order_by(func.sum(SaleItem.quantity).desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "name": r.name,
                "sku": r.sku,
                "total_sold": r.total_sold,
                "total_revenue": float(r.total_revenue or 0),
            }
            for r in results
        ]
