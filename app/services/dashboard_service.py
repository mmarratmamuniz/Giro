from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.sale import Sale
from app.models.product import Product
from datetime import datetime, timedelta

class DashboardService:
    @staticmethod
    def get_sales_summary(db: Session):
        # Vendas totais
        total_sales = db.query(func.sum(Sale.total_amount)).scalar() or 0.0
        
        # Vendas hoje
        today = datetime.utcnow().date()
        sales_today = db.query(func.sum(Sale.total_amount)).filter(
            func.date(Sale.date) == today
        ).scalar() or 0.0

        # Vendas no mês atual
        start_of_month = today.replace(day=1)
        sales_monthly = db.query(func.sum(Sale.total_amount)).filter(
            func.date(Sale.date) >= start_of_month
        ).scalar() or 0.0

        # Quantidade total vendida (soma de itens)
        from app.models.sale import SaleItem
        total_qty_sold = db.query(func.sum(SaleItem.quantity)).scalar() or 0

        # Contagem de produtos com estoque baixo
        low_stock_count = db.query(Product).filter(
            Product.stock_quantity <= Product.min_stock
        ).count()

        # Compras hoje
        from app.models.purchase import Purchase
        purchases_today = db.query(func.sum(Purchase.total_amount)).filter(
            func.date(Purchase.date) == today
        ).scalar() or 0.0

        # Lucro estimado real (Vendas - Custo de Aquisição dos itens vendidos)
        from app.models.sale import SaleItem
        estimated_profit = db.query(
            func.sum(SaleItem.quantity * (SaleItem.unit_price - Product.cost_price))
        ).join(Product, SaleItem.product_id == Product.id).scalar() or 0.0

        return {
            "total_sales": total_sales,
            "sales_today": sales_today,
            "sales_monthly": sales_monthly,
            "total_qty_sold": total_qty_sold,
            "purchases_today": purchases_today,
            "estimated_profit": estimated_profit,
            "low_stock_count": low_stock_count
        }

    @staticmethod
    def get_sales_by_payment(db: Session, days: int = 30):
        start_date = datetime.utcnow().date() - timedelta(days=days)
        results = db.query(
            Sale.payment_method.label('method'),
            func.sum(Sale.total_amount).label('total')
        ).filter(Sale.date >= start_date).group_by(Sale.payment_method).all()
        return [{"method": r.method, "total": r.total} for r in results]

    @staticmethod
    def get_top_products(db: Session, limit: int = 5):
        from app.models.sale import SaleItem
        results = db.query(
            Product.name,
            func.sum(SaleItem.quantity).label('qty')
        ).join(SaleItem, Product.id == SaleItem.product_id).group_by(Product.id).order_by(func.sum(SaleItem.quantity).desc()).limit(limit).all()
        return [{"name": r.name, "qty": r.qty} for r in results]

    @staticmethod
    def get_sales_by_day(db: Session, days: int = 7):
        # Gráfico de vendas dos últimos X dias
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days-1)
        
        results = db.query(
            func.date(Sale.date).label('date'),
            func.sum(Sale.total_amount).label('total')
        ).filter(
            Sale.date >= start_date
        ).group_by(
            func.date(Sale.date)
        ).all()

        return [{"date": str(r.date), "total": r.total} for r in results]

    @staticmethod
    def get_sales_by_month(db: Session, months: int = 12):
        # Gráfico de vendas por mês (últimos 12 meses)
        start_date = datetime.utcnow().date() - timedelta(days=months * 30)
        
        # Agrupamento compatível com SQLite e PostgreSQL
        if db.bind.dialect.name == "postgresql":
            date_func = func.to_char(Sale.date, 'YYYY-MM')
        else:
            date_func = func.strftime('%Y-%m', Sale.date)

        results = db.query(
            date_func.label('month'),
            func.sum(Sale.total_amount).label('total')
        ).filter(
            Sale.date >= start_date
        ).group_by(
            date_func
        ).order_by(
            date_func.asc()
        ).all()

        return [{"month": r.month, "total": r.total} for r in results]
