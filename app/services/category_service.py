from sqlalchemy.orm import Session
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate

class CategoryService:
    @staticmethod
    def get_categories(db: Session, skip: int = 0, limit: int = 100):
        return db.query(Category).offset(skip).limit(limit).all()

    @staticmethod
    def get_category(db: Session, category_id: int):
        return db.query(Category).filter(Category.id == category_id).first()

    @staticmethod
    def get_category_by_name(db: Session, name: str):
        return db.query(Category).filter(Category.name == name).first()

    @staticmethod
    def create_category(db: Session, category: CategoryCreate):
        db_category = Category(**category.model_dump())
        db.add(db_category)
        db.commit()
        db.refresh(db_category)
        return db_category

    @staticmethod
    def update_category(db: Session, category_id: int, category: CategoryUpdate):
        db_category = db.query(Category).filter(Category.id == category_id).first()
        if not db_category:
            return None
        
        update_data = category.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_category, key, value)
        
        db.commit()
        db.refresh(db_category)
        return db_category

    @staticmethod
    def delete_category(db: Session, category_id: int):
        db_category = db.query(Category).filter(Category.id == category_id).first()
        if db_category:
            db.delete(db_category)
            db.commit()
        return db_category

    @staticmethod
    def seed_categories(db: Session):
        """Seeds standard convenience store categories if the table is empty."""
        if db.query(Category).count() == 0:
            defaults = [
                {"name": "Cervejas e Chopes", "description": "Lagers, IPAs, Pilsens e Chopes artesanais"},
                {"name": "Destilados", "description": "Vinhos, Whiskys, Vodkas, Cachaças e Gins"},
                {"name": "Refrigerantes e Sucos", "description": "Refrigerantes, sucos, águas e energéticos"},
                {"name": "Petiscos e Salgadinhos", "description": "Batatas, amendoins, salgadinhos e doces"},
                {"name": "Outros", "description": "Gelo, carvão, copos descartáveis e conveniência geral"}
            ]
            for d in defaults:
                db_cat = Category(name=d["name"], description=d["description"])
                db.add(db_cat)
            db.commit()
