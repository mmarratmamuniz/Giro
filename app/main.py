import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.v1.api import api_router
import app.models  # Ensures SQLAlchemy models are loaded

app = FastAPI(
    title="Mercado Gestão API",
    description="Sistema de Gestão para Conveniências e Mercados",
    version="1.0.0"
)

# CORS (mantido para compatibilidade com desenvolvimento externo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas da API
app.include_router(api_router, prefix="/api/v1")

@app.on_event("startup")
def on_startup():
    if not os.path.exists("data"):
        os.makedirs("data")
    db_path = "data/mercado.db"
    # Se o banco não existe, executa a inicialização padrão
    if not os.path.exists(db_path):
        from app.db.init_db import init_db
        init_db()

# Servir o Frontend (HTML, CSS, JS) diretamente pelo FastAPI
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

# Arquivos estáticos (css/, js/, etc.)
app.mount("/css",  StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")),  name="css")
app.mount("/js",   StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")),   name="js")
app.mount("/img",  StaticFiles(directory=os.path.join(FRONTEND_DIR, "img")),  name="img")

# Página principal — qualquer rota não-API devolve o index.html
@app.get("/", response_class=FileResponse)
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
