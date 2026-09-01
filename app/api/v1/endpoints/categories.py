from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.category import Category, CategoryCreate
from app.services.category_service import CategoryService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Category])
def read_categories(db: Session = Depends(get_db)):
    # Seed default categories on the first fetch if table is empty
    CategoryService.seed_categories(db)
    return CategoryService.get_categories(db)

@router.post("/", response_model=Category, status_code=status.HTTP_201_CREATED)
def create_category(
    category: CategoryCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
        
    db_cat = CategoryService.get_category_by_name(db, name=category.name)
    if db_cat:
        raise HTTPException(status_code=400, detail="Categoria com este nome já existe")
    return CategoryService.create_category(db, category=category)
