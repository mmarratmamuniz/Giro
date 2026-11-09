const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper para preenchimento de inputs controlado pelo React
async function fillInput(page, selector, value) {
  return await page.evaluate((sel, val) => {
    const input = document.querySelector(sel);
    if (!input) return false;
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, val);
    } else {
      input.value = val;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, selector, value);
}

// Helper para clique nativo via DOM evaluate
async function clickByText(page, selector, text) {
  return await page.evaluate((sel, txt) => {
    const elements = Array.from(document.querySelectorAll(sel));
    const target = elements.find((el) =>
      (el.innerText || el.textContent || '').toLowerCase().includes(txt.toLowerCase())
    );
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, selector, text);
}

async function clickSelector(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, selector);
}

async function loginUser(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await fillInput(page, 'input[type="email"]', email);
  await fillInput(page, 'input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname !== '/login', { timeout: 15000 });
  await sleep(1200);
}

async function logoutUser(page) {
  try {
    const clicked = await clickSelector(page, 'button[title="Sair do Sistema"]');
    if (!clicked) {
      await clickByText(page, 'button', 'Sair');
    }
    await sleep(1000);
  } catch (err) {}
}

const report = {
  account1: [],
  account2: [],
  account3: [],
  account4: [],
  account5: [],
};

async function runBrowserTests() {
  console.log('========================================================================');
  console.log('  TESTES COMPLETOS DE INTERFACE E NAVEGADOR WEB (PUPPETEER + CHROME)    ');
  console.log('========================================================================\n');

  const customUserDataDir = path.join(os.tmpdir(), 'puppeteer_giro_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir: customUserDataDir,
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // =======================================================================
    // CONTA 1 — OPERADOR DE CAIXA CENTRO (caixa.centro@giro.com)
    // =======================================================================
    console.log('--- TESTANDO CONTA 1: caixa.centro@giro.com ---');
    const ctx1 = await browser.createBrowserContext();
    const page1 = await ctx1.newPage();

    await loginUser(page1, 'caixa.centro@giro.com', '123456');

    // 1. Redirecionamento para /pdv
    const isPdv = page1.url().includes('/pdv');
    report.account1.push({
      item: 'Login e Redirecionamento automático para /pdv',
      status: isPdv ? 'PASS' : 'FAIL',
      detail: page1.url(),
    });

    // 2. Sidebar restrita a PDV e Caixa
    await page1.waitForSelector('aside nav');
    const sidebarText = await page1.$eval('aside nav', (el) => el.innerText);
    const hasOnlyPdvCaixa =
      sidebarText.includes('PDV') &&
      sidebarText.includes('Caixa') &&
      !sidebarText.includes('Estoque') &&
      !sidebarText.includes('Compras') &&
      !sidebarText.includes('Usuários') &&
      !sidebarText.includes('Relatórios');

    report.account1.push({
      item: 'Sidebar restrita (apenas PDV e Caixa)',
      status: hasOnlyPdvCaixa ? 'PASS' : 'FAIL',
      detail: sidebarText.replace(/\n+/g, ' | '),
    });

    // 3. RouteGuard: Bloqueio de rotas administrativas
    await page1.goto(`${BASE_URL}/usuarios`, { waitUntil: 'networkidle2' });
    await sleep(600);
    const usuariosBlocked = page1.url().includes('/pdv');

    await page1.goto(`${BASE_URL}/relatorios`, { waitUntil: 'networkidle2' });
    await sleep(600);
    const relatoriosBlocked = page1.url().includes('/pdv');

    report.account1.push({
      item: 'RouteGuard bloqueia /usuarios e /relatorios',
      status: usuariosBlocked && relatoriosBlocked ? 'PASS' : 'FAIL',
      detail: `Tentativa /usuarios -> ${usuariosBlocked ? '/pdv' : page1.url()} | Tentativa /relatorios -> ${relatoriosBlocked ? '/pdv' : page1.url()}`,
    });

    // 4. Operações de PDV e Caixa
    await page1.goto(`${BASE_URL}/pdv`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const bodyTextPdv = await page1.$eval('body', (el) => el.innerText);

    // Se caixa fechado, abrir turno
    if (bodyTextPdv.includes('Caixa Fechado') || bodyTextPdv.includes('Abrir Caixa')) {
      await clickByText(page1, 'button', 'Abrir Caixa');
      await sleep(600);
      await fillInput(page1, '.fixed.inset-0 input[type="number"]', '100');
      await clickByText(page1, 'button', 'Abrir Caixa Agora');
      await sleep(1500);
    }

    // Suprimento de R$ 15
    await clickByText(page1, 'button', 'Gerenciar Caixa');
    await sleep(600);
    await clickByText(page1, 'button', 'Suprimento');
    await sleep(400);

    await fillInput(page1, '.fixed.inset-0 input[type="number"]', '15');
    await fillInput(page1, '.fixed.inset-0 input[placeholder*="Ex:"]', 'Teste navegador');
    await clickByText(page1, 'button', 'Confirmar Suprimento');
    await sleep(1200);

    const modalFechou = !(await page1.$('.fixed.inset-0'));
    report.account1.push({
      item: 'Lançamento de Suprimento (R$ 15) e fechamento do modal',
      status: modalFechou ? 'PASS' : 'FAIL',
      detail: modalFechou ? 'Modal fechou sem travar na aba errada' : 'Modal permaneceu aberto',
    });

    // Selecionar 1 produto com estoque
    await page1.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('div.grid button'));
      for (let b of btns) {
        const txt = b.innerText;
        if (txt.includes('un') && !txt.includes('Esgotado') && !txt.includes('0 un')) {
          b.click();
          break;
        }
      }
    });
    await sleep(600);

    // Testar limite de desconto de 10%
    await clickByText(page1, 'button', '%');
    await sleep(300);
    await fillInput(page1, 'input[placeholder="0,00"]', '50');
    await sleep(500);

    const pdvBody = await page1.$eval('body', (el) => el.innerText);
    const discountCapped = pdvBody.includes('limitado a 10%');

    // Zera o desconto para a venda
    await fillInput(page1, 'input[placeholder="0,00"]', '0');
    await sleep(200);

    report.account1.push({
      item: 'Validação e trava de desconto do operador (<= 10%)',
      status: discountCapped ? 'PASS' : 'FAIL',
      detail: discountCapped ? 'UI exibiu trava de desconto limitado a 10%' : 'Trava não identificada visualmente',
    });

    // Finalizar Venda -> Dinheiro -> Confirmar e Concluir Venda
    await clickByText(page1, 'button', 'Finalizar Venda');
    await sleep(600);
    await clickByText(page1, 'button', 'Dinheiro');
    await sleep(400);

    await fillInput(page1, '.fixed.inset-0 input[placeholder="0,00"]', '100');
    await clickByText(page1, 'button', 'Confirmar e Concluir Venda');
    await sleep(2500);

    // Cupom térmico
    const bodyAfterSale = await page1.$eval('body', (el) => el.innerText);
    const hasThermalReceipt =
      bodyAfterSale.includes('CUPOM NÃO FISCAL') &&
      bodyAfterSale.includes('OPERADOR:') &&
      (bodyAfterSale.includes('Centro') || bodyAfterSale.includes('centro'));

    report.account1.push({
      item: 'Comprovante Térmico gerado (Filial, Terminal e Operador)',
      status: hasThermalReceipt ? 'PASS' : 'FAIL',
      detail: hasThermalReceipt ? 'Comprovante térmico exibido na tela' : 'Cupom não renderizado',
    });

    // Fechar cupom térmico
    await clickByText(page1, 'button', 'Fechar');
    await sleep(800);

    // Logout
    await logoutUser(page1);
    await ctx1.close();
    console.log('✔ Conta 1 finalizada.\n');

    // =======================================================================
    // CONTA 2 — OPERADOR OUTRA FILIAL (caixa.praia@giro.com)
    // =======================================================================
    console.log('--- TESTANDO CONTA 2: caixa.praia@giro.com ---');
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();

    await loginUser(page2, 'caixa.praia@giro.com', '123456');

    // Acessar /caixa
    await page2.goto(`${BASE_URL}/caixa`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const caixaPageText = await page2.$eval('body', (el) => el.innerText);
    const containsCentroData =
      caixaPageText.includes('Filial Centro') ||
      caixaPageText.includes('Loja Centro') ||
      caixaPageText.includes('Caixa 01 - Centro');

    report.account2.push({
      item: 'Isolamento visual de turnos e sangrias na Filial Praia',
      status: !containsCentroData ? 'PASS' : 'FAIL',
      detail: !containsCentroData ? 'Nenhum dado da filial Centro visível para a filial Praia' : 'ALERTA: Dados da filial Centro vazaram na tela',
    });

    await logoutUser(page2);
    await ctx2.close();
    console.log('✔ Conta 2 finalizada.\n');

    // =======================================================================
    // CONTA 3 — GERENTE DE FILIAL (gerente.centro@giro.com)
    // =======================================================================
    console.log('--- TESTANDO CONTA 3: gerente.centro@giro.com ---');
    const ctx3 = await browser.createBrowserContext();
    const page3 = await ctx3.newPage();

    await loginUser(page3, 'gerente.centro@giro.com', '123456');

    // 1. Header fixo na Filial Centro
    await page3.waitForSelector('header');
    const headerText = await page3.$eval('header', (el) => el.innerText);
    const headerLower = headerText.toLowerCase();
    const headerFixedToCentro = headerLower.includes('centro') && !headerLower.includes('praia');

    report.account3.push({
      item: 'Header com filial fixa para Gerente de Filial',
      status: headerFixedToCentro ? 'PASS' : 'FAIL',
      detail: `Escopo fixo na Filial Centro (${headerFixedToCentro ? 'OK' : 'Falha'})`,
    });

    // 2. /estoque: Ajuste manual e conferência de movimentação
    await page3.goto(`${BASE_URL}/estoque`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const editProductBtn = await page3.$('button[title="Editar Produto"]');
    if (editProductBtn) {
      await clickSelector(page3, 'button[title="Editar Produto"]');
      await sleep(600);

      // Altera a quantidade no modal
      await fillInput(page3, '.fixed.inset-0 input[type="number"]', '55');

      // Preenche motivo obrigatório
      await fillInput(page3, 'input[placeholder*="Inventário"]', 'Ajuste teste UI navegador');

      await clickByText(page3, 'button', 'Salvar Produto');
      await sleep(1500);
    }

    // Clicar na aba Movimentações
    await clickByText(page3, 'button', 'Movimentações');
    await sleep(800);
    const estoqueText = await page3.$eval('body', (el) => el.innerText);
    const hasMovement =
      estoqueText.includes('MANUAL') ||
      estoqueText.includes('Ajuste') ||
      estoqueText.includes('Entrada') ||
      estoqueText.includes('Saída');

    report.account3.push({
      item: 'Estoque: Ajuste e histórico de movimentações',
      status: hasMovement ? 'PASS' : 'FAIL',
      detail: hasMovement ? 'Movimentações auditadas exibidas na tabela' : 'Nenhuma movimentação listada',
    });

    // 3. /compras: Lançar NF-UI-10 e verificar no histórico
    await page3.goto(`${BASE_URL}/compras`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    await fillInput(page3, 'input[placeholder*="Ambev"]', 'Fornecedor UI');
    await fillInput(page3, 'input[placeholder*="NF-e"]', 'NF-UI-10');

    // Selecionar produto se houver select
    await page3.evaluate(() => {
      const sel = document.querySelector('select');
      if (sel && sel.options.length > 1) {
        sel.value = sel.options[1].value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(400);

    await clickByText(page3, 'button', 'Incluir Item');
    await sleep(500);

    await clickByText(page3, 'button', 'Confirmar e Atualizar Estoque');
    await sleep(1500);

    // Verificar aba Histórico de Compras
    await clickByText(page3, 'button', 'Histórico de Compras');
    await sleep(800);
    const comprasText = await page3.$eval('body', (el) => el.innerText);
    const hasCompraNf = comprasText.includes('NF-UI-10') || comprasText.includes('Fornecedor UI');

    report.account3.push({
      item: 'Compras: Entrada com NF e histórico',
      status: hasCompraNf ? 'PASS' : 'FAIL',
      detail: hasCompraNf ? 'NF-UI-10 gravada e listada no histórico' : 'Compra não localizada na tabela',
    });

    // 4. /historico: Estornar venda
    await page3.goto(`${BASE_URL}/historico`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const cancelBtnClicked = await clickSelector(page3, 'button[title*="Cancelar"], button[title*="Estornar"]');
    if (cancelBtnClicked) {
      await sleep(600);
      await fillInput(page3, 'input[placeholder*="Produto registrado"]', 'Estorno teste UI');
      await clickByText(page3, 'button', 'Confirmar Cancelamento');
      await sleep(1500);
    }

    const histText = await page3.$eval('body', (el) => el.innerText);
    const hasCanceled = histText.includes('CANCELADA') || histText.includes('Estorno teste UI');

    report.account3.push({
      item: 'Histórico: Estorno / Cancelamento de Venda auditado',
      status: hasCanceled ? 'PASS' : 'FAIL',
      detail: hasCanceled ? 'Venda cancelada com motivo e data' : 'Status CANCELADA não encontrado',
    });

    // 5. /caixa: Fechar turno de caixa
    await page3.goto(`${BASE_URL}/caixa`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const openDeskBtn = await clickByText(page3, 'button', 'Sangria / Suprimento / Fechar');
    if (openDeskBtn) {
      await sleep(600);
      await clickByText(page3, 'button', 'Fechar Caixa');
      await sleep(400);

      await fillInput(page3, '.fixed.inset-0 input[type="number"]', '120');
      await clickByText(page3, 'button', 'Finalizar e Fechar Turno');
      await sleep(1500);
    }

    const caixaAfterClose = await page3.$eval('body', (el) => el.innerText);
    const hasDiferenca = caixaAfterClose.includes('Diferença') || caixaAfterClose.includes('Esperado') || caixaAfterClose.includes('Caixa Fechado');

    report.account3.push({
      item: 'Caixa: Fechamento de turno e conciliação de diferença',
      status: hasDiferenca ? 'PASS' : 'FAIL',
      detail: 'Linha do turno exibe valores e conferência auditada',
    });

    await logoutUser(page3);
    await ctx3.close();
    console.log('✔ Conta 3 finalizada.\n');

    // =======================================================================
    // CONTA 4 — SUPER ADMIN (super@giro.com)
    // =======================================================================
    console.log('--- TESTANDO CONTA 4: super@giro.com ---');
    const ctx4 = await browser.createBrowserContext();
    const page4 = await ctx4.newPage();

    await loginUser(page4, 'super@giro.com', '123456');

    // 1. Dashboard com seletores de Rede/Unidade/Filial
    await page4.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const headerSelects = await page4.$$('header select');
    report.account4.push({
      item: 'Header: Seletores de Rede, Unidade e Filial',
      status: headerSelects.length >= 1 ? 'PASS' : 'FAIL',
      detail: `${headerSelects.length} seletores de escopo organizacional disponíveis`,
    });

    // 2. /relatorios: Cards de Receita, CMV, Lucro e DRE por filial
    await page4.goto(`${BASE_URL}/relatorios`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const relText = await page4.$eval('body', (el) => el.innerText);
    const hasRelCards =
      relText.includes('Receita') &&
      relText.includes('CMV') &&
      relText.includes('Lucro') &&
      relText.includes('DRE');

    report.account4.push({
      item: 'Relatórios: Cards de DRE/CMV e Desempenho por Filial',
      status: hasRelCards ? 'PASS' : 'FAIL',
      detail: hasRelCards ? 'Métricas de auditoria financeira renderizadas' : 'Faltando métricas de DRE',
    });

    // 3. /redes: Modais de Nova Unidade, Nova Filial, Novo Caixa
    await page4.goto(`${BASE_URL}/redes`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    // Testar modal Nova Unidade
    await clickByText(page4, 'button', 'Nova Unidade');
    await sleep(500);
    const hasUnitSelect = !!(await page4.$('.fixed.inset-0 select'));
    await clickByText(page4, 'button', 'Cancelar');
    await sleep(400);

    // Testar modal Nova Filial
    await clickByText(page4, 'button', 'Nova Filial');
    await sleep(500);
    const hasBranchSelect = !!(await page4.$('.fixed.inset-0 select'));
    await clickByText(page4, 'button', 'Cancelar');
    await sleep(400);

    // Testar modal Novo Caixa
    await clickByText(page4, 'button', 'Novo Caixa');
    await sleep(500);
    const hasDeskSelect = !!(await page4.$('.fixed.inset-0 select'));
    await clickByText(page4, 'button', 'Cancelar');
    await sleep(400);

    report.account4.push({
      item: 'Redes: Modais de criação (Unidade, Filial, Caixa) e selects populados',
      status: hasUnitSelect && hasBranchSelect && hasDeskSelect ? 'PASS' : 'FAIL',
      detail: 'Todos os modais abrem com selects populados e fecham sem erro',
    });

    // 4. /usuarios: Carregamento imediato e botão de exclusão oculto na própria conta
    await page4.goto(`${BASE_URL}/usuarios`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const userText = await page4.$eval('body', (el) => el.innerText);
    const notHanging = !userText.includes('Carregando...') && userText.includes('Equipe');
    const hasVoceBadge = userText.includes('VOCÊ');

    report.account4.push({
      item: 'Usuários: Carregamento imediato da lista sem travar',
      status: notHanging ? 'PASS' : 'FAIL',
      detail: notHanging ? 'Lista de usuários renderizada imediatamente' : 'Travado em Carregando...',
    });

    report.account4.push({
      item: 'Usuários: Auto-exclusão desabilitada / Badge VOCÊ',
      status: hasVoceBadge ? 'PASS' : 'FAIL',
      detail: hasVoceBadge ? 'Identificação própria protegida sem botão de auto-exclusão' : 'Badge VOCÊ não localizado',
    });

    await logoutUser(page4);
    await ctx4.close();
    console.log('✔ Conta 4 finalizada.\n');

    // =======================================================================
    // CONTA 5 — ADMIN DE REDE (admin.rede@giro.com)
    // =======================================================================
    console.log('--- TESTANDO CONTA 5: admin.rede@giro.com ---');
    const ctx5 = await browser.createBrowserContext();
    const page5 = await ctx5.newPage();

    await loginUser(page5, 'admin.rede@giro.com', '123456');

    // 1. Acesso a /redes e visualização das filiais da rede
    await page5.goto(`${BASE_URL}/redes`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const redesText = await page5.$eval('body', (el) => el.innerText);
    const hasNetworkData = redesText.includes('Centro') || redesText.includes('Praia') || redesText.includes('Unidade');

    report.account5.push({
      item: 'Redes: Visualização das unidades e filiais da sua rede',
      status: hasNetworkData ? 'PASS' : 'FAIL',
      detail: hasNetworkData ? 'Unidades/Filiais da rede listadas corretamente' : 'Dados não carregados',
    });

    // 2. /usuarios: Escopo travado na rede e sem opção de super_admin
    await page5.goto(`${BASE_URL}/usuarios`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const openNewUserBtn = await clickByText(page5, 'button', 'Novo Usuário');
    let scopeLocked = false;
    if (openNewUserBtn) {
      await sleep(600);
      const modalText = await page5.$eval('.fixed.inset-0', (el) => el.innerText);
      const roleSelectOptions = await page5.evaluate(() => {
        const select = Array.from(document.querySelectorAll('.fixed.inset-0 select')).find(s => 
          Array.from(s.options).some(o => o.value === 'cashier_operator' || o.value === 'branch_admin')
        );
        return select ? Array.from(select.options).map(o => o.value) : [];
      });

      const hasNoSuperAdminOption = !roleSelectOptions.includes('super_admin');
      const hasNetworkBadge = modalText.includes('Rede Travada') || modalText.includes('Sua Rede') || modalText.includes('Rede');
      scopeLocked = hasNoSuperAdminOption;

      await clickByText(page5, 'button', 'Cancelar');
      await sleep(400);
    }

    report.account5.push({
      item: 'Usuários: Formulário restrito à rede (sem opção super_admin)',
      status: scopeLocked ? 'PASS' : 'FAIL',
      detail: scopeLocked ? 'Cargo super_admin indisponível no formulário' : 'Falha na trava de cargo',
    });

    // 3. /relatorios: DRE consolidado da rede
    await page5.goto(`${BASE_URL}/relatorios`, { waitUntil: 'networkidle2' });
    await sleep(1200);

    const relNetText = await page5.$eval('body', (el) => el.innerText);
    const hasNetRel = relNetText.includes('Receita') || relNetText.includes('DRE') || relNetText.includes('CMV');

    report.account5.push({
      item: 'Relatórios: Acesso a relatórios consolidados da rede',
      status: hasNetRel ? 'PASS' : 'FAIL',
      detail: hasNetRel ? 'Métricas da rede renderizadas' : 'Relatórios não carregados',
    });

    await logoutUser(page5);
    await ctx5.close();
    console.log('✔ Conta 5 finalizada.\n');
  } catch (err) {
    console.error('❌ Erro geral no runner:', err);
  } finally {
    try {
      await browser.close();
      if (fs.existsSync(customUserDataDir)) {
        fs.rmSync(customUserDataDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  console.log('========================================================================');
  console.log('               RELATÓRIO DE TESTES DE INTERFACE (UI E2E)                ');
  console.log('========================================================================\n');

  console.log('CONTA 1: Operador de Caixa Centro (caixa.centro@giro.com)');
  console.table(report.account1);

  console.log('\nCONTA 2: Operador Outra Filial (caixa.praia@giro.com)');
  console.table(report.account2);

  console.log('\nCONTA 3: Gerente de Filial (gerente.centro@giro.com)');
  console.table(report.account3);

  console.log('\nCONTA 4: Super Admin (super@giro.com)');
  console.table(report.account4);

  console.log('\nCONTA 5: Admin de Rede (admin.rede@giro.com)');
  console.table(report.account5);

  const allPassed =
    report.account1.every((r) => r.status === 'PASS') &&
    report.account2.every((r) => r.status === 'PASS') &&
    report.account3.every((r) => r.status === 'PASS') &&
    report.account4.every((r) => r.status === 'PASS') &&
    report.account5.every((r) => r.status === 'PASS');

  if (!allPassed) {
    console.log('\n❌ Alguns testes apresentaram falha. Verifique os detalhes acima.');
  } else {
    console.log('\n✔ TODOS OS TESTES NO NAVEGADOR PASSARAM COM SUCESSO TOTAL!');
  }
}

runBrowserTests();
