from app.db.session import engine, Base, SessionLocal
from app.models.category import Category
from app.models.product import Product
from app.models.purchase import Purchase, PurchaseItem
from app.models.sale import Sale, SaleItem
from app.models.user import User
from app.core.security import get_password_hash

def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    # Criar usuário admin padrão se não existir
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin_user = User(
            username="admin",
            hashed_password=get_password_hash("admin123"),
            is_admin=True
        )
        db.add(admin_user)
        db.commit()
        print("Usuário Admin criado: admin / admin123")
    
    db.close()
    print("Banco de dados inicializado com sucesso!")

if __name__ == "__main__":
    init_db()
