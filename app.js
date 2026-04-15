// ============================================================
// EMPÓRIO FISCAL — app.js
// Simples Nacional Anexo I (Comércio) — Consultor Tributário
// ============================================================

// ─── CONSTANTES ─────────────────────────────────────────────
const FAIXAS = [
  { limite:   180000, aliquota: 0.040, deducao:       0 },
  { limite:   360000, aliquota: 0.073, deducao:    5940 },
  { limite:   720000, aliquota: 0.095, deducao:   13860 },
  { limite:  1800000, aliquota: 0.107, deducao:   22500 },
  { limite:  3600000, aliquota: 0.143, deducao:   87300 },
  { limite:  4800000, aliquota: 0.190, deducao:  378000 },
];
const LIMITE_SIMPLES = 4800000;
const LIMITE_1FAIXA  = 180000;
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ─── ESTADO ──────────────────────────────────────────────────
let db         = null;
let appConfig  = null;
let vendas     = {};   // { 'YYYY-MM': { total, lancamentos: { id: {data,valor,descricao} } } }
let obPlan     = 0;
let obEst      = null;

// ─── INIT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Firebase
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    iniciarApp();
  } catch(e) {
    document.getElementById('loading').innerHTML = `
      <div style="padding:32px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">Erro de configuração</div>
        <div style="font-size:13px;color:#94a3b8;line-height:1.6">Verifique o arquivo <b>firebase-config.js</b><br>e siga as instruções do README.</div>
      </div>`;
  }

  // Modal: data padrão = hoje
  document.getElementById('lanc-data').valueAsDate = new Date();

  // Fechar modal ao clicar fora
  document.getElementById('modal-lanc').addEventListener('click', function(e) {
    if (e.target === this) fecharModal();
  });
});

function iniciarApp() {
  db.ref('/').on('value', snap => {
    const data  = snap.val() || {};
    appConfig   = data.config  || null;
    vendas      = data.vendas  || {};

    setTimeout(() => document.getElementById('loading').classList.add('hidden'), 600);

    if (!appConfig?.onboardingConcluido) {
      document.getElementById('bottom-nav').style.display = 'none';
      showScreen('onboarding');
    } else {
      document.getElementById('bottom-nav').style.display = 'flex';
      showScreen('dashboard');
    }
  });
}

// ─── NAVEGAÇÃO ───────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`)?.classList.add('active');

  ['dashboard','historico','configuracoes'].forEach(s => {
    document.getElementById(`nav-${s}`)?.classList.toggle('active', s === name);
  });

  if (name === 'dashboard')      renderDash();
  if (name === 'historico')      renderHistorico();
  if (name === 'configuracoes')  renderConfig();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── ONBOARDING ──────────────────────────────────────────────
function obShowStep(step) {
  for (let i = 0; i < 3; i++) {
    const el  = document.getElementById(`ob-step-${i}`);
    const dot = document.getElementById(`dot-${i}`);
    if (el)  el.style.display  = i === step ? 'block' : 'none';
    if (dot) dot.classList.toggle('active', i === step);
  }
  const heroes = [
    { e:'📊', t:'Bem-vindo ao\nEmpório Fiscal', s:'Seu consultor tributário automático para o Simples Nacional' },
    { e:'🎯', t:'Defina sua\nestratégia',       s:'Como você quer gerenciar o crescimento este ano?' },
    { e:'✅', t:'Configuração\nconcluída!',      s:'Seu painel inteligente está pronto' },
  ];
  document.getElementById('ob-emoji').textContent         = heroes[step].e;
  document.getElementById('ob-title').innerHTML           = heroes[step].t.replace('\n','<br>');
  document.getElementById('ob-sub').textContent           = heroes[step].s;
}

function obNext(step) {
  if (step === 0) {
    const val = parseFloat(document.getElementById('ob-input-plan').value);
    if (!val || val <= 0) { toast('Informe um valor de faturamento estimado.'); return; }
    obPlan = val;
    obShowStep(1);
  } else if (step === 1) {
    if (!obEst) { toast('Selecione uma estratégia para continuar.'); return; }
    renderObResumo();
    obShowStep(2);
  }
}

function selectEst(est) {
  obEst = est;
  document.getElementById('opt-1faixa').classList.toggle('selected', est === 'primeira_faixa');
  document.getElementById('opt-crescer').classList.toggle('selected', est === 'crescer');

  const fb = document.getElementById('ob-feedback');
  if (est === 'primeira_faixa') {
    fb.className = 'onboard-feedback show purple';
    fb.innerHTML = '💰 <b>Ótima escolha para controle de custos!</b> Vamos alertar antes de você se aproximar do limite de R$ 180.000/ano e manter a alíquota em 4%.';
  } else {
    fb.className = 'onboard-feedback show green';
    fb.innerHTML = '🚀 <b>Crescimento com controle!</b> O app acompanha seu ritmo e te avisa sobre mudanças de faixa e impacto tributário.';
  }
  document.getElementById('btn-ob1-next').style.display = 'block';
}

function renderObResumo() {
  const meta   = obPlan / 12;
  const limite = obEst === 'primeira_faixa' ? LIMITE_1FAIXA : obPlan;
  document.getElementById('ob-resumo').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
      ${obRow('Faturamento planejado', fmt(obPlan))}
      ${obRow('Meta mensal', fmt(meta))}
      ${obRow('Estratégia', obEst === 'primeira_faixa' ? '💰 1ª faixa (4%)' : '🚀 Crescimento')}
      ${obRow('Limite de alerta', fmt(limite) + '/ano')}
    </div>`;
}

function obRow(l, v) {
  return `<div style="display:flex;justify-content:space-between">
    <span style="color:var(--text-3)">${l}</span>
    <span style="font-weight:700;color:var(--text)">${v}</span>
  </div>`;
}

async function finalizarOnboard() {
  await db.ref('/config').set({
    planejamentoAnual:  obPlan,
    estrategia:         obEst,
    onboardingConcluido: true,
    criadoEm:           new Date().toISOString(),
  });
  document.getElementById('bottom-nav').style.display = 'flex';
  showScreen('dashboard');
}

// ─── CÁLCULOS ─────────────────────────────────────────────────
function getRBT12() {
  const now = new Date();
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = mesKey(d.getFullYear(), d.getMonth() + 1);
    total    += vendas[key]?.total || 0;
  }
  return total;
}

function getFaixaIdx(rbt12) {
  const idx = FAIXAS.findIndex(f => rbt12 <= f.limite);
  return idx >= 0 ? idx : 5;
}

function getAliqEfetiva(rbt12) {
  if (rbt12 <= 0) return 0.04;
  const f = FAIXAS[getFaixaIdx(rbt12)];
  return Math.max((rbt12 * f.aliquota - f.deducao) / rbt12, 0);
}

function getDAS(rbt12, receitaMes) {
  return receitaMes * getAliqEfetiva(rbt12);
}

function getFatAno() {
  const ano = new Date().getFullYear();
  let total = 0;
  for (let m = 1; m <= 12; m++) total += vendas[mesKey(ano, m)]?.total || 0;
  return total;
}

function getFatMes() {
  return vendas[mesKeyHoje()]?.total || 0;
}

// ─── DASHBOARD ────────────────────────────────────────────────
function renderDash() {
  if (!appConfig) return;

  const rbt12      = getRBT12();
  const fatMes     = getFatMes();
  const fatAno     = getFatAno();
  const metaMensal = appConfig.planejamentoAnual / 12;
  const aliq       = getAliqEfetiva(rbt12);
  const das        = getDAS(rbt12, fatMes);
  const faixaIdx   = getFaixaIdx(rbt12);
  const faixaNum   = faixaIdx + 1;
  const pctSimples = Math.min((rbt12 / LIMITE_SIMPLES) * 100, 100);
  const pctPlano   = appConfig.planejamentoAnual > 0
    ? Math.min((fatAno / appConfig.planejamentoAnual) * 100, 100) : 0;
  const pctMeta    = metaMensal > 0 ? Math.min((fatMes / metaMensal) * 100, 100) : 0;

  const now = new Date();

  // Header
  setText('dash-sub',    `${MESES_PT[now.getMonth()]} ${now.getFullYear()}`);
  setText('badge-faixa', `${faixaNum}ª Faixa`);

  // Stats
  setText('stat-mes',      fmt(fatMes));
  setText('stat-meta-sub', `Meta: ${fmt(metaMensal)}`);
  setText('stat-das',      fmt(das));
  setText('stat-aliq',     `Alíquota: ${pct(aliq)}`);

  // RBT12
  setText('rbt12-val', fmt(rbt12));
  setText('rbt12-pct', `${pctSimples.toFixed(1)}% do limite do Simples`);
  setBar('rbt12-bar', pctSimples, 'neutral');

  // Faixa segments
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`fs${i}`);
    if (!el) continue;
    el.className = 'faixa-seg';
    if (i < faixaNum) el.classList.add('done');
    else if (i === faixaNum) el.classList.add(faixaNum <= 1 ? 'active' : faixaNum <= 3 ? 'warn' : 'danger');
  }
  setText('faixa-label', `${faixaNum}ª faixa · ${pct(aliq)} efetivo · R$ ${fmtK(FAIXAS[faixaIdx].limite)} limite`);

  // Planejamento anual
  const mesesPassados = now.getMonth() + 1;
  const projecao      = mesesPassados > 0 ? (fatAno / mesesPassados) * 12 : 0;
  setText('plan-realizado', fmt(fatAno));
  setText('plan-meta',      fmt(appConfig.planejamentoAnual));
  setText('plan-pct',       `${pctPlano.toFixed(1)}% do planejado`);
  setBar('plan-bar', pctPlano, 'purple');

  const projecaoAcima = projecao > appConfig.planejamentoAnual;
  setText('plan-proj', projecaoAcima
    ? `⚡ Projeção ${fmt(projecao)}/ano — acima do planejado`
    : `📈 Projeção ${fmt(projecao)}/ano`);

  const planoStatus = pctPlano < 40 ? ['Abaixo do planejado','badge-yellow']
    : pctPlano < 95 ? ['Dentro do planejado','badge-green']
    : ['Acima do planejado','badge-red'];
  document.getElementById('plan-badge').innerHTML =
    `<span class="badge ${planoStatus[1]}">${planoStatus[0]}</span>`;

  // Meta mensal
  setText('meta-real',   fmt(fatMes));
  setText('meta-val',    fmt(metaMensal));
  setText('meta-status', fatMes >= metaMensal
    ? `✅ Meta atingida! Excedente: ${fmt(fatMes - metaMensal)}`
    : `Faltam ${fmt(metaMensal - fatMes)} para atingir a meta do mês`);

  const metaColor = pctMeta < 40 ? 'fill-yellow' : pctMeta < 100 ? 'fill-green' : 'fill-purple';
  const metaBar   = document.getElementById('meta-bar');
  metaBar.className  = `progress-fill ${metaColor}`;
  metaBar.style.width = `${Math.min(pctMeta, 100)}%`;
  document.getElementById('meta-icon').textContent =
    pctMeta === 0 ? '⬜' : pctMeta < 40 ? '🔴' : pctMeta < 100 ? '🟡' : '🟢';

  // Consultor inteligente
  renderConsultor(rbt12, fatMes, fatAno, metaMensal, pctMeta, faixaNum, projecao);

  // Últimas vendas
  renderRecentes();
}

function renderConsultor(rbt12, fatMes, fatAno, metaMensal, pctMeta, faixaNum, projecao) {
  if (!appConfig) return;
  const est    = appConfig.estrategia;
  const limite = est === 'primeira_faixa' ? LIMITE_1FAIXA : appConfig.planejamentoAnual;
  const pctLim = limite > 0 ? (rbt12 / limite) * 100 : 0;

  let tipo = 'green', icon = '✅', titulo = '', corpo = '';

  if (est === 'primeira_faixa') {
    if (rbt12 > LIMITE_1FAIXA) {
      tipo = 'red'; icon = '🚨';
      titulo = 'Você saiu da 1ª faixa!';
      corpo  = `RBT12 de ${fmt(rbt12)} ultrapassou R$ 180.000. Sua alíquota não é mais 4%. Consulte seu contador para avaliar os impactos.`;
    } else if (pctLim >= 85) {
      tipo = 'red'; icon = '🚨';
      titulo = 'Limite crítico — quase na 2ª faixa!';
      corpo  = `RBT12 em ${pctLim.toFixed(0)}% do limite de R$ 180k. Faltam apenas ${fmt(LIMITE_1FAIXA - rbt12)}. Avalie segurar as vendas.`;
    } else if (pctLim >= 70) {
      tipo = 'yellow'; icon = '⚠️';
      titulo = 'Atenção: aproximando do limite estratégico';
      corpo  = `RBT12 em ${pctLim.toFixed(0)}% do limite (R$ 180k). No ritmo atual, você pode mudar de faixa. Fique atento.`;
    } else if (pctLim >= 50) {
      tipo = 'yellow'; icon = '⚡';
      titulo = 'Acompanhe o planejamento';
      corpo  = `Você está em ${pctLim.toFixed(0)}% do seu limite estratégico. Faltam ${fmt(LIMITE_1FAIXA - rbt12)} para mudar de faixa.`;
    } else {
      tipo = 'green'; icon = '✅';
      titulo = 'Dentro da estratégia';
      corpo  = `RBT12 de ${fmt(rbt12)} — alíquota efetiva de 4%. Continue assim para manter o menor imposto possível.`;
    }
  } else {
    // crescer
    if (projecao > LIMITE_SIMPLES * 0.85) {
      tipo = 'red'; icon = '🚨';
      titulo = 'Projeção próxima ao limite do Simples!';
      corpo  = `No ritmo atual você projeta ${fmt(projecao)}/ano, próximo ao limite de R$ 4,8M. Consulte seu contador urgente.`;
    } else if (faixaNum >= 5) {
      tipo = 'red'; icon = '📊';
      titulo = 'Faixa alta — impacto tributário relevante';
      corpo  = `Você está na ${faixaNum}ª faixa. Cada R$ 1.000 vendido gera mais impostos. Avalie com seu contador.`;
    } else if (faixaNum >= 3) {
      tipo = 'yellow'; icon = '📊';
      titulo = `Você entrou na ${faixaNum}ª faixa`;
      corpo  = `Com RBT12 de ${fmt(rbt12)} você está crescendo. Fique de olho na alíquota que agora está mais alta.`;
    } else if (pctMeta > 115) {
      tipo = 'purple'; icon = '🚀';
      titulo = 'Faturamento acima da meta!';
      corpo  = `${(pctMeta - 100).toFixed(0)}% acima da meta mensal. Ótimo crescimento — acompanhe o impacto na faixa do Simples.`;
    } else if (pctMeta < 40) {
      tipo = 'yellow'; icon = '📉';
      titulo = 'Abaixo da meta do mês';
      corpo  = `Você atingiu ${pctMeta.toFixed(0)}% da meta de ${fmt(metaMensal)}. Faltam ${fmt(metaMensal - fatMes)}.`;
    } else {
      tipo = 'green'; icon = '📈';
      titulo = 'Crescimento dentro do planejado';
      corpo  = `${fmt(fatMes)} faturados este mês. Projeção anual: ${fmt(projecao)}. Você está no caminho certo.`;
    }
  }

  document.getElementById('alert-card').className = `alert-card ${tipo}`;
  setText('alert-icon',  icon);
  setText('alert-title', titulo);
  setText('alert-text',  corpo);
}

function renderRecentes() {
  const key   = mesKeyHoje();
  const mes   = vendas[key];
  const cont  = document.getElementById('lista-recentes');

  if (!mes?.lancamentos) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">Nenhuma venda este mês</div><div class="empty-sub">Toque no + para registrar</div></div>`;
    return;
  }

  const items = Object.entries(mes.lancamentos)
    .sort((a,b) => b[1].data.localeCompare(a[1].data))
    .slice(0, 5);

  if (!items.length) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">Nenhuma venda este mês</div></div>`;
    return;
  }

  cont.innerHTML = items.map(([id, l]) => `
    <div class="lancamento-item">
      <div>
        <div class="lanc-date">${fmtDate(l.data)}</div>
        <div class="lanc-desc">${escHtml(l.descricao || 'Venda')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="lanc-valor">${fmt(l.valor)}</div>
        <button class="btn-del" onclick="delLanc('${key}','${id}')">✕</button>
      </div>
    </div>`).join('');
}

// ─── LANÇAMENTO ───────────────────────────────────────────────
function abrirModal() {
  document.getElementById('lanc-data').valueAsDate = new Date();
  document.getElementById('lanc-valor').value = '';
  document.getElementById('lanc-desc').value  = '';
  document.getElementById('modal-lanc').classList.add('open');
  setTimeout(() => document.getElementById('lanc-valor').focus(), 100);
}

function fecharModal() {
  document.getElementById('modal-lanc').classList.remove('open');
}

async function salvarLanc() {
  const data  = document.getElementById('lanc-data').value;
  const valor = parseFloat(document.getElementById('lanc-valor').value);
  const desc  = document.getElementById('lanc-desc').value.trim();

  if (!data)          { toast('Selecione uma data.');      return; }
  if (!valor || valor <= 0) { toast('Informe um valor válido.'); return; }

  const key  = data.slice(0, 7);
  const mes  = vendas[key] || { total: 0, lancamentos: {} };
  const id   = Date.now().toString();
  const novo = { data, valor, descricao: desc || 'Venda' };

  const lancamentos = { ...(mes.lancamentos || {}), [id]: novo };
  const total       = Object.values(lancamentos).reduce((s, l) => s + l.valor, 0);

  await db.ref(`/vendas/${key}`).set({ total, lancamentos });
  fecharModal();
  toast('✅ Venda registrada!');
}

async function delLanc(key, id) {
  if (!confirm('Remover este lançamento?')) return;
  const mes         = vendas[key];
  if (!mes)         return;
  const lancamentos = { ...(mes.lancamentos || {}) };
  delete lancamentos[id];
  const total = Object.values(lancamentos).reduce((s, l) => s + l.valor, 0);
  await db.ref(`/vendas/${key}`).set(
    Object.keys(lancamentos).length ? { total, lancamentos } : null
  );
}

// ─── HISTÓRICO ────────────────────────────────────────────────
function renderHistorico() {
  const cont  = document.getElementById('historico-content');
  const rbt12 = getRBT12();
  const aliq  = getAliqEfetiva(rbt12);
  const keys  = Object.keys(vendas).sort().reverse();

  if (!keys.length) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Nenhum dado ainda</div><div class="empty-sub">Lance suas vendas para ver o histórico</div></div>`;
    return;
  }

  cont.innerHTML = keys.map(key => {
    const [ano, m]  = key.split('-');
    const data      = vendas[key];
    const total     = data?.total || 0;
    const das       = getDAS(rbt12, total);
    const nLanc     = data?.lancamentos ? Object.keys(data.lancamentos).length : 0;
    const nomeMes   = MESES_CURTOS[parseInt(m) - 1];
    return `
      <div class="mes-card" onclick="toggleDetail('${key}')">
        <div>
          <div class="mes-nome">${nomeMes} ${ano}</div>
          <div class="mes-das">DAS est.: ${fmt(das)} · ${nLanc} lançamento${nLanc !== 1 ? 's' : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="mes-total">${fmt(total)}</div>
          <div style="font-size:11px;color:var(--text-3)">${pct(aliq)}</div>
        </div>
      </div>
      <div id="det-${key}" class="mes-detail">
        ${renderDetalhes(key)}
      </div>`;
  }).join('');
}

function toggleDetail(key) {
  const el = document.getElementById(`det-${key}`);
  if (el) el.classList.toggle('open');
}

function renderDetalhes(key) {
  const mes = vendas[key];
  if (!mes?.lancamentos) return `<div class="empty-state" style="padding:12px 0"><div class="empty-sub">Sem detalhes</div></div>`;
  const items = Object.entries(mes.lancamentos).sort((a,b) => b[1].data.localeCompare(a[1].data));
  return `<div style="border-top:1px solid var(--border);padding-top:8px">` +
    items.map(([id, l]) => `
      <div class="lancamento-item">
        <div>
          <div class="lanc-date">${fmtDate(l.data)}</div>
          <div class="lanc-desc">${escHtml(l.descricao || 'Venda')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="lanc-valor">${fmt(l.valor)}</div>
          <button class="btn-del" onclick="delLanc('${key}','${id}');renderHistorico()">✕</button>
        </div>
      </div>`).join('') + `</div>`;
}

// ─── CONFIGURAÇÕES ────────────────────────────────────────────
function renderConfig() {
  if (!appConfig) return;
  setText('cfg-plan',      fmt(appConfig.planejamentoAnual));
  setText('cfg-estrategia', appConfig.estrategia === 'primeira_faixa'
    ? '💰 Manter na 1ª faixa (4%)' : '🚀 Crescimento controlado');
}

async function salvarPlano() {
  const val = parseFloat(document.getElementById('cfg-plan-input').value);
  if (!val || val <= 0) { toast('Informe um valor válido.'); return; }
  await db.ref('/config').update({ planejamentoAnual: val });
  document.getElementById('cfg-plan-input').value = '';
  toast('✅ Planejamento atualizado!');
}

async function mudarEst(est) {
  if (!confirm(`Alterar estratégia para "${est === 'primeira_faixa' ? '1ª faixa' : 'Crescimento'}"?`)) return;
  await db.ref('/config').update({ estrategia: est });
  toast('✅ Estratégia alterada!');
}

async function resetOnboard() {
  if (!confirm('Isso vai reiniciar a configuração inicial. Continuar?')) return;
  await db.ref('/config').update({ onboardingConcluido: false });
  showScreen('onboarding');
  document.getElementById('bottom-nav').style.display = 'none';
}

// ─── EXPORTAR ─────────────────────────────────────────────────
function exportar() {
  const payload = { config: appConfig, vendas, exportedAt: new Date().toISOString() };
  const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `emporio-fiscal-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UTILS ────────────────────────────────────────────────────
function mesKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2,'0')}`;
}

function mesKeyHoje() {
  const d = new Date();
  return mesKey(d.getFullYear(), d.getMonth() + 1);
}

function fmt(val) {
  return 'R$ ' + (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(val) {
  if (val >= 1000000) return (val/1000000).toFixed(1).replace('.',',') + 'M';
  if (val >= 1000)    return (val/1000).toFixed(0) + 'k';
  return val.toString();
}

function pct(val) {
  return (val * 100).toFixed(2).replace('.', ',') + '%';
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setBar(id, pctVal, mode) {
  const el = document.getElementById(id);
  if (!el) return;
  const color = pctVal > 85 ? 'fill-red' : pctVal > 60 ? 'fill-yellow'
    : mode === 'purple' ? 'fill-purple' : 'fill-green';
  el.className   = `progress-fill ${color}`;
  el.style.width = `${Math.min(pctVal, 100)}%`;
}

let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:#0f172a;color:#fff;padding:10px 20px;border-radius:99px;
      font-size:13px;font-weight:500;z-index:999;transition:opacity .3s;white-space:nowrap;
      box-shadow:0 4px 12px rgba(0,0,0,.2)`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.opacity = '0', 2500);
}
