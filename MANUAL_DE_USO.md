# 🍺 Finish Bebidas - Guia Prático de Uso do Sistema

Manual simples, direto e passo a passo para operadores de caixa e administradores utilizarem o sistema no dia a dia.

---

## 📌 Sumário Rápido
1. [Primeiro Acesso e Login](#1-primeiro-acesso-e-login)
2. [Rotina Diária: Abertura e Fechamento de Caixa](#2-rotina-diária-abertura-e-fechamento-de-caixa)
3. [Operando o PDV (Frente de Caixa)](#3-operando-o-pdv-frente-de-caixa)
4. [Cancelamento de Venda e Devolução](#4-cancelamento-de-venda-e-devolução)
5. [Controle de Estoque e Alertas](#5-controle-de-estoque-e-alertas)
6. [Lançamento de Compras (Entrada de Mercadorias)](#6-lançamento-de-compras-entrada-de-mercadorias)
7. [Relatórios e Lucro Real](#7-relatórios-e-lucro-real)
8. [Gerenciamento de Usuários](#8-gerenciamento-de-usuários)
9. [Tabela de Atalhos de Teclado](#9-tabela-de-atalhos-de-teclado)

---

## 1. Primeiro Acesso e Login

1. Abra o navegador e acerte o endereço do sistema (ex: `http://localhost:3000/login`).
2. Digite seu **e-mail** e **senha**:
   - **Administrador Padrão**: `admin@finishbebidas.com` (Senha: `admin123`)
   - **Operador Padrão**: `caixa@finishbebidas.com` (Senha: `caixa123`)
3. Clique em **Entrar no Sistema**.

---

## 2. Rotina Diária: Abertura e Fechamento de Caixa

O controle de caixa garante que o dinheiro em gaveta bata com o registrado nas vendas.

### 🟢 Como Abrir o Caixa (Início do Turno):
1. Acesse o menu **Controle de Caixa** (ou clique no botão **Abrir Caixa** no topo do PDV).
2. Clique em **Abrir Turno de Caixa**.
3. Digite o **Fundo de Troco** (o valor em moedas/cédulas que você colocou na gaveta).
4. Clique em **Confirmar Abertura**. O status ficará verde: **Caixa Aberto**.

### 🟡 Como Lançar Sangria ou Suprimento durante o dia:
* **Sangria (Retirada de Dinheiro):** Quando a gaveta acumula muito dinheiro e você retira para guardar no cofre.
* **Suprimento (Entrada de Troco):** Quando você precisa adicionar mais notas miúdas ou moedas na gaveta.
1. No menu **Controle de Caixa**, clique em **Sangria / Suprimento / Fechar**.
2. Escolha o tipo (`Sangria` ou `Suprimento`), informe o valor e o motivo (ex: *"Sangria para cofre"*).
3. Confirme. O sistema registrará na hora o ajuste do saldo.

### 🔴 Como Fechar o Caixa (Fim do Turno):
1. No menu **Controle de Caixa**, selecione a opção **Fechar Caixa**.
2. Conte o dinheiro físico que está na gaveta e digite no campo **Valor em Dinheiro Contado**.
3. O sistema calcula automaticamente se houve **Sobra**, **Falta** ou se o saldo **Bateu exato**.
4. Clique em **Encerrar Turno**.

---

## 3. Operando o PDV (Frente de Caixa)

O PDV foi feito para ser ágil e pode ser operado via mouse ou teclado:

### Passo a Passo de uma Venda:
1. **Buscar Produto:**
   - Use o leitor de código de barras para bipar a garrafa/lata, OU
   - Pressione **F4** e digite o nome ou código do produto, pressionando **Enter** para adicionar ao carrinho.
2. **Ajustar Quantidades:**
   - Use os botões `+` e `-` na lista do carrinho à direita.
3. **Aplicar Desconto (Opcional):**
   - No painel lateral, informe um desconto em **R$** (valor fixo) ou **%** (porcentagem). O total recalculada imediatamente.
4. **Cobrar a Venda:**
   - Pressione o atalho **F8** (ou clique no botão verde **Cobrar**).
   - Escolha a forma de pagamento: **Dinheiro**, **Pix**, **Crédito** ou **Débito**.
   - Se for em **Dinheiro**, digite o valor que o cliente entregou para que o sistema informe o **Troco exato**.
   - Clique em **Finalizar Venda**.
5. **Comprovante Térmico:**
   - O comprovante da venda aparece pronto na tela no padrão 80mm/58mm.
   - Clique em **Imprimir Comprovante** ou pressione **ESC** para voltar à tela de vendas.

---

## 4. Cancelamento de Venda e Devolução

Se uma venda foi registrada por engano ou o cliente desistiu da compra:

1. Acesse o menu **Histórico de Vendas**.
2. Localize a venda pelo número do cupom (#ID) ou busque pelos filtros.
3. Clique no botão vermelho **Estornar / Cancelar**.
4. Digite o motivo do cancelamento e confirme.
5. **O que o sistema faz automaticamente:**
   - Marca a venda como **CANCELADA**.
   - Devolve todos os itens vendidos de volta ao estoque.
   - Remove o valor do lucro e faturamento dos relatórios.

---

## 5. Controle de Estoque e Alertas

Acesse o menu **Estoque**:

* **Cadastrar Produto Novo:** Clique em **+ Novo Produto**, informe nome, código de barras (SKU), categoria, preço de custo, preço de venda e o estoque mínimo.
* **Aba Alertas de Estoque:** Mostra automaticamente todas as bebidas que atingiram ou estão abaixo da quantidade mínima definida. Ideal para montar a lista de compras da semana.
* **Aba Movimentações:** Mostra o histórico de auditoria (todas as entradas por compra, saídas por venda ou ajustes manuais com data e hora).

---

## 6. Lançamento de Compras (Entrada de Mercadorias)

Quando chegar uma carga de mercadorias da distribuidora:

1. Acesse o menu **Compras**.
2. Informe o nome do **Fornecedor** (opcional).
3. Selecione o produto, digite a **quantidade recebida** e o **custo unitário pago**.
4. Clique em **Adicionar Item** (você pode colocar vários produtos na mesma nota).
5. Clique em **Finalizar e Dar Entrada no Estoque**.
   - O saldo de estoque de cada bebida é incrementado na hora.

---

## 7. Relatórios e Lucro Real

Acesse o menu **Relatórios**:

* **Métricas Financeiras Principais:**
  - **Faturamento Bruto:** Total vendido (desconsiderando cancelamentos).
  - **Custo Total (CMV):** O quanto foi pago aos fornecedores pelas bebidas vendidas.
  - **Lucro Real:** Faturamento líquido deduzindo o custo de compra e os descontos dados no caixa.
* **Gráficos Visuais:**
  - Distribuição das vendas por forma de pagamento (Pix vs Dinheiro vs Cartão).
  - Vendas por categoria (Cervejas, Destilados, Refrigerantes, etc.).

---

## 8. Gerenciamento de Usuários

Acesse o menu **Usuários** *(exclusivo para Administrador Geral)*:

* **Cadastrar Novo Operador:** Clique em **+ Novo Usuário**, informe nome, e-mail, senha e o perfil (`Operador de Caixa` ou `Administrador`).
* **Excluir Usuário:** O ADM Geral pode excluir operadores antigos clicando no ícone de lixeira, mantendo a integridade do banco de dados.

---

## 9. Tabela de Atalhos de Teclado (PDV)

| Tecla de Atalho | Ação Executada |
| :---: | :--- |
| **F2** | Limpa o carrinho e inicia uma **Nova Venda** |
| **F4** | Coloca o cursor imediatamente no campo de **Busca / Código de Barras** |
| **F8** | Abre a tela de **Cobrança / Pagamento** |
| **Enter** | Se digitou o código exato ou leitor bipou, adiciona o produto na hora |
| **ESC** | Fecha telas abertas (modal de pagamento, caixa ou comprovante) |

---
*Finish Bebidas - Sistema de Gestão e Frente de Caixa*
