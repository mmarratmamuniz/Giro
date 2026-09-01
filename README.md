# Mercado Gestão - Sistema Profissional de Gestão Comercial

Este projeto é um sistema de gestão robusto para conveniências e mercados, desenvolvido com foco em modularidade e escalabilidade.

## 🏗️ Arquitetura do Projeto

O sistema utiliza uma **Arquitetura em Camadas (Layered Architecture)**, separando responsabilidades para facilitar a manutenção e evolução para um sistema de supermercado completo.

### Estrutura de Pastas
```text
mercado-gestao/
├── app/                    # Backend (Python + FastAPI)
│   ├── api/                # Controladores (Rotas HTTP)
│   ├── core/               # Configurações e Segurança
│   ├── db/                 # Infraestrutura de Banco de Dados
│   ├── models/             # Entidades do Banco (SQLAlchemy)
│   ├── schemas/            # Validação de Dados (Pydantic)
│   └── services/           # Lógica de Negócio (Service Layer)
├── frontend/               # Interface (HTML/CSS/JS)
├── data/                   # Banco de Dados SQLite
└── tests/                  # Testes Automatizados
```

## 📦 Explicação dos Módulos

### 1. Cadastro de Produtos
Responsável por gerenciar o inventário. Inclui SKU, categoria, preços (custo e venda) e controle de estoque mínimo para alertas.

### 2. Registro de Compras
Gerencia a entrada de mercadorias. Ao registrar uma compra, o sistema atualiza automaticamente o saldo do estoque e recalcula (opcionalmente) o preço de custo médio.

### 3. Registro de Vendas (PDV)
Interface para saída de produtos. Realiza a baixa automática no estoque e registra a transação financeira.

### 4. Controle de Estoque
Módulo central que monitora movimentações. Garante a integridade dos dados entre compras e vendas.

### 5. Dashboard & Relatórios
Utiliza **Chart.js** para visualizar:
*   Vendas totais por período.
*   Produtos mais vendidos.
*   Nível de estoque crítico.
*   Fluxo de caixa (Entradas vs Saídas).

## 🔄 Fluxo do Sistema

1.  **Suprimento**: Compra de produtos -> Incremento de Estoque -> Registro de Saída Financeira.
2.  **Operação**: Venda ao consumidor -> Decremento de Estoque -> Registro de Entrada Financeira.
3.  **Análise**: Dados consolidados -> Dashboard em tempo real -> Relatórios para tomada de decisão.

## ✨ Melhores Práticas Implementadas

*   **Separação de Preocupações**: Backend e Frontend totalmente desacoplados via API REST.
*   **DRY (Don't Repeat Yourself)**: Lógica centralizada na camada de `services`.
*   **Segurança**: Validação rigorosa de tipos com Pydantic.
*   **Performance**: Uso de FastAPI assíncrono para lidar com múltiplas requisições eficientemente.
*   **Escalabilidade**: Modelagem preparada para migrar de SQLite para PostgreSQL no futuro sem mudar o código-fonte (graças ao SQLAlchemy).

---

## 🚀 Organização Inicial do Backend

O backend está estruturado para suportar injeção de dependência e roteamento modular. Cada recurso (ex: `products`) possui seu próprio conjunto de rotas, esquemas e serviços.
