from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.session import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    cost_price = Column(Float, default=0.0)
    sale_price = Column(Float, nullable=False)
    stock_quantity = Column(Integer, default=0)
    min_stock = Column(Integer, default=5)
    unit = Column(String, default="un")
    is_active = Column(Boolean, default=True)
    category_id = Column(Integer, ForeignKey("categories.id"))

    category = relationship("Category", back_populates="products")
    movements = relationship("StockMovement", back_populates="product")
