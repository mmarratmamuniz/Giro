import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models.category import Category
from app.models.product import Product
from app.models.user import User
from app.models.stock_movement import StockMovement
from app.services.product_service import ProductService
from app.services.inventory_service import InventoryService
from app.services.sale_service import SaleService
from app.services.purchase_service import PurchaseService
from app.schemas.product import ProductCreate, ProductUpdate
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.schemas.purchase import PurchaseCreate, PurchaseItemCreate
from fastapi import HTTPException

# Setup in-memory SQLite database for clean isolated testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    
    # Seed testing user
    test_user = User(username="service_tester", hashed_password="hashedpassword", is_admin=True)
    session.add(test_user)
    session.commit()
    
    yield session
    
    session.close()
    Base.metadata.drop_all(bind=engine)

def test_product_service_operations(db):
    # 1. Create a category
    cat = Category(name="Test Category")
    db.add(cat)
    db.commit()

    # 2. Create product
    prod_data = ProductCreate(
        sku="SKU123",
        name="Test Product",
        cost_price=10.0,
        sale_price=20.0,
        stock_quantity=15,
        min_stock=5,
        category_id=cat.id
    )
    product = ProductService.create_product(db, prod_data)
    assert product.id is not None
    assert product.sku == "SKU123"
    assert product.stock_quantity == 15

    # 3. Get product by SKU
    retrieved = ProductService.get_product_by_sku(db, "SKU123")
    assert retrieved is not None
    assert retrieved.name == "Test Product"

    # 4. Update product
    update_data = ProductUpdate(
        name="Updated Name",
        sale_price=25.0
    )
    updated = ProductService.update_product(db, product.id, update_data)
    assert updated.name == "Updated Name"
    assert updated.sale_price == 25.0

    # 5. Delete product
    deleted = ProductService.delete_product(db, product.id)
    assert deleted is not None
    assert ProductService.get_product(db, product.id) is None

def test_inventory_service_operations(db):
    # 1. Create category and product
    cat = Category(name="Drinks")
    db.add(cat)
    db.commit()

    product = Product(
        sku="DRINK1",
        name="Soda",
        cost_price=2.0,
        sale_price=5.0,
        stock_quantity=10,
        min_stock=5,
        category_id=cat.id,
        is_active=True
    )
    db.add(product)
    db.commit()

    user = db.query(User).first()

    # 2. Update stock: Add
    movement = InventoryService.update_stock(
        db, product_id=product.id, quantity=5, mode="add", origin="MANUAL", user_id=user.id
    )
    db.commit()
    assert product.stock_quantity == 15
    assert movement.movement_type == "IN"
    assert movement.quantity == 5

    # 3. Update stock: Sub
    movement2 = InventoryService.update_stock(
        db, product_id=product.id, quantity=8, mode="sub", origin="MANUAL", user_id=user.id
    )
    db.commit()
    assert product.stock_quantity == 7
    assert movement2.movement_type == "OUT"
    assert movement2.quantity == 8

    # 4. Update stock: Sub (insufficient)
    with pytest.raises(ValueError):
        InventoryService.update_stock(
            db, product_id=product.id, quantity=10, mode="sub", origin="MANUAL", user_id=user.id
        )

    # 5. Get low stock products
    low_stock = InventoryService.get_low_stock_products(db)
    assert len(low_stock) == 0  # stock is 7, min_stock is 5
    
    # Reduce stock below minimum
    InventoryService.update_stock(
        db, product_id=product.id, quantity=3, mode="sub", origin="MANUAL", user_id=user.id
    )
    db.commit()
    assert product.stock_quantity == 4
    low_stock = InventoryService.get_low_stock_products(db)
    assert len(low_stock) == 1
    assert low_stock[0].sku == "DRINK1"

def test_sale_service_create_sale(db):
    # 1. Setup category and products
    cat = Category(name="Snacks")
    db.add(cat)
    db.commit()

    prod = Product(
        sku="SNACK1",
        name="Chips",
        cost_price=1.5,
        sale_price=4.0,
        stock_quantity=20,
        min_stock=5,
        category_id=cat.id,
        is_active=True
    )
    db.add(prod)
    db.commit()

    user = db.query(User).first()

    # 2. Create a sale
    sale_data = SaleCreate(
        total_amount=8.0,  # will be computed by service based on DB prices
        payment_method="Cofre/Dinheiro",
        items=[
            SaleItemCreate(product_id=prod.id, quantity=2, unit_price=4.0)
        ]
    )

    sale = SaleService.create_sale(db, sale_data, user.id)
    assert sale.id is not None
    assert sale.total_amount == 8.0
    assert prod.stock_quantity == 18

    # Verify stock movement was registered
    movement = db.query(StockMovement).filter(StockMovement.product_id == prod.id).first()
    assert movement is not None
    assert movement.movement_type == "OUT"
    assert movement.quantity == 2
    assert movement.origin == "SALE"

def test_sale_service_insufficient_stock_rollback(db):
    # 1. Setup product with low stock
    cat = Category(name="Snacks")
    db.add(cat)
    db.commit()

    prod = Product(
        sku="SNACK2",
        name="Chocolate",
        cost_price=2.0,
        sale_price=5.0,
        stock_quantity=3,
        min_stock=2,
        category_id=cat.id,
        is_active=True
    )
    db.add(prod)
    db.commit()

    user = db.query(User).first()

    # 2. Attempt to sell more than stock has
    sale_data = SaleCreate(
        total_amount=20.0,
        payment_method="PIX",
        items=[
            SaleItemCreate(product_id=prod.id, quantity=4, unit_price=5.0)
        ]
    )

    # Should raise HTTPException due to ValueError
    with pytest.raises(HTTPException) as exc_info:
        SaleService.create_sale(db, sale_data, user.id)
    
    assert exc_info.value.status_code == 400
    assert "Estoque insuficiente" in exc_info.value.detail

    # Verify stock was NOT reduced (rollback check)
    db.refresh(prod)
    assert prod.stock_quantity == 3

def test_purchase_service_create_purchase(db):
    # 1. Setup product
    cat = Category(name="Snacks")
    db.add(cat)
    db.commit()

    prod = Product(
        sku="SNACK3",
        name="Candy",
        cost_price=0.5,
        sale_price=1.5,
        stock_quantity=10,
        min_stock=2,
        category_id=cat.id,
        is_active=True
    )
    db.add(prod)
    db.commit()

    user = db.query(User).first()

    # 2. Create purchase
    purchase_data = PurchaseCreate(
        supplier="Doces Distribuidora",
        total_amount=5.0,
        items=[
            PurchaseItemCreate(product_id=prod.id, quantity=10, unit_cost=0.5)
        ]
    )

    purchase = PurchaseService.create_purchase(db, purchase_data, user.id)
    assert purchase.id is not None
    assert purchase.total_amount == 5.0
    
    # Verify stock increased
    db.refresh(prod)
    assert prod.stock_quantity == 20

    # Verify stock movement registered
    movement = db.query(StockMovement).filter(
        StockMovement.product_id == prod.id,
        StockMovement.movement_type == "IN"
    ).first()
    assert movement is not None
    assert movement.quantity == 10
    assert movement.origin == "PURCHASE"
