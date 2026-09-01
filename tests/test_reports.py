import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models.category import Category
from app.models.product import Product
from app.models.purchase import Purchase, PurchaseItem
from app.models.sale import Sale, SaleItem
from app.models.user import User
from app.services.category_service import CategoryService
from app.services.purchase_service import PurchaseService
from app.services.dashboard_service import DashboardService
from app.services.sale_service import SaleService

# Setup in-memory SQLite database for clean isolated testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    # Create the database tables
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    
    # Seed standard administrator for testing relationship constraints
    test_user = User(username="test_admin", hashed_password="hashedpassword", is_admin=True)
    session.add(test_user)
    session.commit()
    
    yield session
    
    session.close()
    # Drop all tables after test function completes
    Base.metadata.drop_all(bind=engine)

def test_category_seeding(db):
    """
    Test that standard beverage and snack categories are successfully
    seeded and registered if they don't already exist.
    """
    CategoryService.seed_categories(db)
    
    categories = db.query(Category).all()
    assert len(categories) == 5
    
    names = [c.name for c in categories]
    assert "Cervejas e Chopes" in names
    assert "Destilados" in names
    assert "Refrigerantes e Sucos" in names
    assert "Petiscos e Salgadinhos" in names
    assert "Outros" in names

def test_purchases_period_filtering(db):
    """
    Test that the purchases period date filter successfully retrieves
    entries within the selected start/end range and excludes other entries.
    """
    # 1. Seed dummy categories and products
    cat = Category(name="Outros")
    db.add(cat)
    db.commit()
    
    product = Product(
        sku="TESTSKU",
        name="Teste Produto",
        cost_price=5.0,
        sale_price=10.0,
        stock_quantity=10,
        category_id=cat.id
    )
    db.add(product)
    db.commit()
    
    # 2. Add purchase yesterday (2026-05-17)
    p1 = Purchase(
        date=datetime(2026, 5, 17, 10, 0, 0),
        supplier="Fornecedor A",
        total_amount=50.0
    )
    db.add(p1)
    db.commit()
    
    item1 = PurchaseItem(purchase_id=p1.id, product_id=product.id, quantity=10, unit_cost=5.0)
    db.add(item1)
    db.commit()
    
    # 3. Add purchase today (2026-05-18)
    p2 = Purchase(
        date=datetime(2026, 5, 18, 14, 0, 0),
        supplier="Fornecedor B",
        total_amount=120.0
    )
    db.add(p2)
    db.commit()
    
    item2 = PurchaseItem(purchase_id=p2.id, product_id=product.id, quantity=24, unit_cost=5.0)
    db.add(item2)
    db.commit()
    
    # Query with date filter for today (2026-05-18)
    today_purchases = PurchaseService.get_purchases(
        db,
        start_date="2026-05-18",
        end_date="2026-05-18"
    )
    
    assert len(today_purchases) == 1
    assert today_purchases[0].supplier == "Fornecedor B"
    assert today_purchases[0].total_amount == 120.0

def test_dashboard_cmv_gross_profit(db):
    """
    Test that the estimated_profit calculation matches the real CMV formula:
    Lucro = Qtd Vendida * (Preço Venda - Preço Custo)
    and successfully maps faturamento cards.
    """
    # 1. Seed dummy categories and products
    cat = Category(name="Outros")
    db.add(cat)
    db.commit()
    
    # Custo: R$ 6.00, Venda: R$ 10.00 (Lucro por item = R$ 4.00)
    prod = Product(
        sku="BEER1",
        name="Skol Latão",
        cost_price=6.0,
        sale_price=10.0,
        stock_quantity=20,
        category_id=cat.id
    )
    db.add(prod)
    db.commit()
    
    # 2. Add Sale (5 units of Skol Latão)
    # Total Venda = 50.00
    # Custo Real = 30.00
    # Lucro Real (CMV) = 20.00
    user = db.query(User).first()
    sale = Sale(
        date=datetime.now(),
        total_amount=50.0,
        payment_method="PIX",
        user_id=user.id
    )
    db.add(sale)
    db.commit()
    
    item = SaleItem(
        sale_id=sale.id,
        product_id=prod.id,
        quantity=5,
        unit_price=10.0
    )
    db.add(item)
    db.commit()
    
    # Run dashboard summary query
    summary = DashboardService.get_sales_summary(db)
    
    assert summary["sales_today"] == 50.0
    assert summary["sales_monthly"] == 50.0
    assert summary["total_qty_sold"] == 5
    assert summary["estimated_profit"] == 20.0  # Real Gross Margin calculation
