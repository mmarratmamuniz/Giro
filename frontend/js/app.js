let salesChart = null;
let cart = [];
let allProducts = [];
let token = localStorage.getItem('token');

// Theme Setup
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeIcon) {
        themeIcon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
        lucide.createIcons();
    }
    
    // Update chart colors if it exists
    if (salesChart) {
        salesChart.options.scales.x.ticks.color = theme === 'light' ? '#52525b' : '#a1a1aa';
        salesChart.options.scales.y.ticks.color = theme === 'light' ? '#52525b' : '#a1a1aa';
        salesChart.options.scales.x.grid.color = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        salesChart.options.scales.y.grid.color = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        salesChart.update();
    }
}

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
}

// Auth Check
if (!token) {
    document.getElementById('login-overlay').style.display = 'flex';
} else {
    document.getElementById('login-overlay').style.display = 'none';
}

// Login Logic
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', document.getElementById('login-username').value);
    formData.append('password', document.getElementById('login-password').value);

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.access_token) {
            token = data.access_token;
            localStorage.setItem('token', token);
            document.getElementById('login-overlay').style.display = 'none';
            showToast('Login realizado com sucesso!');
            checkPermissions();
            initClock();
        } else {
            showToast(data.detail || 'Falha no login', 'error');
        }
    } catch (e) {
        showToast('Erro de conexão com o servidor', 'error');
    }
});

function logout() {
    localStorage.removeItem('token');
    location.reload();
}

async function checkPermissions() {
    try {
        const me = await api.get('/users/me');
        const isAdmin = me && me.is_admin;
        
        // Control visibility
        const elements = {
            'nav-users': isAdmin,
            'nav-dashboard': isAdmin,
            'nav-inventory': isAdmin,
            'nav-purchases': isAdmin,
            'nav-movements': isAdmin,
            'nav-reports': isAdmin
        };

        for (const [id, visible] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? '' : 'none';
        }

        // Update User Profile UI
        document.getElementById('user-display-name').innerText = me.full_name || me.username;
        document.getElementById('user-role').innerText = isAdmin ? 'Administrador' : 'Operador de Caixa';
        document.getElementById('user-initials').innerText = (me.full_name || me.username).substring(0, 1).toUpperCase();

        if (isAdmin) {
            initDashboard();
        } else {
            showSection('sales');
        }
    } catch (e) {
        initDashboard();
    }
}

let paymentChart = null;
let topProductsChart = null;

let monthlySalesChart = null;

// Dashboard Initialization
async function initDashboard() {
    try {
        const summary = await api.get('/dashboard/summary');
        document.getElementById('today-sales').innerText = formatCurrency(summary.sales_today || 0);
        document.getElementById('monthly-sales').innerText = formatCurrency(summary.sales_monthly || 0);
        document.getElementById('estimated-profit').innerText = formatCurrency(summary.estimated_profit || 0);
        document.getElementById('total-qty-sold').innerText = `${summary.total_qty_sold || 0} un`;
        document.getElementById('low-stock-count').innerText = summary.low_stock_count || 0;

        const chartData = await api.get('/dashboard/sales-chart');
        renderChart(chartData);

        const monthlySalesData = await api.get('/dashboard/sales-by-month');
        renderMonthlySalesChart(monthlySalesData);

        const paymentData = await api.get('/dashboard/sales-by-payment');
        renderPaymentChart(paymentData);

        const topProductsData = await api.get('/dashboard/top-products');
        renderTopProductsChart(topProductsData);
    } catch (e) {
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function renderMonthlySalesChart(data) {
    const ctx = document.getElementById('monthlySalesChart').getContext('2d');
    if (monthlySalesChart) monthlySalesChart.destroy();

    monthlySalesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.month),
            datasets: [{
                label: 'Faturamento (R$)',
                data: data.map(d => d.total),
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                x: { grid: { display: false }, ticks: { color: '#64748b' } }
            }
        }
    });
}

function renderChart(data) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    if (salesChart) salesChart.destroy();

    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [{
                label: 'Vendas (R$)',
                data: data.map(d => d.total),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366f1',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                x: { grid: { display: false }, ticks: { color: '#64748b' } }
            }
        }
    });
}

function renderPaymentChart(data) {
    const ctx = document.getElementById('paymentChart').getContext('2d');
    if (paymentChart) paymentChart.destroy();

    const colors = {
        'PIX': '#22c55e',
        'Dinheiro': '#f59e0b',
        'Cartão de Crédito': '#6366f1',
        'Cartão de Débito': '#06b6d4'
    };

    paymentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.method),
            datasets: [{
                data: data.map(d => d.total),
                backgroundColor: data.map(d => colors[d.method] || '#94a3b8'),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#64748b' } }
            },
            cutout: '70%'
        }
    });
}

function renderTopProductsChart(data) {
    const ctx = document.getElementById('topProductsChart').getContext('2d');
    if (topProductsChart) topProductsChart.destroy();

    topProductsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.name.length > 15 ? d.name.substring(0,15)+'...' : d.name),
            datasets: [{
                label: 'Qtd Vendida',
                data: data.map(d => d.qty),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#64748b' } }
            }
        }
    });
}

// Section Management
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(`${section}-section`).style.display = 'block';
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick').includes(section)) item.classList.add('active');
    });

    const titles = { 
        'dashboard': 'Dashboard Principal', 
        'sales': 'Frente de Caixa (PDV)', 
        'inventory': 'Gestão de Estoque',
        'purchases': 'Gestão de Suprimentos (Compras)',
        'history': 'Histórico de Vendas',
        'stock-movements': 'Movimentações de Estoque',
        'reports': 'Painel de Relatórios Gerenciais',
        'users': 'Usuários e Funcionários'
    };
    document.getElementById('section-title').innerText = titles[section] || 'Sistema';

    if (section === 'dashboard') initDashboard();
    if (section === 'inventory') loadInventory();
    if (section === 'sales') initPDV();
    if (section === 'purchases') initPurchases();
    if (section === 'history') initHistory();
    if (section === 'stock-movements') initStockMovements();
    if (section === 'reports') initReports();
    if (section === 'users') initUsers();
    
    lucide.createIcons();
}

// PDV Logic
let selectedProductId = null;

async function initPDV() {
    allProducts = await api.get('/products/');
    renderSearchResults('');
}

document.getElementById('pdv-search').addEventListener('input', (e) => {
    renderSearchResults(e.target.value);
});

function renderSearchResults(query) {
    if (!query) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    const results = allProducts.filter(p => 
        p.is_active && (
            p.name.toLowerCase().includes(query.toLowerCase()) || 
            p.sku.toLowerCase().includes(query.toLowerCase())
        )
    ).slice(0, 5);

    const container = document.getElementById('search-results');
    container.innerHTML = results.map(p => `
        <div class="search-result-item" onclick="selectProductForCart(${p.id})">
            <div class="cart-item-info">
                <span class="cart-item-name">${p.name}</span>
                <span class="cart-item-meta">${p.sku} &bull; Estoque: ${p.stock_quantity}</span>
            </div>
            <strong style="color: var(--primary);">${formatCurrency(p.sale_price)}</strong>
        </div>
    `).join('');
}

function selectProductForCart(productId) {
    selectedProductId = productId;
    const product = allProducts.find(p => p.id === productId);
    
    document.getElementById('selected-product-name').innerText = product.name;
    document.getElementById('selected-product-price').innerText = formatCurrency(product.sale_price);
    document.getElementById('selected-product-qty').value = 1;
    document.getElementById('selected-product-area').style.display = 'block';
    
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('pdv-search').value = '';
}

function cancelProductSelection() {
    selectedProductId = null;
    document.getElementById('selected-product-area').style.display = 'none';
}

function confirmAddToCart() {
    const qtyInput = document.getElementById('selected-product-qty');
    const qty = parseInt(qtyInput.value);
    
    if (isNaN(qty) || qty <= 0) {
        showToast('Quantidade inválida', 'error');
        return;
    }
    
    const product = allProducts.find(p => p.id === selectedProductId);
    const existing = cart.find(item => item.id === selectedProductId);
    
    if (existing) {
        existing.quantity += qty;
    } else {
        cart.push({ ...product, quantity: qty });
    }
    
    cancelProductSelection();
    renderCart();
    showToast(`${qty}x ${product.name} adicionado ao carrinho`);
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const summaryBlock = document.getElementById('cart-summary');
    
    container.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-meta">${item.quantity}x ${formatCurrency(item.sale_price)}</span>
            </div>
            <button onclick="removeFromCart(${index})" class="btn" style="padding: 0.5rem; background: transparent; border: none; color: var(--danger);">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `).join('');
    
    if (cart.length > 0) {
        summaryBlock.style.display = 'block';
        const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
        document.getElementById('summary-items').innerText = totalItems;
        
        const total = cart.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);
        document.getElementById('cart-total-value').innerText = total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    } else {
        summaryBlock.style.display = 'none';
    }
    
    lucide.createIcons();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function openCheckout() {
    if (cart.length === 0) return showToast('O carrinho está vazio!', 'error');
    
    const total = cart.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);
    document.getElementById('checkout-total').innerText = formatCurrency(total);
    openModal('checkoutModal');
}

async function confirmCheckout() {
    const total = cart.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);
    const paymentMethod = document.getElementById('payment-method').value;

    // Snapshot the cart BEFORE clearing it (needed for receipt)
    const saleSnapshot = {
        items: cart.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unit_price: item.sale_price
        })),
        total_amount: total,
        payment_method: paymentMethod,
        date: new Date()
    };

    const saleData = {
        total_amount: total,
        payment_method: paymentMethod,
        items: cart.map(item => ({
            product_id: item.id,
            quantity: item.quantity,
            unit_price: item.sale_price
        }))
    };

    try {
        const savedSale = await api.post('/sales/', saleData);
        saleSnapshot.id = savedSale.id;

        cart = [];
        renderCart();
        closeModal('checkoutModal');
        showToast('Venda realizada com sucesso!', 'success');
        initPDV();

        // Offer to print receipt
        printReceipt(saleSnapshot);
    } catch (e) {
        showToast(e.message || 'Erro ao finalizar venda', 'error');
    }
}

// ==================== IMPRESSÃO DE CUPOM ====================
function printReceipt(sale) {
    const storeInfo = {
        name: 'FINISH BEBIDAS',
        address: 'Res. Água Viva - Av. Pres. Nilo Peçanha, 951',
        city: 'Sala 3 - Bessa, Cabedelo - PB',
        phone: '(83) 3245-3713',
        footer: 'Obrigado pela preferência!\nVolte sempre!'
    };

    const dt = sale.date instanceof Date ? sale.date : new Date(sale.date);
    const dateStr = dt.toLocaleDateString('pt-BR');
    const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const itemsHtml = sale.items.map(item => {
        const subtotal = (item.quantity * item.unit_price).toFixed(2).replace('.', ',');
        const unitFmt = item.unit_price.toFixed(2).replace('.', ',');
        const name = item.name.length > 22 ? item.name.substring(0, 22) + '...' : item.name;
        return `
            <tr>
                <td class="item-name">${name}</td>
                <td class="item-qty">${item.quantity}x</td>
                <td class="item-price">R$&nbsp;${subtotal}</td>
            </tr>
            <tr class="item-unit-row">
                <td colspan="3" class="item-unit">R$ ${unitFmt} cada</td>
            </tr>`;
    }).join('');

    const receiptHtml = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Cupom #${sale.id || ''}</title>
    <style>
        @page {
            size: 80mm auto;
            margin: 0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11pt;
            width: 80mm;
            margin: 0 auto;
            padding: 4mm 4mm 8mm;
            background: #fff;
            color: #000;
        }
        .center { text-align: center; }
        .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .store-name { font-size: 14pt; font-weight: bold; }
        .store-info { font-size: 9pt; margin-top: 2px; }
        .sale-info { margin: 6px 0; font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; }
        .item-name { width: 55%; font-size: 10pt; padding: 2px 0; }
        .item-qty  { width: 15%; text-align: center; font-size: 10pt; }
        .item-price{ width: 30%; text-align: right; font-size: 10pt; }
        .item-unit-row td { font-size: 8.5pt; color: #555; padding-bottom: 4px; }
        .total-row { font-size: 14pt; font-weight: bold; }
        .total-row td { padding-top: 4px; }
        .total-label { }
        .total-value { text-align: right; }
        .payment-info { font-size: 10pt; margin: 6px 0; }
        .footer { font-size: 9pt; margin-top: 8px; white-space: pre-line; }
        @media print {
            html, body { width: 80mm; }
            body { padding: 2mm 4mm 12mm; }
        }
    </style>
</head>
<body>
    <div class="center">
        <div class="store-name">${storeInfo.name}</div>
        <div class="store-info">${storeInfo.address}</div>
        <div class="store-info">${storeInfo.city}</div>
        <div class="store-info">Tel: ${storeInfo.phone}</div>
    </div>

    <hr class="divider">

    <div class="sale-info">
        <div>Data: <strong>${dateStr}</strong>  ${timeStr}</div>
        ${sale.id ? `<div>Venda: <strong>#${sale.id}</strong></div>` : ''}
    </div>

    <hr class="divider">

    <table>${itemsHtml}</table>

    <hr class="divider">

    <table>
        <tr class="total-row">
            <td class="total-label">TOTAL</td>
            <td class="total-value">R$ ${sale.total_amount.toFixed(2).replace('.', ',')}</td>
        </tr>
    </table>

    <div class="payment-info">Pagamento: <strong>${sale.payment_method}</strong></div>

    <hr class="divider">

    <div class="center footer">${storeInfo.footer}</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=340,height=600,scrollbars=yes');
    win.document.open();
    win.document.write(receiptHtml);
    win.document.close();
    // Auto-trigger print after content loads
    win.onload = () => {
        win.focus();
        win.print();
    };
}


// Purchases Logic
async function initPurchases() {
    allProducts = await api.get('/products/');
    const select = document.getElementById('purchase-product-id');
    select.innerHTML = allProducts.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
    
    const purchases = await api.get('/purchases/');
    const list = document.getElementById('purchases-list');
    list.innerHTML = purchases.map(p => `
        <div class="card" style="padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong style="font-size: 1.1rem;">Compra #${p.id}</strong>
                <span style="font-weight: 600; color: var(--primary);">${formatCurrency(p.total_amount)}</span>
            </div>
            <div style="color: var(--text-secondary); font-size: 0.85rem; display: flex; justify-content: space-between;">
                <span>Fornecedor: ${p.supplier || 'N/A'}</span>
                <span>${new Date(p.date).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const qty = parseInt(document.getElementById('purchase-qty').value);
    const cost = parseFloat(document.getElementById('purchase-cost').value);
    
    const data = {
        supplier: document.getElementById('purchase-supplier').value,
        total_amount: qty * cost,
        items: [{
            product_id: parseInt(document.getElementById('purchase-product-id').value),
            quantity: qty,
            unit_cost: cost
        }]
    };

    try {
        await api.post('/purchases/', data);
        showToast('Compra registrada e estoque atualizado!');
        closeModal('purchaseModal');
        initPurchases();
    } catch (e) {
        showToast('Erro ao registrar compra', 'error');
    }
});

// ==================== ESTOQUE (INVENTÁRIO) ====================
async function loadInventory() {
    try {
        const [products, lowStock, stagnant] = await Promise.all([
            api.get('/products/'),
            api.get('/stock/low-stock'),
            api.get('/stock/stagnant?days=30'),
        ]);

        // Tabela principal de produtos
        const tbody = document.querySelector('#products-table tbody');
        tbody.innerHTML = products.map(p => {
            const isLow = p.stock_quantity <= p.min_stock;
            return `
            <tr>
                <td style="color: var(--text-secondary); font-family: monospace;">${p.sku}</td>
                <td style="font-weight: 500;">${p.name}</td>
                <td style="color: ${isLow ? 'var(--danger)' : 'var(--success)'}; font-weight: 600;">
                    ${p.stock_quantity}
                    ${isLow ? '<span style="font-size:0.7rem;margin-left:0.25rem;">⚠ baixo</span>' : ''}
                </td>
                <td>${formatCurrency(p.sale_price)}</td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary" style="padding: 0.4rem;" onclick="deleteProduct(${p.id})">
                        <i data-lucide="trash-2" style="width: 16px; color: var(--danger)"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
        lucide.createIcons();

        // Painel: Itens Abaixo do Mínimo
        const lowStockEl = document.getElementById('low-stock-alerts');
        const lowStockList = document.getElementById('low-stock-list');
        if (lowStock && lowStock.length > 0) {
            lowStockEl.style.display = 'block';
            lowStockList.innerHTML = lowStock.map(p => `
                <div class="card" style="padding: 1rem; border-left: 3px solid var(--danger);">
                    <div style="font-weight: 600; font-size: 0.9rem;">${p.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0;">${p.sku}</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 0.5rem;">
                        <span>Atual: <strong style="color: var(--danger);">${p.stock_quantity}</strong></span>
                        <span>Mín: <strong>${p.min_stock}</strong></span>
                        <span style="color: var(--danger);">Faltam: <strong>${p.deficit}</strong></span>
                    </div>
                </div>`);
            lowStockList.innerHTML = lowStock.map(p => `
                <div class="card" style="padding: 1rem; border-left: 3px solid var(--danger);">
                    <div style="font-weight: 600; font-size: 0.9rem;">${p.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0;">${p.sku}</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 0.5rem;">
                        <span>Atual: <strong style="color: var(--danger);">${p.stock_quantity}</strong></span>
                        <span>Mín: <strong>${p.min_stock}</strong></span>
                        <span style="color: var(--danger);">Faltam: <strong>${p.deficit}</strong></span>
                    </div>
                </div>`).join('');
        } else {
            lowStockEl.style.display = 'none';
        }

        // Painel: Produtos Parados
        const stagnantEl = document.getElementById('stagnant-alerts');
        const stagnantList = document.getElementById('stagnant-list');
        if (stagnantEl) {
            if (stagnant && stagnant.length > 0) {
                stagnantEl.style.display = 'block';
                stagnantList.innerHTML = stagnant.map(p => {
                    const days = p.days_stagnant !== null ? `${p.days_stagnant} dias sem venda` : 'Nunca vendido';
                    return `
                    <div class="card" style="padding: 1rem; border-left: 3px solid #f59e0b;">
                        <div style="font-weight: 600; font-size: 0.9rem;">${p.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0;">${p.sku}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 0.5rem;">
                            <span>Estoque: <strong>${p.stock_quantity}</strong></span>
                            <span style="color: #f59e0b;"><strong>${days}</strong></span>
                        </div>
                    </div>`;
                }).join('');
            } else {
                stagnantEl.style.display = 'none';
            }
        }
    } catch(e) {
        showToast('Erro ao carregar estoque', 'error');
    }
}

// Export CSV
function exportToCSV(type) {
    showToast('Use o botão CSV no Histórico de Vendas');
}

// ==================== MOVIMENTAÇÕES DE ESTOQUE ====================
async function initStockMovements() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('smov-end-date').value = today.toISOString().split('T')[0];
    document.getElementById('smov-start-date').value = firstDay.toISOString().split('T')[0];
    await loadMovements();
}

async function filterMovements() { await loadMovements(); }

async function loadMovements() {
    const start = document.getElementById('smov-start-date').value;
    const end = document.getElementById('smov-end-date').value;
    let url = '/stock/movements?';
    if (start) url += `start_date=${start}&`;
    if (end) url += `end_date=${end}`;

    try {
        const movements = await api.get(url);
        const tbody = document.getElementById('movements-tbody');
        const emptyEl = document.getElementById('movements-empty');

        if (!movements || movements.length === 0) {
            tbody.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }
        emptyEl.style.display = 'none';

        tbody.innerHTML = movements.map(m => {
            const dt = new Date(m.date);
            const isIn = m.movement_type === 'IN';
            const color = isIn ? 'var(--success)' : 'var(--danger)';
            const label = isIn ? '↑ ENTRADA' : '↓ SAÍDA';
            const originLabels = { 'SALE': 'Venda', 'PURCHASE': 'Compra', 'MANUAL': 'Manual' };
            const userName = m.user_name || (m.user_id ? `#${m.user_id}` : '—');
            const noteText = m.note ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${m.note}</div>` : '';
            return `
            <tr>
                <td>
                    <div>${dt.toLocaleDateString('pt-BR')}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
                </td>
                <td style="font-weight:500;">${m.product_name || `#${m.product_id}`}</td>
                <td><span style="color:${color};font-weight:700;font-size:0.85rem;">${label}</span></td>
                <td style="color:var(--text-secondary);">${originLabels[m.origin] || m.origin}</td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${userName}${noteText}</td>
                <td style="text-align:right;font-weight:700;color:${color};">${isIn ? '+' : '-'}${m.quantity}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        showToast('Erro ao carregar movimentações', 'error');
    }
}


// ==================== GESTÃO DE USUÁRIOS ====================
let currentUserInfo = null;

async function initUsers() {
    // Load current user to check if admin
    try {
        currentUserInfo = await api.get('/users/me');
        if (!currentUserInfo.is_admin) {
            showToast('Acesso restrito a administradores', 'error');
            showSection('dashboard');
            return;
        }
    } catch(e) { return; }
    await loadUsers();
}

async function loadUsers() {
    try {
        const users = await api.get('/users/');
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = users.map(u => `
        <tr>
            <td style="font-weight:500;">${u.full_name || '—'}</td>
            <td style="font-family:monospace;color:var(--text-muted);">${u.username}</td>
            <td>
                <span style="
                    background: ${u.is_admin ? 'rgba(99,102,241,0.15)' : 'rgba(100,116,139,0.15)'};
                    color: ${u.is_admin ? 'var(--primary)' : 'var(--text-secondary)'};
                    padding: 0.2rem 0.6rem;
                    border-radius: 9999px;
                    font-size: 0.8rem;
                    font-weight: 600;
                ">${u.is_admin ? 'Administrador' : 'Operador'}</span>
            </td>
            <td>
                <span style="
                    color: ${u.is_active ? 'var(--success)' : 'var(--danger)'};
                    font-size: 0.85rem; font-weight: 600;
                ">${u.is_active ? '● Ativo' : '● Inativo'}</span>
            </td>
            <td style="text-align:right;">
                <button class="btn btn-secondary" style="padding:0.35rem 0.65rem;font-size:0.8rem;margin-right:0.25rem;" onclick="toggleUser(${u.id})">
                    ${u.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button class="btn btn-secondary" style="padding:0.35rem 0.4rem;" onclick="deleteUser(${u.id})">
                    <i data-lucide="trash-2" style="width:14px;color:var(--danger);"></i>
                </button>
            </td>
        </tr>`).join('');
        lucide.createIcons();
    } catch (e) {
        showToast('Erro ao carregar usuários', 'error');
    }
}

async function toggleUser(userId) {
    try {
        await api.put(`/users/${userId}/toggle`, {});
        await loadUsers();
        showToast('Status do usuário atualizado!');
    } catch (e) {
        showToast('Erro ao atualizar usuário', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
        await api.delete(`/users/${userId}`);
        await loadUsers();
        showToast('Usuário excluído!');
    } catch (e) {
        showToast('Erro ao excluir usuário', 'error');
    }
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        full_name: document.getElementById('user-fullname').value,
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        is_admin: document.getElementById('user-is-admin').value === 'true'
    };
    try {
        await api.post('/users/', data);
        showToast('Usuário criado com sucesso!');
        closeModal('userModal');
        e.target.reset();
        await loadUsers();
    } catch (e) {
        showToast('Erro ao criar usuário (login já existe?)', 'error');
    }
});

// ==================== HISTÓRICO DE VENDAS ====================
let historySalesData = [];

async function initHistory() {
    // Set default dates (current month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('filter-end-date').value = today.toISOString().split('T')[0];
    document.getElementById('filter-start-date').value = firstDay.toISOString().split('T')[0];
    await loadHistory();
}

async function filterHistory() {
    await loadHistory();
}

async function loadHistory() {
    const start = document.getElementById('filter-start-date').value;
    const end = document.getElementById('filter-end-date').value;
    const payment = document.getElementById('filter-payment').value;

    let url = '/sales/?limit=500';
    if (start) url += `&start_date=${start}`;
    if (end) url += `&end_date=${end}`;
    if (payment && payment !== 'Todos') url += `&payment_method=${encodeURIComponent(payment)}`;

    try {
        historySalesData = await api.get(url);
        renderHistory(historySalesData);
    } catch (e) {
        showToast('Erro ao carregar histórico', 'error');
    }
}

function renderHistory(sales) {
    const tbody = document.getElementById('history-tbody');
    const emptyMsg = document.getElementById('history-empty');
    const summaryEl = document.getElementById('history-summary');

    if (!sales || sales.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        summaryEl.style.display = 'none';
        return;
    }

    emptyMsg.style.display = 'none';
    summaryEl.style.display = 'block';

    // Compute summary
    const total = sales.reduce((a, s) => a + s.total_amount, 0);
    const avg = total / sales.length;
    document.getElementById('hist-total').innerText = formatCurrency(total);
    document.getElementById('hist-count').innerText = sales.length;
    document.getElementById('hist-avg').innerText = formatCurrency(avg);

    const paymentColors = {
        'PIX': 'var(--success)',
        'Dinheiro': '#f59e0b',
        'Cartão de Crédito': 'var(--primary)',
        'Cartão de Débito': '#06b6d4'
    };

    tbody.innerHTML = sales.map(s => {
        const dt = new Date(s.date);
        const dateStr = dt.toLocaleDateString('pt-BR');
        const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const color = paymentColors[s.payment_method] || 'var(--text-secondary)';
        const itemCount = s.items ? s.items.reduce((a, i) => a + i.quantity, 0) : 0;
        return `
        <tr style="cursor: pointer;" onclick="openSaleDetail(${s.id})" class="history-row">
            <td style="font-family: monospace; color: var(--text-muted);">#${s.id}</td>
            <td>
                <div style="font-weight: 500;">${dateStr}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${timeStr}</div>
            </td>
            <td style="color: var(--text-secondary);">${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</td>
            <td>
                <span style="
                    background: ${color}22;
                    color: ${color};
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    border: 1px solid ${color}44;
                ">${s.payment_method}</span>
            </td>
            <td style="text-align: right; font-weight: 700; color: var(--success);">${formatCurrency(s.total_amount)}</td>
            <td style="text-align: right;">
                <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
                    <i data-lucide="eye" style="width: 14px;"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

async function openSaleDetail(saleId) {
    try {
        const sale = await api.get(`/sales/${saleId}`);
        
        document.getElementById('detail-title').innerText = `Venda #${sale.id}`;
        
        const dt = new Date(sale.date);
        const paymentColors = {
            'PIX': 'var(--success)',
            'Dinheiro': '#f59e0b',
            'Cartão de Crédito': 'var(--primary)',
            'Cartão de Débito': '#06b6d4'
        };
        const color = paymentColors[sale.payment_method] || 'var(--text-secondary)';

        document.getElementById('detail-meta').innerHTML = `
            <div class="detail-meta-item">
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Data</span>
                <span style="font-weight: 600;">${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="detail-meta-item">
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Pagamento</span>
                <span style="color: ${color}; font-weight: 700;">${sale.payment_method}</span>
            </div>
        `;

        document.getElementById('detail-items').innerHTML = (sale.items || []).map(item => `
            <tr>
                <td style="font-weight: 500;">${item.product_name || `Produto #${item.product_id}`}</td>
                <td style="text-align: center; color: var(--text-muted);">${item.quantity}</td>
                <td style="text-align: right;">${formatCurrency(item.unit_price)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(item.quantity * item.unit_price)}</td>
            </tr>
        `).join('');

        document.getElementById('detail-total').innerText = formatCurrency(sale.total_amount);
        openModal('saleDetailModal');
    } catch (e) {
        showToast('Erro ao carregar detalhes da venda', 'error');
    }
}

function exportSalesCSV() {
    if (!historySalesData || historySalesData.length === 0) {
        showToast('Nenhuma venda para exportar', 'error');
        return;
    }

    const rows = [['ID', 'Data', 'Hora', 'Forma Pagamento', 'Itens', 'Total (R$)']];
    historySalesData.forEach(s => {
        const dt = new Date(s.date);
        const itemCount = s.items ? s.items.reduce((a, i) => a + i.quantity, 0) : 0;
        rows.push([
            s.id,
            dt.toLocaleDateString('pt-BR'),
            dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            s.payment_method,
            itemCount,
            s.total_amount.toFixed(2).replace('.', ',')
        ]);
    });

    const csvContent = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado com sucesso!');
}

// Utils
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function initClock() {
    const timeEl = document.getElementById('live-time');
    const dateEl = document.getElementById('live-date');
    if (!timeEl || !dateEl) return;
    
    function updateClock() {
        const now = new Date();
        timeEl.innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        dateEl.innerText = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Event Listeners
document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        sku: document.getElementById('sku').value,
        name: document.getElementById('name').value,
        sale_price: parseFloat(document.getElementById('sale_price').value),
        min_stock: parseInt(document.getElementById('min_stock').value)
    };
    
    try {
        await api.post('/products/', data);
        showToast('Produto cadastrado!');
        closeModal('productModal');
        loadInventory();
        e.target.reset();
    } catch (e) {
        showToast('Erro ao cadastrar produto', 'error');
    }
});

// ==========================================
// REPORTS MODULE (FASE 6)
// ==========================================
let reportsState = {
    sales: { all: [], filtered: [], page: 0, limit: 10 },
    purchases: { all: [], filtered: [], page: 0, limit: 10 },
    inventory: { all: [], filtered: [], page: 0, limit: 10 },
    categories: []
};

let productsLookup = {};

async function initReports() {
    // 1. Carregar data padrão (últimos 30 dias até hoje)
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dateInputs = [
        'rep-sales-start', 'rep-sales-end',
        'rep-purchases-start', 'rep-purchases-end',
        'rep-financial-start', 'rep-financial-end'
    ];

    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id.endsWith('start')) el.value = thirtyDaysAgo;
            else el.value = today;
        }
    });

    // 2. Carregar produtos e categorias
    try {
        const [categories, products] = await Promise.all([
            api.get('/categories/'),
            api.get('/products/')
        ]);

        reportsState.categories = categories;
        
        // Criar lookup de produtos rápido
        productsLookup = {};
        products.forEach(p => {
            productsLookup[p.id] = p;
        });

        // Preencher selects
        const salesCat = document.getElementById('rep-sales-category');
        const invCat = document.getElementById('rep-inventory-category');

        const catOptions = ['<option value="Todos">Todos</option>']
            .concat(categories.map(c => `<option value="${c.id}">${c.name}</option>`))
            .join('');

        if (salesCat) salesCat.innerHTML = catOptions;
        if (invCat) invCat.innerHTML = catOptions;
    } catch (e) {
        console.error("Erro ao carregar dados de apoio para relatórios:", e);
    }

    // 3. Exibir aba padrão
    showReportTab('sales-report');
}

function showReportTab(tabName) {
    document.querySelectorAll('.report-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.reports-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`${tabName}-tab`).style.display = 'block';
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'sales-report') loadSalesReport();
    if (tabName === 'purchases-report') loadPurchasesReport();
    if (tabName === 'inventory-report') loadInventoryReport();
    if (tabName === 'financial-report') loadFinancialReport();
    
    lucide.createIcons();
}

// ──────────────────────────────────────────
// 1. RELATÓRIO DE VENDAS
// ──────────────────────────────────────────
async function loadSalesReport() {
    const start = document.getElementById('rep-sales-start').value;
    const end = document.getElementById('rep-sales-end').value;

    try {
        const sales = await api.get(`/sales/?start_date=${start}&end_date=${end}&limit=5000`);
        reportsState.sales.all = sales;
        filterSalesReport();
    } catch (e) {
        showToast('Erro ao carregar relatório de vendas', 'error');
    }
}

function filterSalesReport() {
    const payment = document.getElementById('rep-sales-payment').value;
    const category = document.getElementById('rep-sales-category').value;
    const search = document.getElementById('rep-sales-search').value.toLowerCase();

    reportsState.sales.filtered = reportsState.sales.all.filter(s => {
        if (payment !== 'Todos' && s.payment_method !== payment) return false;

        if (category !== 'Todos') {
            const hasCat = s.items.some(item => {
                const prod = productsLookup[item.product_id];
                return prod && prod.category_id == category;
            });
            if (!hasCat) return false;
        }

        if (search) {
            const matchesId = s.id.toString().includes(search);
            const matchesPay = s.payment_method.toLowerCase().includes(search);
            const matchesProduct = s.items.some(item => 
                item.product_name && item.product_name.toLowerCase().includes(search)
            );
            if (!matchesId && !matchesPay && !matchesProduct) return false;
        }

        return true;
    });

    reportsState.sales.page = 0;
    renderSalesReport();
}

function renderSalesReport() {
    const { filtered, page, limit } = reportsState.sales;
    const tbody = document.querySelector('#rep-sales-table tbody');
    
    const totalAmount = filtered.reduce((sum, s) => sum + s.total_amount, 0);
    const totalCount = filtered.length;
    const ticketAvg = totalCount > 0 ? totalAmount / totalCount : 0;

    document.getElementById('rep-sales-total-amount').innerText = formatCurrency(totalAmount);
    document.getElementById('rep-sales-total-count').innerText = totalCount;
    document.getElementById('rep-sales-ticket-avg').innerText = formatCurrency(ticketAvg);

    const startIdx = page * limit;
    const endIdx = Math.min(startIdx + limit, filtered.length);
    const paginated = filtered.slice(startIdx, endIdx);

    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhuma venda correspondente aos filtros.</td></tr>';
    } else {
        tbody.innerHTML = paginated.map(s => {
            const dt = new Date(s.date);
            const prodList = s.items.map(i => {
                const nome = i.product_name
                    || (productsLookup[i.product_id] && productsLookup[i.product_id].name)
                    || `Produto #${i.product_id}`;
                return `${nome} (${i.quantity}x)`;
            }).join(', ');
            return `
                <tr class="history-row" style="cursor: pointer;" onclick="openSaleDetail(${s.id})">
                    <td style="font-weight:600;">#${s.id}</td>
                    <td>${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
                    <td style="max-width:350px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${prodList}">${prodList}</td>
                    <td><span style="padding:0.25rem 0.5rem; background:rgba(255,255,255,0.05); border-radius:4px;">${s.payment_method}</span></td>
                    <td style="text-align:right; font-weight:700; color:var(--success);">${formatCurrency(s.total_amount)}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('rep-sales-pagination-info').innerText = filtered.length > 0
        ? `Mostrando ${startIdx + 1}-${endIdx} de ${filtered.length}`
        : 'Mostrando 0-0 de 0';

    document.getElementById('rep-sales-prev-btn').disabled = page === 0;
    document.getElementById('rep-sales-next-btn').disabled = endIdx >= filtered.length;
}

function prevSalesReportPage() {
    if (reportsState.sales.page > 0) {
        reportsState.sales.page--;
        renderSalesReport();
    }
}

function nextSalesReportPage() {
    const { filtered, page, limit } = reportsState.sales;
    if ((page + 1) * limit < filtered.length) {
        reportsState.sales.page++;
        renderSalesReport();
    }
}

function exportSalesReportExcel() {
    const { filtered } = reportsState.sales;
    if (filtered.length === 0) {
        showToast('Nenhum dado para exportar', 'error');
        return;
    }

    const rows = [['Código Venda', 'Data / Hora', 'Produtos Vendidos', 'Forma Pagamento', 'Total (R$)']];
    filtered.forEach(s => {
        const dt = new Date(s.date);
        const prodList = s.items.map(i => `${i.product_name} (${i.quantity}un)`).join(' | ');
        rows.push([
            s.id,
            `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR')}`,
            prodList,
            s.payment_method,
            s.total_amount.toFixed(2).replace('.', ',')
        ]);
    });

    const csvContent = rows.map(r => r.map(val => `"${val}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_vendas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Relatório exportado com sucesso!');
}

function printSalesReport() {
    const { filtered } = reportsState.sales;
    if (filtered.length === 0) {
        showToast('Nenhum dado para imprimir', 'error');
        return;
    }

    const start = document.getElementById('rep-sales-start').value;
    const end = document.getElementById('rep-sales-end').value;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório de Vendas - Gerencial</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; background: #fff; }
                    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
                    .logo { font-size: 1.6rem; font-weight: 800; color: #4f46e5; }
                    .logo span { color: #64748b; font-weight: 400; }
                    h1 { font-size: 1.5rem; margin: 10px 0 5px 0; }
                    .meta { font-size: 0.85rem; color: #64748b; }
                    .summary { display: flex; gap: 20px; margin-bottom: 30px; }
                    .stat { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 15px; background: #f8fafc; }
                    .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
                    .stat-value { font-size: 1.3rem; font-weight: 700; margin-top: 5px; color: #0f172a; }
                    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
                    th { text-align: left; padding: 10px; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 600; background: #f1f5f9; }
                    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                    tr:nth-child(even) td { background: #fafafa; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">Finish<span>Bebidas</span></div>
                    <h1>Relatório de Vendas Gerencial</h1>
                    <div class="meta">Período: ${new Date(start).toLocaleDateString('pt-BR')} a ${new Date(end).toLocaleDateString('pt-BR')} | Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
                </div>

                <div class="summary">
                    <div class="stat">
                        <div class="stat-label">Total Faturado</div>
                        <div class="stat-value" style="color:#10b981;">${formatCurrency(filtered.reduce((sum, s) => sum + s.total_amount, 0))}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Nº de Vendas</div>
                        <div class="stat-value">${filtered.length}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Ticket Médio</div>
                        <div class="stat-value" style="color:#4f46e5;">${formatCurrency(filtered.length > 0 ? filtered.reduce((sum, s) => sum + s.total_amount, 0) / filtered.length : 0)}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Data / Hora</th>
                            <th>Produtos Vendidos</th>
                            <th>Forma Pagto.</th>
                            <th style="text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(s => {
                            const dt = new Date(s.date);
                            const prodList = s.items.map(i => `${i.product_name} (${i.quantity}x)`).join(', ');
                            return `
                                <tr>
                                    <td style="font-weight:600;">#${s.id}</td>
                                    <td>${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
                                    <td>${prodList}</td>
                                    <td>${s.payment_method}</td>
                                    <td style="text-align:right; font-weight:700; color:#10b981;">${formatCurrency(s.total_amount)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

// ──────────────────────────────────────────
// 2. RELATÓRIO DE COMPRAS
// ──────────────────────────────────────────
async function loadPurchasesReport() {
    const start = document.getElementById('rep-purchases-start').value;
    const end = document.getElementById('rep-purchases-end').value;

    try {
        const purchases = await api.get(`/purchases/?start_date=${start}&end_date=${end}&limit=5000`);
        reportsState.purchases.all = purchases;
        filterPurchasesReport();
    } catch (e) {
        showToast('Erro ao carregar relatório de compras', 'error');
    }
}

function filterPurchasesReport() {
    const supplier = document.getElementById('rep-purchases-supplier').value.toLowerCase();

    reportsState.purchases.filtered = reportsState.purchases.all.filter(p => {
        if (supplier && p.supplier && !p.supplier.toLowerCase().includes(supplier)) return false;
        return true;
    });

    reportsState.purchases.page = 0;
    renderPurchasesReport();
}

function renderPurchasesReport() {
    const { filtered, page, limit } = reportsState.purchases;
    const tbody = document.querySelector('#rep-purchases-table tbody');

    const totalSpent = filtered.reduce((sum, p) => sum + p.total_amount, 0);
    document.getElementById('rep-purchases-total-amount').innerText = formatCurrency(totalSpent);
    document.getElementById('rep-purchases-total-count').innerText = filtered.length;

    const startIdx = page * limit;
    const endIdx = Math.min(startIdx + limit, filtered.length);
    const paginated = filtered.slice(startIdx, endIdx);

    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhuma compra registrada no período.</td></tr>';
    } else {
        tbody.innerHTML = paginated.map(p => {
            const dt = new Date(p.date);
            const itemsList = p.items ? p.items.map(i => `${i.product_name || `Produto #${i.product_id}`} (${i.quantity}x)`).join(', ') : 'Sem itens';
            return `
                <tr>
                    <td style="font-weight:600;">#${p.id}</td>
                    <td>${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
                    <td><strong style="color:var(--text-primary);">${p.supplier || 'N/A'}</strong></td>
                    <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${itemsList}">${itemsList}</td>
                    <td style="text-align:right; font-weight:700; color:var(--danger);">${formatCurrency(p.total_amount)}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('rep-purchases-pagination-info').innerText = filtered.length > 0
        ? `Mostrando ${startIdx + 1}-${endIdx} de ${filtered.length}`
        : 'Mostrando 0-0 de 0';

    document.getElementById('rep-purchases-prev-btn').disabled = page === 0;
    document.getElementById('rep-purchases-next-btn').disabled = endIdx >= filtered.length;
}

function prevPurchasesReportPage() {
    if (reportsState.purchases.page > 0) {
        reportsState.purchases.page--;
        renderPurchasesReport();
    }
}

function nextPurchasesReportPage() {
    const { filtered, page, limit } = reportsState.purchases;
    if ((page + 1) * limit < filtered.length) {
        reportsState.purchases.page++;
        renderPurchasesReport();
    }
}

function exportPurchasesReportExcel() {
    const { filtered } = reportsState.purchases;
    if (filtered.length === 0) {
        showToast('Nenhum dado para exportar', 'error');
        return;
    }

    const rows = [['Código Compra', 'Data / Hora', 'Fornecedor', 'Itens Comprados', 'Total Pago (R$)']];
    filtered.forEach(p => {
        const dt = new Date(p.date);
        const itemsList = p.items ? p.items.map(i => `${i.product_name || `ID #${i.product_id}`} (${i.quantity}un)`).join(' | ') : '';
        rows.push([
            p.id,
            `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR')}`,
            p.supplier || 'N/A',
            itemsList,
            p.total_amount.toFixed(2).replace('.', ',')
        ]);
    });

    const csvContent = rows.map(r => r.map(val => `"${val}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_compras_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Relatório de compras exportado!');
}

function printPurchasesReport() {
    const { filtered } = reportsState.purchases;
    if (filtered.length === 0) {
        showToast('Nenhum dado para imprimir', 'error');
        return;
    }

    const start = document.getElementById('rep-purchases-start').value;
    const end = document.getElementById('rep-purchases-end').value;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório de Entradas (Compras) - Gerencial</title>
                <style>
                    body { font-family: sans-serif; padding: 30px; color: #334155; }
                    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
                    .logo { font-size: 1.6rem; font-weight: 800; color: #ef4444; }
                    h1 { font-size: 1.5rem; margin: 10px 0 5px 0; }
                    .meta { font-size: 0.85rem; color: #64748b; }
                    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 20px; }
                    th { text-align: left; padding: 10px; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 600; background: #f8fafc; }
                    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                    .spent { color: #ef4444; font-weight: 700; text-align: right; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">Finish<span>Bebidas</span></div>
                    <h1>Relatório Gerencial de Entradas de Mercadorias (Compras)</h1>
                    <div class="meta">Período: ${new Date(start).toLocaleDateString('pt-BR')} a ${new Date(end).toLocaleDateString('pt-BR')} | Total Investido: ${formatCurrency(filtered.reduce((sum, p) => sum + p.total_amount, 0))}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Data / Hora</th>
                            <th>Fornecedor</th>
                            <th>Produtos Recebidos</th>
                            <th style="text-align:right;">Total Pago</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(p => {
                            const dt = new Date(p.date);
                            const itemsList = p.items ? p.items.map(i => `${i.product_name || `Produto #${i.product_id}`} (${i.quantity}x)`).join(', ') : '';
                            return `
                                <tr>
                                    <td style="font-weight:600;">#${p.id}</td>
                                    <td>${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
                                    <td><strong>${p.supplier || 'N/A'}</strong></td>
                                    <td>${itemsList}</td>
                                    <td class="spent">${formatCurrency(p.total_amount)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

// ──────────────────────────────────────────
// 3. RELATÓRIO DE ESTOQUE
// ──────────────────────────────────────────
async function loadInventoryReport() {
    try {
        const products = await api.get('/products/');
        reportsState.inventory.all = products;
        filterInventoryReport();
    } catch (e) {
        showToast('Erro ao carregar dados de estoque', 'error');
    }
}

function filterInventoryReport() {
    const search = document.getElementById('rep-inventory-search').value.toLowerCase();
    const category = document.getElementById('rep-inventory-category').value;
    const status = document.getElementById('rep-inventory-status').value;

    reportsState.inventory.filtered = reportsState.inventory.all.filter(p => {
        if (category !== 'Todos' && p.category_id != category) return false;

        if (status === 'Baixo' && p.stock_quantity > p.min_stock) return false;
        if (status === 'Normal' && p.stock_quantity <= p.min_stock) return false;

        if (search && !p.name.toLowerCase().includes(search) && !p.sku.toLowerCase().includes(search)) return false;

        return true;
    });

    reportsState.inventory.page = 0;
    renderInventoryReport();
}

function renderInventoryReport() {
    const { filtered, page, limit } = reportsState.inventory;
    const tbody = document.querySelector('#rep-inventory-table tbody');

    const totalQty = filtered.reduce((sum, p) => sum + p.stock_quantity, 0);
    const totalCost = filtered.reduce((sum, p) => sum + (p.stock_quantity * p.cost_price), 0);
    const totalSale = filtered.reduce((sum, p) => sum + (p.stock_quantity * p.sale_price), 0);

    document.getElementById('rep-inventory-total-qty').innerText = `${totalQty} un`;
    document.getElementById('rep-inventory-total-cost').innerText = formatCurrency(totalCost);
    document.getElementById('rep-inventory-total-sale').innerText = formatCurrency(totalSale);

    const startIdx = page * limit;
    const endIdx = Math.min(startIdx + limit, filtered.length);
    const paginated = filtered.slice(startIdx, endIdx);

    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhum produto cadastrado no estoque correspondente.</td></tr>';
    } else {
        tbody.innerHTML = paginated.map(p => {
            const isLow = p.stock_quantity <= p.min_stock;
            const catName = reportsState.categories.find(c => c.id == p.category_id)?.name || 'Sem Categoria';
            return `
                <tr>
                    <td style="font-family:monospace; color:var(--text-muted);">${p.sku}</td>
                    <td><strong style="color:var(--text-primary);">${p.name}</strong></td>
                    <td><span style="font-size:0.85rem; padding:0.2rem 0.4rem; background:rgba(255,255,255,0.05); border-radius:4px;">${catName}</span></td>
                    <td>
                        <strong style="color: ${isLow ? 'var(--accent)' : 'var(--success)'};">
                            ${p.stock_quantity} un
                        </strong>
                        ${isLow ? '<span style="font-size:0.7rem; color:var(--accent); display:block;">Crítico (mín: ' + p.min_stock + ')</span>' : ''}
                    </td>
                    <td style="text-align:right;">${formatCurrency(p.cost_price)}</td>
                    <td style="text-align:right; font-weight:600; color:var(--primary);">${formatCurrency(p.sale_price)}</td>
                    <td style="text-align:right; font-weight:700;">${formatCurrency(p.stock_quantity * p.cost_price)}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('rep-inventory-pagination-info').innerText = filtered.length > 0
        ? `Mostrando ${startIdx + 1}-${endIdx} de ${filtered.length}`
        : 'Mostrando 0-0 de 0';

    document.getElementById('rep-inventory-prev-btn').disabled = page === 0;
    document.getElementById('rep-inventory-next-btn').disabled = endIdx >= filtered.length;
}

function prevInventoryReportPage() {
    if (reportsState.inventory.page > 0) {
        reportsState.inventory.page--;
        renderInventoryReport();
    }
}

function nextInventoryReportPage() {
    const { filtered, page, limit } = reportsState.inventory;
    if ((page + 1) * limit < filtered.length) {
        reportsState.inventory.page++;
        renderInventoryReport();
    }
}

function exportInventoryReportExcel() {
    const { filtered } = reportsState.inventory;
    if (filtered.length === 0) {
        showToast('Nenhum dado para exportar', 'error');
        return;
    }

    const rows = [['SKU', 'Produto', 'Categoria', 'Estoque Qtd', 'Mínimo Aceitável', 'Preço Custo (R$)', 'Preço Venda (R$)', 'Total Custo (R$)']];
    filtered.forEach(p => {
        const catName = reportsState.categories.find(c => c.id == p.category_id)?.name || 'Sem Categoria';
        rows.push([
            p.sku,
            p.name,
            catName,
            p.stock_quantity,
            p.min_stock,
            p.cost_price.toFixed(2).replace('.', ','),
            p.sale_price.toFixed(2).replace('.', ','),
            (p.stock_quantity * p.cost_price).toFixed(2).replace('.', ',')
        ]);
    });

    const csvContent = rows.map(r => r.map(val => `"${val}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_estoque_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Planilha de estoque exportada!');
}

function printInventoryReport() {
    const { filtered } = reportsState.inventory;
    if (filtered.length === 0) {
        showToast('Nenhum dado para imprimir', 'error');
        return;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório de Estoque Físico e Patrimonial</title>
                <style>
                    body { font-family: sans-serif; padding: 30px; color: #334155; }
                    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
                    .logo { font-size: 1.6rem; font-weight: 800; color: #4f46e5; }
                    h1 { font-size: 1.5rem; margin: 10px 0 5px 0; }
                    .summary { display: flex; gap: 20px; margin-bottom: 30px; }
                    .stat { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 15px; background: #f8fafc; }
                    .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
                    .stat-value { font-size: 1.3rem; font-weight: 700; margin-top: 5px; color: #0f172a; }
                    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
                    th { text-align: left; padding: 10px; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 600; background: #f1f5f9; }
                    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                    .low-alert { color: #f59e0b; font-weight: 700; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">Finish<span>Bebidas</span></div>
                    <h1>Relatório Patrimonial e de Estoque Geral</h1>
                    <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
                </div>

                <div class="summary">
                    <div class="stat">
                        <div class="stat-label">Total de Itens</div>
                        <div class="stat-value">${filtered.reduce((sum, p) => sum + p.stock_quantity, 0)} un</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Custo Patrimonial</div>
                        <div class="stat-value" style="color:#ef4444;">${formatCurrency(filtered.reduce((sum, p) => sum + (p.stock_quantity * p.cost_price), 0))}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Venda Potencial</div>
                        <div class="stat-value" style="color:#10b981;">${formatCurrency(filtered.reduce((sum, p) => sum + (p.stock_quantity * p.sale_price), 0))}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Produto</th>
                            <th>Categoria</th>
                            <th>Qtd. Estoque</th>
                            <th style="text-align:right;">P. Custo</th>
                            <th style="text-align:right;">P. Venda</th>
                            <th style="text-align:right;">Total Custo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(p => {
                            const catName = reportsState.categories.find(c => c.id == p.category_id)?.name || 'Sem Categoria';
                            const isLow = p.stock_quantity <= p.min_stock;
                            return `
                                <tr>
                                    <td>${p.sku}</td>
                                    <td><strong>${p.name}</strong></td>
                                    <td>${catName}</td>
                                    <td class="${isLow ? 'low-alert' : ''}">${p.stock_quantity} un ${isLow ? '(Abaixo do Mín)' : ''}</td>
                                    <td style="text-align:right;">${formatCurrency(p.cost_price)}</td>
                                    <td style="text-align:right;">${formatCurrency(p.sale_price)}</td>
                                    <td style="text-align:right; font-weight:700;">${formatCurrency(p.stock_quantity * p.cost_price)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

// ──────────────────────────────────────────
// 4. RELATÓRIO FINANCEIRO (DRE)
// ──────────────────────────────────────────
async function loadFinancialReport() {
    const start = document.getElementById('rep-financial-start').value;
    const end = document.getElementById('rep-financial-end').value;

    try {
        const [sales, purchases] = await Promise.all([
            api.get(`/sales/?start_date=${start}&end_date=${end}&limit=5000`),
            api.get(`/purchases/?start_date=${start}&end_date=${end}&limit=5000`)
        ]);

        const revenue = sales.reduce((sum, s) => sum + s.total_amount, 0);

        let cmv = 0;
        sales.forEach(sale => {
            sale.items.forEach(item => {
                const prod = productsLookup[item.product_id];
                const cost = prod ? prod.cost_price : 0;
                cmv += item.quantity * cost;
            });
        });

        const totalPurchases = purchases.reduce((sum, p) => sum + p.total_amount, 0);

        const grossProfit = revenue - cmv;
        const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        document.getElementById('dre-revenue').innerText = formatCurrency(revenue);
        document.getElementById('dre-cmv').innerText = formatCurrency(cmv);
        document.getElementById('dre-gross-profit').innerText = formatCurrency(grossProfit);
        document.getElementById('dre-margin').innerText = `${margin.toFixed(2).replace('.', ',')}%`;
        document.getElementById('dre-purchases').innerText = formatCurrency(totalPurchases);

        const paymentTotals = {};
        sales.forEach(s => {
            paymentTotals[s.payment_method] = (paymentTotals[s.payment_method] || 0) + s.total_amount;
        });

        const paymentsList = document.getElementById('dre-payments-list');
        const paymentColors = {
            'PIX': '#22c55e',
            'Dinheiro': '#f59e0b',
            'Cartão de Crédito': '#6366f1',
            'Cartão de Débito': '#06b6d4'
        };

        if (sales.length === 0) {
            paymentsList.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nenhum canal ativo no período.</p>';
        } else {
            paymentsList.innerHTML = Object.entries(paymentTotals).map(([method, total]) => {
                const percent = revenue > 0 ? (total / revenue) * 100 : 0;
                const color = paymentColors[method] || '#cbd5e1';
                return `
                    <div style="padding:0.75rem; border:1px solid var(--border-subtle); border-radius:6px; background:rgba(255,255,255,0.02);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                            <strong style="color:var(--text-primary); font-size:0.9rem;">${method}</strong>
                            <span style="font-weight:700; color:${color};">${formatCurrency(total)}</span>
                        </div>
                        <div style="background:var(--bg-base); height:6px; border-radius:3px; overflow:hidden; position:relative;">
                            <div style="background:${color}; width:${percent}%; height:100%; border-radius:3px;"></div>
                        </div>
                        <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-top:0.3rem; text-align:right;">
                            ${percent.toFixed(1).replace('.', ',')}% do faturamento
                        </span>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        showToast('Erro ao processar demonstrativo financeiro (DRE)', 'error');
    }
}

function filterFinancialReport() {
    loadFinancialReport();
}

function printFinancialReport() {
    const start = document.getElementById('rep-financial-start').value;
    const end = document.getElementById('rep-financial-end').value;

    const revText = document.getElementById('dre-revenue').innerText;
    const cmvText = document.getElementById('dre-cmv').innerText;
    const profitText = document.getElementById('dre-gross-profit').innerText;
    const marginText = document.getElementById('dre-margin').innerText;
    const purcText = document.getElementById('dre-purchases').innerText;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>DRE - Demonstrativo de Resultado de Exercício</title>
                <style>
                    body { font-family: sans-serif; padding: 40px; color: #1e293b; background: #fff; line-height: 1.6; }
                    .header { border-bottom: 2px solid #cbd5e1; padding-bottom: 15px; margin-bottom: 30px; }
                    .logo { font-size: 1.6rem; font-weight: 800; color: #4f46e5; }
                    h1 { font-size: 1.5rem; margin: 10px 0 5px 0; }
                    .dre-container { max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; background: #f8fafc; }
                    .dre-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-size: 1.05rem; }
                    .dre-total { border-bottom: 2px solid #4f46e5; font-weight: bold; font-size: 1.2rem; padding: 15px 0; }
                    .note-box { background: #fafafa; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 15px; margin-top: 30px; font-size: 0.85rem; color: #64748b; }
                </style>
            </head>
            <body>
                <div class="header" style="text-align:center;">
                    <div class="logo">Finish<span>Bebidas</span></div>
                    <h1>Demonstrativo de Resultado do Exercício (DRE)</h1>
                    <div>Período: ${new Date(start).toLocaleDateString('pt-BR')} a ${new Date(end).toLocaleDateString('pt-BR')}</div>
                </div>

                <div class="dre-container">
                    <div class="dre-row">
                        <span>(+) Receita Bruta Operacional (Vendas)</span>
                        <strong style="color:#10b981;">${revText}</strong>
                    </div>
                    <div class="dre-row">
                        <span>(-) Custo das Mercadorias Vendidas (CMV)</span>
                        <strong style="color:#ef4444;">${cmvText}</strong>
                    </div>
                    <div class="dre-row dre-total">
                        <span>(=) LUCRO BRUTO OPERACIONAL</span>
                        <strong style="color:#4f46e5;">${profitText}</strong>
                    </div>
                    <div class="dre-row">
                        <span>Margem de Lucro Bruto (%)</span>
                        <strong>${marginText}</strong>
                    </div>
                    <div class="dre-row" style="color: #64748b; border-bottom: none;">
                        <span>Investimento Paralelo em Estoque (Compras)</span>
                        <strong style="color:#f59e0b;">${purcText}</strong>
                    </div>
                </div>

                <div class="note-box">
                    <strong>Notas Explicativas:</strong>
                    <p style="margin-top:5px;">* O Custo das Mercadorias Vendidas (CMV) aponta o preço de custo real exclusivamente dos produtos que foram faturados. Isso permite calcular a lucratividade exata do comércio independente de compras de estoque para meses futuros.</p>
                </div>

                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

// Start
if (token) {
    initClock();
    checkPermissions();
}
