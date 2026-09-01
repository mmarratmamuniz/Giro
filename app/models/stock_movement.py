from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    movement_type = Column(String, nullable=False)  # 'IN' ou 'OUT'
    quantity = Column(Integer, nullable=False)
    origin = Column(String, nullable=False)         # 'SALE', 'PURCHASE', 'MANUAL'
    note = Column(String, nullable=True)            # Observação opcional
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Quem fez
    date = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="movements")
    user = relationship("User")
