/* Caderninho do Fiado
   Os dados do comércio ficam no banco de dados do servidor (todos os usuários do comércio veem o mesmo caderninho).
   Uma cópia fica no aparelho (localStorage) para abrir rápido e funcionar se a internet cair. */
'use strict';
(() => {

const KEY = 'caderninho-fiado-v1';                       // caderninho antigo (só no aparelho)
const SYNC = !!(window.CF_USER && window.CF_USER.sync);   // dados no servidor?
const CACHE = SYNC ? 'caderninho-fiado-c-' + window.CF_USER.cid : KEY;
const CACHE_SRV = CACHE + '-srv';                          // última versão conhecida do servidor
const KEY_TEMA = 'cf-tema';
const MSG_PADRAO = 'Olá, {nome}! Aqui é do {comercio}. Passando para lembrar do seu fiado de {valor}, com vencimento em {vencimento}. Qualquer dúvida é só chamar. Obrigado!';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const compacto = c => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(c / 100);

function isoDe(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
const hoje = () => isoDe(new Date());
function addDias(s, n) { const [y, m, d] = s.split('-').map(Number); return isoDe(new Date(y, m - 1, d + n)); }
function diffDias(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
const fmtData = s => s ? s.split('-').reverse().join('/') : '';
const fmtCurta = s => s ? s.split('-').reverse().slice(0, 2).join('/') : '';

function parseValor(txt) {
  let t = String(txt || '').replace(/[^\d.,]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return isFinite(n) ? Math.round(n * 100) : NaN;
}
const valorInput = c => (c / 100).toFixed(2).replace('.', ',');
const iniciais = nome => String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

function mascaraTel(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* ---------- dados ---------- */
function vazio() {
  return { config: { comercio: '', msg: MSG_PADRAO, tema: 'auto', iniciado: false, ultimoBackup: null, prazo: '15', demo: false, encargos: false, multa: 2, juros: 1 }, clientes: [], produtos: [], fiados: [] };
}
function normalizar(d) {
  const v = vazio();
  return {
    config: { ...v.config, ...(d.config || {}) },
    clientes: Array.isArray(d.clientes) ? d.clientes : [],
    produtos: Array.isArray(d.produtos) ? d.produtos : [],
    fiados: Array.isArray(d.fiados) ? d.fiados.map(f => ({ ...f, itens: Array.isArray(f.itens) ? f.itens : [], pagamentos: Array.isArray(f.pagamentos) ? f.pagamentos : [] })) : []
  };
}
function carregar() {
  try {
    let r = localStorage.getItem(CACHE);
    if (!r && SYNC) r = localStorage.getItem(KEY);   // caderninho antigo: será enviado ao servidor na primeira vez
    if (r) return normalizar(JSON.parse(r));
  } catch (e) { /* segue com vazio */ }
  return vazio();
}
let db = carregar();
function salvar() {
  try { localStorage.setItem(CACHE, JSON.stringify(db)); }
  catch (e) { toast('Não foi possível guardar os dados neste navegador. Baixe uma cópia de segurança agora.', 'erro'); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (SYNC) agendarEnvio();
}
/* tema é escolha de cada pessoa/aparelho, não do comércio */
function temaAtual() { try { return localStorage.getItem(KEY_TEMA) || db.config.tema || 'auto'; } catch (e) { return db.config.tema || 'auto'; } }
function setTema(v) { try { localStorage.setItem(KEY_TEMA, v); } catch (e) { /* ignora */ } if (!SYNC) { db.config.tema = v; salvar(); } aplicarTema(); }

const pago = f => f.pagamentos.reduce((s, p) => s + p.valor, 0);
const restante = f => f.valor - pago(f);
/* o que o comerciante realmente recebeu: parte do fiado mais a multa e os juros, se houve */
const recebido = p => p.valor + (p.encargo || 0);
/* multa e juros por atraso (só quando ligado nos Ajustes) */
function encargoBruto(f, ate) {
  const c = db.config; ate = ate || hoje();
  if (!c.encargos || !f.venc) return 0;
  const r = restante(f); if (r <= 0 || ate <= f.venc) return 0;
  const dias = diffDias(f.venc, ate);
  return Math.round(r * (c.multa || 0) / 100) + Math.round(r * ((c.juros || 0) / 100 / 30) * dias);
}
const encargoPago = f => f.pagamentos.reduce((s, p) => s + (p.encargo || 0), 0);
const encargoDevido = (f, ate) => Math.max(0, encargoBruto(f, ate) - encargoPago(f));
const abertoDe = (cid, exceto) => db.fiados.filter(f => f.clienteId === cid && f.id !== exceto).reduce((s, f) => s + Math.max(0, restante(f)), 0);
function status(f) {
  if (restante(f) <= 0) return 'pago';
  if (f.venc && f.venc < hoje()) return 'atrasado';
  return 'aberto';
}
const cliente = id => db.clientes.find(c => c.id === id);
const nomeDe = f => (cliente(f.clienteId) || { nome: 'Cliente apagado' }).nome;

/* produtos e itens do fiado */
const UN = { un: 'unidade', kg: 'quilo', l: 'litro', pct: 'pacote', cx: 'caixa', dz: 'dúzia', m: 'metro', saco: 'saco', fardo: 'fardo', par: 'par', porcao: 'porção', serv: 'serviço', hora: 'hora', diaria: 'diária' };
const UN_CURTA = { un: 'un', kg: 'kg', l: 'litro', pct: 'pacote', cx: 'caixa', dz: 'dúzia', m: 'm', saco: 'saco', fardo: 'fardo', par: 'par', porcao: 'porção', serv: 'serviço', hora: 'h', diaria: 'diária' };
/* sugestões de produtos e serviços por ramo (preços de exemplo, cada comerciante ajusta) */
const RAMOS = {
  mercearia: ['Mercearia ou mercadinho', [['Arroz 5kg', 24.9, 'pct'], ['Feijão 1kg', 8.9, 'pct'], ['Óleo de soja', 7.5, 'un'], ['Açúcar 1kg', 5.2, 'pct'], ['Café 500g', 16.9, 'pct'], ['Leite', 5.4, 'l'], ['Macarrão', 4.5, 'pct'], ['Sabão em pó', 12, 'un']]],
  padaria: ['Padaria e confeitaria', [['Pão francês', 14.9, 'kg'], ['Pão de forma', 9, 'un'], ['Bolo (fatia)', 7, 'un'], ['Salgado', 6.5, 'un'], ['Café com leite', 5, 'un'], ['Sonho', 5.5, 'un'], ['Torta inteira', 55, 'un']]],
  acougue: ['Açougue e peixaria', [['Carne moída', 36, 'kg'], ['Contrafilé', 52, 'kg'], ['Frango inteiro', 14, 'kg'], ['Linguiça', 24, 'kg'], ['Costela', 34, 'kg'], ['Peixe (filé)', 45, 'kg']]],
  bar: ['Bar, lanchonete e restaurante', [['Cerveja lata', 4.5, 'un'], ['Refrigerante 2L', 9.5, 'un'], ['Marmita', 22, 'un'], ['Prato feito', 25, 'un'], ['Lanche', 18, 'un'], ['Porção', 38, 'porcao'], ['Suco', 8, 'un']]],
  farmacia: ['Farmácia e drogaria', [['Analgésico', 9, 'cx'], ['Vitamina C', 18, 'cx'], ['Curativo', 7, 'cx'], ['Shampoo', 16, 'un'], ['Fralda (pacote)', 38, 'pct'], ['Protetor solar', 42, 'un']]],
  agro: ['Agropecuária e casa de ração', [['Ração para cães 15kg', 120, 'saco'], ['Ração para gatos 10kg', 95, 'saco'], ['Milho', 85, 'saco'], ['Sal mineral', 140, 'saco'], ['Vermífugo', 28, 'un'], ['Adubo', 65, 'saco'], ['Semente', 18, 'pct']]],
  construcao: ['Material de construção', [['Cimento 50kg', 38, 'saco'], ['Areia', 90, 'un'], ['Tijolo (milheiro)', 900, 'un'], ['Tinta 18L', 280, 'un'], ['Cano PVC', 22, 'un'], ['Fio elétrico', 3.5, 'm'], ['Prego', 14, 'kg']]],
  roupas: ['Loja de roupas e calçados', [['Camiseta', 49.9, 'un'], ['Calça jeans', 119.9, 'un'], ['Vestido', 99.9, 'un'], ['Sandália', 59.9, 'par'], ['Tênis', 159.9, 'par'], ['Meia (pacote)', 19.9, 'pct']]],
  papelaria: ['Papelaria e armarinho', [['Caderno', 18, 'un'], ['Caneta', 3, 'un'], ['Cópia xerox', 0.5, 'un'], ['Linha de costura', 4, 'un'], ['Tecido', 22, 'm'], ['Material escolar (kit)', 85, 'un']]],
  oficina: ['Oficina e auto peças', [['Troca de óleo', 120, 'serv'], ['Mão de obra', 80, 'hora'], ['Pneu', 380, 'un'], ['Bateria', 420, 'un'], ['Filtro de ar', 45, 'un'], ['Lavagem', 50, 'serv']]],
  beleza: ['Salão de beleza e barbearia', [['Corte de cabelo', 40, 'serv'], ['Barba', 25, 'serv'], ['Escova', 50, 'serv'], ['Manicure', 35, 'serv'], ['Coloração', 120, 'serv'], ['Hidratação', 70, 'serv']]],
  servicos: ['Serviços em geral', [['Visita técnica', 100, 'serv'], ['Mão de obra', 70, 'hora'], ['Diária de trabalho', 200, 'diaria'], ['Frete', 50, 'serv']]]
};
const fmtQtd = q => String(q).replace('.', ',');
const subtotal = i => Math.round(i.preco * i.qtd);
function descFiado(f) {
  const it = (f.itens || []).map(i => `${fmtQtd(i.qtd)}x ${i.nome}`).join(', ');
  return [it, f.desc].filter(Boolean).join('. ');
}
const produto = id => db.produtos.find(p => p.id === id);

/* quando e como o fiado foi quitado (data do pagamento que fechou a conta) */
function quitacao(f) {
  if (restante(f) > 0 || !f.pagamentos.length) return null;
  const ord = f.pagamentos.map((p, i) => ({ p, i })).sort((a, b) => a.p.data.localeCompare(b.p.data) || a.i - b.i);
  let soma = 0;
  for (const { p } of ord) { soma += p.valor; if (soma >= f.valor) return { data: p.data, pid: p.id }; }
  const u = ord[ord.length - 1].p; return { data: u.data, pid: u.id };
}
/* dias de atraso no pagamento (negativo ou zero = no prazo); null se sem vencimento */
function atrasoPagamento(f) {
  const q = quitacao(f); if (!q || !f.venc) return null;
  return diffDias(f.venc, q.data);
}

function relVenc(f) {
  if (status(f) === 'pago') return 'Pago';
  if (!f.venc) return 'Sem data';
  const d = diffDias(hoje(), f.venc);
  if (d < 0) return d === -1 ? 'Venceu ontem' : `Venceu há ${-d} dias`;
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  return `Vence em ${d} dias`;
}
function badge(f) {
  const st = status(f);
  if (st === 'pago') return '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Pago</span>';
  if (st === 'atrasado') return `<span class="badge st-atrasado"><i class="ph ph-warning-circle"></i>${relVenc(f)}</span>`;
  const d = f.venc ? diffDias(hoje(), f.venc) : 99;
  return `<span class="badge ${d <= 1 ? 'st-hoje' : ''}"><i class="ph ph-clock"></i>${relVenc(f)}</span>`;
}

function stats() {
  const h = hoje(), limite = addDias(h, 7), mes = h.slice(0, 7);
  const s = { aberto: 0, nAberto: 0, atrasado: 0, nAtrasado: 0, sem7: 0, nSem7: 0, recebidoMes: 0 };
  for (const f of db.fiados) {
    const r = restante(f);
    if (r > 0) {
      s.aberto += r; s.nAberto++;
      if (f.venc && f.venc < h) { s.atrasado += r; s.nAtrasado++; }
      else if (f.venc && f.venc <= limite) { s.sem7 += r; s.nSem7++; }
    }
    for (const p of f.pagamentos) if (p.data.startsWith(mes)) s.recebidoMes += recebido(p);
  }
  return s;
}

/* ---------- estado da tela ---------- */
const ui = {
  view: 'inicio', f: { busca: '', status: 'abertos', cliente: '', de: '', ate: '', ordem: 'venc' }, cb: '', pb: '',
  pg: { aba: 'pagamentos', periodo: 'mes', cliente: '', forma: '' }, rel: { periodo: 'mes', de: '', ate: '', aba: 'resumo', q: '' }, po: 'az', sort: {}
};
let formItens = [];   /* produtos adicionados no formulario de fiado aberto */

/* ---------- avisos e janelas ---------- */
let tt;
function toast(msg, tipo) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + (tipo || '');
  clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, tipo === 'erro' ? 6000 : 3400);
}
const dlg = $('#dlg');
function abrir(html, cls) {
  dlg.className = cls || '';
  dlg.innerHTML = html;
  if (window.Controles) Controles.melhorar(dlg);
  if (!dlg.open) dlg.showModal();
  document.body.classList.add('travado');
  const alvo = $('[autofocus]', dlg);
  if (alvo) alvo.focus();
}
function fechar() { if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => { document.body.classList.remove('travado'); dlg.innerHTML = ''; });
dlg.addEventListener('click', e => { if (e.target === dlg) fechar(); });
const sheet = (titulo, corpo) => `<div class="sheet"><header class="sheet-h"><h2>${titulo}</h2><button class="icon-btn" data-action="fechar" aria-label="Fechar"><i class="ph ph-x"></i></button></header><div class="sheet-b">${corpo}</div></div>`;

function confirmar({ titulo, texto, ok = 'Sim, apagar', perigo = true }) {
  return new Promise(res => {
    const d = $('#dlg-confirm');
    d.innerHTML = `<div class="sheet-b confirma"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      <form method="dialog"><button class="btn" value="cancel" autofocus>Voltar</button>
      <button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(ok)}</button></form></div>`;
    d.returnValue = '';
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}

function mostrarErros(form, erros) {
  $$('[data-erro]', form).forEach(el => { el.textContent = ''; });
  $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
  let primeiro = null;
  for (const [nome, msg] of Object.entries(erros)) {
    const e = $(`[data-erro="${nome}"]`, form); if (e) e.textContent = msg;
    const campo = form.elements[nome], inp = campo && (campo._ctl || campo);
    if (inp) { inp.setAttribute('aria-invalid', 'true'); if (!primeiro) primeiro = inp; }
  }
  if (primeiro) primeiro.focus();
}

/* ---------- navegacao ---------- */
function atualizarNav() {
  $$('.nav-item,.tab[data-view]').forEach(b => {
    const v = b.dataset.view;
    const ativo = v === ui.view || (v === 'mais' && ['mais', 'pagos', 'relatorios', 'produtos', 'ajustes'].includes(ui.view) && !b.classList.contains('nav-item'));
    if (ativo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const nome = db.config.comercio;
  $('#brand-loja').textContent = nome || '';
  $('#top-titulo').textContent = nome || 'Caderninho do Fiado';
}
function ir(v) { ui.view = v; render(); window.scrollTo(0, 0); }

function render() {
  const v = { inicio: vInicio, fiados: vFiados, clientes: vClientes, produtos: vProdutos, pagos: vPagos, relatorios: vRelatorios, mais: vMais, ajustes: vAjustes }[ui.view];
  $('#view').innerHTML = v();
  if (window.Controles) Controles.melhorar($('#view'));
  atualizarNav();
  if (ui.view === 'fiados') renderLista();
  if (ui.view === 'clientes') renderListaClientes();
  if (ui.view === 'produtos') renderListaProdutos();
  if (ui.view === 'pagos') renderPagos();
  if (ui.view === 'relatorios') renderRelatorios();
  if (ui.view === 'ajustes') { atualizarPrevia(); atualizarEncPrevia(); }
  const tit = { inicio: 'Início', fiados: 'Fiados', clientes: 'Clientes', produtos: 'Produtos e serviços', pagos: 'Quem já pagou', relatorios: 'Relatórios', mais: 'Mais opções', ajustes: 'Ajustes e cópia de segurança' }[ui.view];
  document.title = tit + ' | Caderninho do Fiado';
}

/* ---------- tabelas (computador) ---------- */
function th(tab, col, rotulo, num) {
  const o = ui.sort[tab], a = o && o.c === col;
  return `<th class="${num ? 'n' : ''}" aria-sort="${a ? (o.d > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-bt" data-action="ordenar" data-t="${tab}" data-c="${col}" title="Ordenar por ${esc(rotulo)}">${rotulo}<i class="ph ${a ? (o.d > 0 ? 'ph-arrow-up' : 'ph-arrow-down') : 'ph-arrows-down-up'}" aria-hidden="true"></i></button></th>`;
}
function ordenarPor(arr, tab, getters) {
  const o = ui.sort[tab]; if (!o || !o.c || !getters[o.c]) return arr;
  const g = getters[o.c];
  return arr.slice().sort((a, b) => {
    const x = g(a), y = g(b);
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * o.d;
  });
}
const celCli = (nome, icone) => `<span class="cel-cli"><span class="avatar" aria-hidden="true">${icone ? `<i class="ph ${icone}"></i>` : esc(iniciais(nome))}</span><b>${esc(nome)}</b></span>`;
const ORDEM_ST = { atrasado: 0, aberto: 1, pago: 2 };

/* ---------- tela: Inicio ---------- */
function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function itemFiado(f, { acoes = false, simples = false } = {}) {
  const c = cliente(f.clienteId);
  const dsc = descFiado(f);
  const sub = dsc ? esc(dsc) : 'Compra de ' + fmtCurta(f.data);
  const r = restante(f);
  const linhaVal = status(f) === 'pago' ? brl(f.valor) : brl(r);
  const enc = encargoDevido(f);
  const subVal = enc > 0 ? `<small>+ ${brl(enc)} de juros</small>` : status(f) !== 'pago' && r !== f.valor ? `<small>de ${brl(f.valor)}</small>` : '';
  return `<div class="item">
    <button class="row ${simples ? 'simples' : ''}" data-action="abrir-fiado" data-id="${f.id}">
      <span class="avatar" aria-hidden="true">${esc(iniciais(nomeDe(f)))}</span>
      <span class="cell-main"><strong>${esc(nomeDe(f))}</strong><small>${sub}</small></span>
      ${simples ? '' : `<span class="cell-prod" title="${esc(dsc)}">${dsc ? esc(dsc) : '<em>Sem anotação</em>'}</span>`}
      ${simples ? '' : `<span class="cell-data"><small>Compra</small><strong>${fmtData(f.data)}</strong></span>`}
      ${simples ? '' : `<span class="cell-venc"><small>Vencimento</small><strong>${f.venc ? fmtData(f.venc) : 'Sem data'}</strong></span>`}
      <span class="cell-val"><strong>${linhaVal}</strong>${subVal}</span>
      ${badge(f)}
    </button>
    ${acoes ? `<div class="item-acoes">
      <button class="btn btn-primary" data-action="receber" data-id="${f.id}"><i class="ph ph-hand-coins"></i>Receber</button>
      <button class="btn" data-action="cobrar-fiado" data-id="${f.id}"><i class="ph ph-whatsapp-logo"></i>Cobrar</button></div>` : ''}
  </div>`;
}

function vInicio() {
  const nome = db.config.comercio;
  const cab = `<div class="pagina-h"><div><h1>${saudacao()}!</h1><p>Veja de relance quanto falta receber e quem precisa de um lembrete.</p></div></div>`;

  if (!db.clientes.length && !db.fiados.length) {
    return cab + `<div class="card vazio-grande vazio">
      <i class="ph ph-notebook"></i>
      <h3>Seu caderninho está vazio</h3>
      <p>Quando alguém levar algo fiado, toque em <b>Anotar fiado</b>. Aqui vai aparecer quanto você tem a receber e quem está com o pagamento atrasado.</p>
      <button class="btn btn-primary btn-grande" data-action="novo-fiado"><i class="ph ph-plus"></i>Anotar o primeiro fiado</button>
      <p style="margin-top:14px"><button class="link" data-action="exemplo">Ou veja como funciona com dados de exemplo</button></p>
    </div>`;
  }

  const s = stats();
  let avisos = '';
  if (db.config.demo) avisos += `<div class="aviso info"><i class="ph ph-info"></i><div><strong>Você está vendo dados de exemplo</strong>Eles servem só para conhecer o sistema. Quando quiser começar de verdade, apague os exemplos.<br><button class="btn" data-action="apagar-exemplo">Apagar exemplos e começar</button></div></div>`;
  const pend = paraCobrar().filter(x => !x.feito);
  if (pend.length) avisos += `<div class="aviso"><i class="ph ph-bell-ringing"></i><div><strong>Hoje ${pend.length === 1 ? 'tem 1 cliente' : 'tem ' + pend.length + ' clientes'} para cobrar</strong>Somam ${brl(pend.reduce((t, x) => t + x.total, 0))} em fiados vencidos ou que vencem hoje.<br><button class="btn btn-primary" data-action="cobrancas"><i class="ph ph-whatsapp-logo"></i>Ver quem cobrar</button></div></div>`;
  if (!SYNC && !db.config.demo && db.fiados.length && precisaBackup()) avisos += `<div class="aviso"><i class="ph ph-shield-warning"></i><div><strong>Faça a cópia de segurança</strong>Seus dados ficam só neste aparelho. ${db.config.ultimoBackup ? 'Faz mais de uma semana desde a última cópia.' : 'Você ainda não fez nenhuma cópia.'} Se o navegador for limpo, tudo se perde.<br><button class="btn" data-action="baixar-backup"><i class="ph ph-download-simple"></i>Baixar cópia agora</button></div></div>`;

  const tiles = `<div class="stats">
    <button class="stat" data-action="filtrar" data-status="abertos"><span class="rot"><i class="ph ph-wallet"></i>Falta receber</span><span class="val">${brl(s.aberto)}</span><span class="sub">${s.nAberto} ${s.nAberto === 1 ? 'fiado em aberto' : 'fiados em aberto'}</span></button>
    <button class="stat ${s.nAtrasado ? 'alerta' : ''}" data-action="filtrar" data-status="atrasados"><span class="rot"><i class="ph ph-warning-circle"></i>Atrasado</span><span class="val">${brl(s.atrasado)}</span><span class="sub">${s.nAtrasado ? s.nAtrasado + (s.nAtrasado === 1 ? ' fiado venceu' : ' fiados venceram') : 'Nada atrasado'}</span></button>
    <button class="stat" data-action="filtrar" data-status="abertos" data-ordem="venc"><span class="rot"><i class="ph ph-calendar-blank"></i>Vence em 7 dias</span><span class="val">${brl(s.sem7)}</span><span class="sub">${s.nSem7} ${s.nSem7 === 1 ? 'fiado' : 'fiados'}</span></button>
    <div class="stat"><span class="rot"><i class="ph ph-hand-coins"></i>Recebido neste mês</span><span class="val">${brl(s.recebidoMes)}</span><span class="sub">em pagamentos</span></div>
  </div>`;

  const h = hoje(), lim = addDias(h, 7);
  const atencao = db.fiados.filter(f => restante(f) > 0 && f.venc && f.venc <= lim)
    .sort((a, b) => a.venc.localeCompare(b.venc)).slice(0, 6);
  const blocoAtencao = `<section class="card" aria-labelledby="h-aten">
    <div class="card-h"><h2 id="h-aten">Quem precisa de atenção</h2>${atencao.length ? '<button class="link" data-action="filtrar" data-status="abertos">Ver todos</button>' : ''}</div>
    <p class="card-sub">Primeiro os atrasados, depois os que vencem nesta semana.</p>
    ${atencao.length ? `<div class="lista lista-aten">${atencao.map(f => itemFiado(f, { acoes: true, simples: true })).join('')}</div>`
      : `<div class="vazio"><i class="ph ph-check-circle"></i><h3>Tudo em dia</h3><p>Nenhum fiado atrasado nem vencendo nos próximos 7 dias.</p></div>`}
  </section>`;

  return `<div class="home">` + cab + `<div class="avisos">${avisos}</div>` + tiles + `<div class="grade-2"><div>${blocoAtencao}${blocoDevedores()}</div><div>${blocoGrafico()}${blocoUltimosPagamentos()}</div></div></div>`;
}

function blocoGrafico(qtd = 6) {
  const meses = [], base = new Date();
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push({ chave: d.getFullYear() + '-' + pad(d.getMonth() + 1), nome: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), anotado: 0, recebido: 0 });
  }
  for (const f of db.fiados) {
    const m = meses.find(x => f.data.startsWith(x.chave)); if (m) m.anotado += f.valor;
    for (const p of f.pagamentos) { const k = meses.find(x => p.data.startsWith(x.chave)); if (k) k.recebido += recebido(p); }
  }
  const max = Math.max(1, ...meses.map(m => Math.max(m.anotado, m.recebido)));
  const alt = v => Math.max(v ? 2 : 0, Math.round(v / max * 100));
  return `<section class="card" aria-labelledby="h-graf"><div class="card-h"><h2 id="h-graf">Últimos ${qtd} meses</h2></div>
    <p class="card-sub">Quanto foi anotado no fiado e quanto você recebeu, em reais.</p>
    <div class="legenda"><span><i style="background:var(--line-strong)"></i>Anotado no fiado</span><span><i style="background:var(--accent)"></i>Recebido</span></div>
    <div class="chart${qtd > 6 ? ' longo' : ''}" role="img" aria-label="Gráfico de barras dos últimos ${qtd} meses, anotado e recebido por mês">
      <div class="barras">${meses.map(m => `<div class="grp" title="${esc(m.nome)}: anotado ${brl(m.anotado)}, recebido ${brl(m.recebido)}"><span class="bar a" style="height:${alt(m.anotado)}%"></span><span class="bar b" style="height:${alt(m.recebido)}%"></span></div>`).join('')}</div>
      <div class="meses">${meses.map(m => `<div><b>${esc(m.nome)}</b><span>${m.anotado ? compacto(m.anotado) : '-'}</span><span class="b">${m.recebido ? compacto(m.recebido) : '-'}</span></div>`).join('')}</div>
    </div>
    <table class="sr-only"><caption>Valores por mês</caption><tr><th>Mês</th><th>Anotado</th><th>Recebido</th></tr>${meses.map(m => `<tr><td>${esc(m.nome)}</td><td>${brl(m.anotado)}</td><td>${brl(m.recebido)}</td></tr>`).join('')}</table>
  </section>`;
}

function saldosPorCliente() {
  const m = new Map();
  for (const f of db.fiados) {
    const r = restante(f); if (r <= 0) continue;
    const o = m.get(f.clienteId) || { id: f.clienteId, total: 0, atrasado: 0, n: 0 };
    o.total += r; o.n++; if (status(f) === 'atrasado') o.atrasado += r;
    m.set(f.clienteId, o);
  }
  return [...m.values()];
}
function blocoDevedores() {
  const top = saldosPorCliente().sort((a, b) => b.total - a.total).slice(0, 5);
  if (!top.length) return '';
  return `<section class="card" aria-labelledby="h-dev"><div class="card-h"><h2 id="h-dev">Quem mais deve</h2><button class="link" data-action="ir" data-view="clientes">Ver clientes</button></div>
    <div class="lista">${top.map(t => { const c = cliente(t.id); if (!c) return '';
      return `<div class="item"><button class="row simples" data-action="abrir-cliente" data-id="${c.id}" style="grid-template-columns:44px 1fr auto;grid-template-areas:'av main val'"><span class="avatar" aria-hidden="true">${esc(iniciais(c.nome))}</span><span class="cell-main"><strong>${esc(c.nome)}</strong><small>${t.n} ${t.n === 1 ? 'fiado' : 'fiados'}${t.atrasado ? ', ' + brl(t.atrasado) + ' atrasado' : ''}</small></span><span class="cell-val"><strong>${brl(t.total)}</strong></span></button></div>`; }).join('')}</div></section>`;
}

/* ---------- tela: Fiados ---------- */
function contagens() {
  const c = { abertos: 0, atrasados: 0, pagos: 0, todos: db.fiados.length };
  for (const f of db.fiados) { const s = status(f); if (s === 'pago') c.pagos++; else { c.abertos++; if (s === 'atrasado') c.atrasados++; } }
  return c;
}
function vFiados() {
  const f = ui.f, c = contagens();
  const chip = (id, texto) => `<button class="chip" data-action="filtrar" data-status="${id}" aria-pressed="${f.status === id}">${texto} <span class="qtd">${c[id]}</span></button>`;
  const temMais = f.cliente || f.de || f.ate || f.ordem !== 'venc';
  return `<div class="pagina-h"><div><h1>Fiados</h1><p>Todos os fiados anotados. Toque em um para receber, cobrar ou corrigir.</p></div>
    <button class="btn" data-action="csv"><i class="ph ph-file-csv"></i>Baixar planilha</button></div>
  <section class="card filtros" aria-label="Filtros">
    <div class="busca"><i class="ph ph-magnifying-glass"></i><input type="search" id="busca-fiados" placeholder="Buscar por nome ou produto" value="${esc(f.busca)}" aria-label="Buscar por nome ou produto" data-bind="busca" autocomplete="off"></div>
    <div class="chips" role="group" aria-label="Situação">${chip('abertos', 'Em aberto')}${chip('atrasados', 'Atrasados')}${chip('pagos', 'Pagos')}${chip('todos', 'Todos')}</div>
    <details class="mais" ${temMais ? 'open' : ''}><summary><i class="ph ph-caret-down"></i>Mais filtros</summary>
      <div class="mais-corpo">
        <div class="campo"><label for="f-cliente">Cliente</label><select id="f-cliente" data-bind="cliente"><option value="">Todos os clientes</option>${db.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(x => `<option value="${x.id}" ${f.cliente === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="f-ordem">Ordem</label><select id="f-ordem" data-bind="ordem">
          ${[['venc', 'Vencimento mais próximo'], ['recentes', 'Mais recentes primeiro'], ['maior', 'Maior valor primeiro'], ['nome', 'Nome do cliente']].map(([v, t]) => `<option value="${v}" ${f.ordem === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="campo"><label for="f-de">Vence a partir de</label><input type="date" id="f-de" data-bind="de" value="${f.de}" data-limpar="1" data-vazio="Qualquer dia"></div>
        <div class="campo"><label for="f-ate">Vence até</label><input type="date" id="f-ate" data-bind="ate" value="${f.ate}" data-limpar="1" data-vazio="Qualquer dia"></div>
      </div>
      <button class="btn" data-action="limpar-filtros"><i class="ph ph-x"></i>Limpar filtros</button>
    </details>
  </section>
  <div id="resumo" class="resumo-lista" aria-live="polite"></div>
  <section class="card" id="lista" aria-label="Lista de fiados"></section>`;
}
const GET_FIADOS = {
  cliente: f => nomeDe(f), produtos: f => descFiado(f), compra: f => f.data, venc: f => f.venc || '9999',
  valor: f => status(f) === 'pago' ? f.valor : restante(f), situacao: f => ORDEM_ST[status(f)]
};
function filtrados() {
  const f = ui.f, q = norm(f.busca);
  let l = db.fiados.filter(x => {
    const s = status(x);
    if (f.status === 'abertos' && s === 'pago') return false;
    if (f.status === 'atrasados' && s !== 'atrasado') return false;
    if (f.status === 'pagos' && s !== 'pago') return false;
    if (f.cliente && x.clienteId !== f.cliente) return false;
    if (q && !(norm(nomeDe(x)).includes(q) || norm(descFiado(x)).includes(q))) return false;
    if ((f.de || f.ate) && !x.venc) return false;
    if (f.de && x.venc < f.de) return false;
    if (f.ate && x.venc > f.ate) return false;
    return true;
  });
  const o = f.ordem;
  l.sort((a, b) => {
    if (o === 'recentes') return b.data.localeCompare(a.data);
    if (o === 'maior') return restante(b) - restante(a);
    if (o === 'nome') return nomeDe(a).localeCompare(nomeDe(b));
    return (a.venc || '9999').localeCompare(b.venc || '9999');
  });
  return ordenarPor(l, 'fiados', GET_FIADOS);
}
function renderLista() {
  const l = filtrados(), el = $('#lista'); if (!el) return;
  const falta = l.reduce((s, x) => s + Math.max(0, restante(x)), 0);
  $('#resumo').innerHTML = l.length
    ? `<span><b>${l.length}</b> ${l.length === 1 ? 'fiado' : 'fiados'}</span><span>${ui.f.status === 'pagos' ? 'Tudo quitado' : 'Falta receber: <b>' + brl(falta) + '</b>'}</span>`
    : '';
  if (!l.length) {
    const filtrando = ui.f.busca || ui.f.cliente || ui.f.de || ui.f.ate || ui.f.status !== 'todos';
    el.innerHTML = db.fiados.length && filtrando
      ? `<div class="vazio"><i class="ph ph-magnifying-glass"></i><h3>Nada encontrado</h3><p>Nenhum fiado combina com esses filtros.</p><button class="btn" data-action="limpar-filtros">Limpar filtros</button></div>`
      : `<div class="vazio"><i class="ph ph-receipt"></i><h3>Nenhum fiado anotado</h3><p>Quando alguém levar algo fiado, anote aqui para não esquecer.</p><button class="btn btn-primary" data-action="novo-fiado"><i class="ph ph-plus"></i>Anotar fiado</button></div>`;
    return;
  }
  el.innerHTML = `<div class="so-cel"><div class="lista">${l.map(f => itemFiado(f)).join('')}</div></div>
    <div class="so-pc"><table class="tb"><thead><tr>${th('fiados', 'cliente', 'Cliente')}${th('fiados', 'produtos', 'Produtos')}${th('fiados', 'compra', 'Compra')}${th('fiados', 'venc', 'Vencimento')}${th('fiados', 'valor', 'Valor', 1)}${th('fiados', 'situacao', 'Situação')}</tr></thead>
    <tbody>${l.map(f => { const enc = encargoDevido(f), r = restante(f), pg = status(f) === 'pago';
      return `<tr data-action="abrir-fiado" data-id="${f.id}" tabindex="0"><td>${celCli(nomeDe(f))}</td><td><span class="clamp">${descFiado(f) ? esc(descFiado(f)) : '-'}</span></td><td class="dt">${fmtData(f.data)}</td><td class="dt">${f.venc ? fmtData(f.venc) : 'Sem data'}</td>
      <td class="n"><b>${pg ? brl(f.valor) : brl(r)}</b>${enc > 0 ? `<br><small class="muted">+ ${brl(enc)} de juros</small>` : !pg && r !== f.valor ? `<br><small class="muted">de ${brl(f.valor)}</small>` : ''}</td><td>${badge(f)}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="4">${l.length} ${l.length === 1 ? 'fiado' : 'fiados'}</td><td class="n">${brl(falta)}</td><td>falta receber</td></tr></tfoot></table></div>`;
}

/* ---------- tela: Clientes ---------- */
function vClientes() {
  return `<div class="pagina-h"><div><h1>Clientes</h1><p>Quem já pegou fiado com você e quanto cada um deve hoje.</p></div>
    <button class="btn btn-primary" data-action="novo-cliente"><i class="ph ph-user-plus"></i>Novo cliente</button></div>
  <section class="card filtros"><div class="busca" style="margin:0"><i class="ph ph-magnifying-glass"></i><input type="search" id="busca-clientes" placeholder="Buscar cliente pelo nome" value="${esc(ui.cb)}" aria-label="Buscar cliente" data-bind="cb" autocomplete="off"></div></section>
  <section class="card" id="lista-clientes" aria-label="Lista de clientes"></section>`;
}
function renderListaClientes() {
  const el = $('#lista-clientes'); if (!el) return;
  const q = norm(ui.cb);
  const saldos = new Map(saldosPorCliente().map(x => [x.id, x]));
  let l = db.clientes.filter(c => !q || norm(c.nome).includes(q)).sort((a, b) => ((saldos.get(b.id)?.total) || 0) - ((saldos.get(a.id)?.total) || 0) || a.nome.localeCompare(b.nome));
  if (!l.length) {
    el.innerHTML = db.clientes.length
      ? `<div class="vazio"><i class="ph ph-magnifying-glass"></i><h3>Nenhum cliente com esse nome</h3><p>Confira a escrita ou cadastre um novo cliente.</p></div>`
      : `<div class="vazio"><i class="ph ph-users"></i><h3>Nenhum cliente ainda</h3><p>Os clientes aparecem aqui quando você anota um fiado. Você também pode cadastrar antes.</p><button class="btn btn-primary" data-action="novo-cliente"><i class="ph ph-user-plus"></i>Novo cliente</button></div>`;
    return;
  }
  const sit = c => { const x = saldos.get(c.id); return !x ? 2 : (c.limite && x.total > c.limite) || x.atrasado ? 0 : 1; };
  l = ordenarPor(l, 'clientes', { nome: c => c.nome, tel: c => c.tel || '', n: c => saldos.get(c.id)?.n || 0, limite: c => c.limite || 0, deve: c => saldos.get(c.id)?.total || 0, situacao: sit });
  const totalDeve = l.reduce((t, c) => t + (saldos.get(c.id)?.total || 0), 0);
  const cel = `<div class="lista">${l.map(c => {
    const x = saldos.get(c.id);
    const info = x ? `${x.n} ${x.n === 1 ? 'fiado em aberto' : 'fiados em aberto'}` : 'Sem dívida';
    return `<div class="item"><button class="row simples" data-action="abrir-cliente" data-id="${c.id}" style="grid-template-columns:44px 1fr auto;grid-template-areas:'av main val' 'av badge badge'">
      <span class="avatar" aria-hidden="true">${esc(iniciais(c.nome))}</span>
      <span class="cell-main"><strong>${esc(c.nome)}</strong><small>${esc(c.tel || info)}${c.tel ? ', ' + info.toLowerCase() : ''}</small></span>
      <span class="cell-val"><strong>${x ? brl(x.total) : brl(0)}</strong></span>
      ${x && c.limite && x.total > c.limite ? '<span class="badge st-atrasado"><i class="ph ph-warning-circle"></i>Acima do limite</span>' : x && x.atrasado ? '<span class="badge st-atrasado"><i class="ph ph-warning-circle"></i>Atrasado</span>' : x ? '' : '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Em dia</span>'}
    </button></div>`;
  }).join('')}</div>`;
  const tab = `<table class="tb"><thead><tr>${th('clientes', 'nome', 'Cliente')}${th('clientes', 'tel', 'WhatsApp')}${th('clientes', 'n', 'Fiados em aberto', 1)}${th('clientes', 'limite', 'Limite', 1)}${th('clientes', 'deve', 'Deve hoje', 1)}${th('clientes', 'situacao', 'Situação')}</tr></thead><tbody>
    ${l.map(c => { const x = saldos.get(c.id);
      const b = x && c.limite && x.total > c.limite ? '<span class="badge st-atrasado"><i class="ph ph-warning-circle"></i>Acima do limite</span>' : x && x.atrasado ? '<span class="badge st-atrasado"><i class="ph ph-warning-circle"></i>Atrasado</span>' : x ? '<span class="badge"><i class="ph ph-clock"></i>Em aberto</span>' : '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Em dia</span>';
      return `<tr data-action="abrir-cliente" data-id="${c.id}" tabindex="0"><td>${celCli(c.nome)}</td><td class="dt">${c.tel ? esc(c.tel) : '-'}</td><td class="n">${x ? x.n : 0}</td><td class="n">${c.limite ? brl(c.limite) : '-'}</td><td class="n"><b>${brl(x ? x.total : 0)}</b></td><td>${b}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="4">${l.length} ${l.length === 1 ? 'cliente' : 'clientes'}</td><td class="n">${brl(totalDeve)}</td><td>deve no total</td></tr></tfoot></table>`;
  el.innerHTML = `<div class="so-cel">${cel}</div><div class="so-pc">${tab}</div>`;
}

/* ---------- tela: Produtos ---------- */
function vProdutos() {
  return `<div class="pagina-h"><div><h1>Produtos e serviços</h1><p>Tudo o que você vende, seja produto ou serviço. Cadastre uma vez e escolha na hora de anotar o fiado: o total sai sozinho.</p></div>
    <div class="rel-acoes"><button class="btn" data-action="sugestoes"><i class="ph ph-magic-wand"></i>Sugestões do meu ramo</button><button class="btn btn-primary" data-action="novo-produto"><i class="ph ph-plus"></i>Novo produto ou serviço</button></div></div>
  <section class="card filtros"><div class="busca"><i class="ph ph-magnifying-glass"></i><input type="search" id="busca-produtos" placeholder="Buscar produto pelo nome" value="${esc(ui.pb)}" aria-label="Buscar produto" data-bind="pb" autocomplete="off"></div>
    <div class="chips" role="group" aria-label="Ordem"><button class="chip" data-action="prod-ordem" data-v="az" aria-pressed="${ui.po === 'az'}">Ordem alfabética</button><button class="chip" data-action="prod-ordem" data-v="vendidos" aria-pressed="${ui.po === 'vendidos'}"><i class="ph ph-trend-up"></i>Mais vendidos</button></div></section>
  <section class="card" id="lista-produtos" aria-label="Lista de produtos"></section>`;
}
function renderListaProdutos() {
  const el = $('#lista-produtos'); if (!el) return;
  const q = norm(ui.pb), uso = new Map(), vend = vendidos('0000-00-00', '9999-99-99');
  for (const f of db.fiados) for (const i of f.itens || []) uso.set(i.pid, (uso.get(i.pid) || 0) + 1);
  let l = db.produtos.filter(p => !q || norm(p.nome).includes(q)).sort((a, b) => ui.po === 'vendidos' ? ((vend.get(b.id)?.valor) || 0) - ((vend.get(a.id)?.valor) || 0) || a.nome.localeCompare(b.nome) : a.nome.localeCompare(b.nome));
  if (!l.length) {
    el.innerHTML = db.produtos.length
      ? '<div class="vazio"><i class="ph ph-magnifying-glass"></i><h3>Nenhum produto com esse nome</h3><p>Confira a escrita ou cadastre um produto novo.</p></div>'
      : '<div class="vazio"><i class="ph ph-package"></i><h3>Nada cadastrado ainda</h3><p>Cadastre o que você vende (produtos ou serviços), com o preço. Na hora de anotar um fiado, é só escolher e o valor é somado sozinho.</p><div class="botoes-linha" style="justify-content:center"><button class="btn btn-primary" data-action="novo-produto"><i class="ph ph-plus"></i>Cadastrar o primeiro</button><button class="btn" data-action="sugestoes"><i class="ph ph-magic-wand"></i>Sugestões do meu ramo</button></div></div>';
    return;
  }
  l = ordenarPor(l, 'produtos', { nome: p => p.nome, un: p => UN[p.un] || '', preco: p => p.preco, qtd: p => vend.get(p.id)?.qtd || 0, n: p => uso.get(p.id) || 0, valor: p => vend.get(p.id)?.valor || 0 });
  const cel = `<div class="lista">${l.map(p => {
    const n = uso.get(p.id) || 0;
    return `<div class="item"><button class="row simples" data-action="editar-produto" data-id="${p.id}" style="grid-template-columns:44px 1fr auto;grid-template-areas:'av main val'">
      <span class="avatar" aria-hidden="true"><i class="ph ph-package"></i></span>
      <span class="cell-main"><strong>${esc(p.nome)}</strong><small>${n ? 'Em ' + n + (n === 1 ? ' fiado' : ' fiados') + (vend.get(p.id) ? ', ' + fmtQtd(vend.get(p.id).qtd) + ' ' + (UN_CURTA[p.un] || 'un') + ' no total' : '') : 'Ainda não usado em fiado'}</small></span>
      <span class="cell-val"><strong>${brl(p.preco)}</strong><small>por ${UN[p.un] || 'unidade'}</small></span>
    </button></div>`;
  }).join('')}</div>`;
  const tab = `<table class="tb"><thead><tr>${th('produtos', 'nome', 'Produto ou serviço')}${th('produtos', 'un', 'Cobrado por')}${th('produtos', 'preco', 'Preço', 1)}${th('produtos', 'qtd', 'Quantidade vendida', 1)}${th('produtos', 'n', 'Em fiados', 1)}${th('produtos', 'valor', 'Total vendido', 1)}</tr></thead><tbody>
    ${l.map(p => { const v = vend.get(p.id), n = uso.get(p.id) || 0;
      return `<tr data-action="editar-produto" data-id="${p.id}" tabindex="0"><td>${celCli(p.nome, 'ph-package')}</td><td>${UN[p.un] || 'unidade'}</td><td class="n"><b>${brl(p.preco)}</b></td><td class="n">${v ? fmtQtd(Math.round(v.qtd * 100) / 100) + ' ' + (UN_CURTA[p.un] || 'un') : '-'}</td><td class="n">${n || '-'}</td><td class="n">${v ? brl(v.valor) : '-'}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="5">${l.length} ${l.length === 1 ? 'item' : 'itens'}</td><td class="n">${brl(l.reduce((t, p) => t + (vend.get(p.id)?.valor || 0), 0))}</td></tr></tfoot></table>`;
  el.innerHTML = `<div class="so-cel">${cel}</div><div class="so-pc">${tab}</div>`;
}
function formProduto(p) {
  abrir(sheet(p ? 'Editar produto ou serviço' : 'Novo produto ou serviço', `<form data-form="produto" novalidate>
    <input type="hidden" name="id" value="${p ? p.id : ''}">
    <div class="campo"><label for="fp-nome">Nome do produto</label><input type="text" id="fp-nome" name="nome" value="${esc(p ? p.nome : '')}" placeholder="Exemplo: Arroz 5kg ou Corte de cabelo" autofocus autocomplete="off"><small class="erro" data-erro="nome"></small></div>
    <div class="campo"><label for="fp-preco">Preço</label><div class="valor-wrap"><span>R$</span><input type="text" id="fp-preco" name="preco" inputmode="decimal" placeholder="0,00" value="${p ? valorInput(p.preco) : ''}" autocomplete="off"></div><small class="erro" data-erro="preco"></small></div>
    <div class="campo"><label for="fp-un">Cobrado por</label><select id="fp-un" name="un">${Object.entries(UN).map(([k, v]) => `<option value="${k}" ${p && p.un === k ? 'selected' : ''}>${v}</option>`).join('')}</select><small class="ajuda">Exemplo: arroz por pacote, carne por quilo, corte de cabelo por serviço, mão de obra por hora.</small></div>
    <div class="sheet-acoes"><button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-check"></i>Salvar produto</button>
    ${p ? `<button class="btn btn-danger" type="button" data-action="apagar-produto" data-id="${p.id}"><i class="ph ph-trash"></i>Apagar produto</button>` : ''}</div>
  </form>`));
}

/* ---------- sugestoes de produtos por ramo ---------- */
function listaSug(chave) {
  const r = RAMOS[chave]; if (!r) return '<p class="muted">Escolha o seu ramo acima para ver sugestões.</p>';
  const tem = new Set(db.produtos.map(p => norm(p.nome)));
  return `<p class="muted" style="margin:4px 0 10px">Marque o que você vende. Os preços são só exemplos: depois é só tocar no produto para ajustar.</p><div class="lista">${r[1].map(([n, pr, un], i) => `<label class="sug"><input type="checkbox" name="s" value="${i}" ${tem.has(norm(n)) ? 'disabled' : 'checked'}><span><b>${esc(n)}</b><small>${tem.has(norm(n)) ? 'Já cadastrado' : brl(Math.round(pr * 100)) + ' por ' + UN[un]}</small></span></label>`).join('')}</div>
    <div class="sheet-acoes"><button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-check"></i>Adicionar os marcados</button></div>`;
}
function abrirSugestoes(chave) {
  const opts = Object.entries(RAMOS).map(([k, v]) => `<option value="${k}" ${k === chave ? 'selected' : ''}>${v[0]}</option>`).join('');
  abrir(sheet('Sugestões para o seu ramo', `<form data-form="sugestoes" novalidate><div class="campo"><label for="sg-ramo">Qual é o seu ramo?</label><select id="sg-ramo" name="ramo" data-bind="ramo-sug"><option value="">Escolher o ramo</option>${opts}</select></div><div id="sug-lista">${listaSug(chave)}</div></form>`));
}

/* ---------- tela: Quem ja pagou ---------- */
const FORMAS = ['Dinheiro', 'Pix', 'Cartão', 'Outro'];
const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['3m', '3 meses'], ['tudo', 'Tudo']];
function intervalo(p) {
  const h = hoje();
  if (p === 'hoje') return [h, h];
  if (p === '7d') return [addDias(h, -6), h];
  if (p === 'mes') return [h.slice(0, 7) + '-01', h];
  if (p === '3m') { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 2); return [isoDe(d), h]; }
  return ['0000-00-00', '9999-99-99'];
}
function pagamentosFiltrados() {
  const g = ui.pg, [a, b] = intervalo(g.periodo), out = [];
  for (const f of db.fiados) {
    if (g.cliente && f.clienteId !== g.cliente) continue;
    for (const p of f.pagamentos) {
      if (p.data < a || p.data > b) continue;
      if (g.forma && (p.forma || 'Dinheiro') !== g.forma) continue;
      out.push({ f, p });
    }
  }
  return out.sort((x, y) => y.p.data.localeCompare(x.p.data));
}
function quitadosFiltrados() {
  const g = ui.pg, [a, b] = intervalo(g.periodo), out = [];
  for (const f of db.fiados) {
    if (g.cliente && f.clienteId !== g.cliente) continue;
    const q = quitacao(f); if (!q || q.data < a || q.data > b) continue;
    out.push({ f, q });
  }
  return out.sort((x, y) => y.q.data.localeCompare(x.q.data));
}
function vPagos() {
  const g = ui.pg;
  const chip = (acao, v, t, ativo) => `<button class="chip" data-action="${acao}" data-v="${v}" aria-pressed="${ativo}">${t}</button>`;
  return `<div class="pagina-h"><div><h1>Quem já pagou</h1><p>Os pagamentos que você recebeu e os fiados que já foram quitados.</p></div>
    <button class="btn" data-action="csv-pagos"><i class="ph ph-file-csv"></i>Baixar planilha</button></div>
  <section class="card filtros" aria-label="Filtros">
    <div class="chips" role="group" aria-label="Mostrar">${chip('pg-aba', 'pagamentos', 'Pagamentos recebidos', g.aba === 'pagamentos')}${chip('pg-aba', 'quitados', 'Fiados quitados', g.aba === 'quitados')}</div>
    <div class="chips" role="group" aria-label="Período" style="margin-top:12px">${PERIODOS.map(([v, t]) => chip('pg-periodo', v, t, g.periodo === v)).join('')}</div>
    <details class="mais" ${g.cliente || g.forma ? 'open' : ''}><summary><i class="ph ph-caret-down"></i>Mais filtros</summary>
      <div class="mais-corpo">
        <div class="campo"><label for="pg-cliente">Cliente</label><select id="pg-cliente" data-bind="pg-cliente"><option value="">Todos os clientes</option>${db.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(x => `<option value="${x.id}" ${g.cliente === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        ${g.aba === 'pagamentos' ? `<div class="campo"><label for="pg-forma">Forma de pagamento</label><select id="pg-forma" data-bind="pg-forma"><option value="">Todas</option>${FORMAS.map(x => `<option ${g.forma === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` : ''}
      </div>
    </details>
  </section>
  <div id="pg-corpo"></div>`;
}
function renderPagos() {
  const el = $('#pg-corpo'); if (!el) return;
  const g = ui.pg, pags = pagamentosFiltrados(), quit = quitadosFiltrados();
  const total = pags.reduce((s, x) => s + recebido(x.p), 0);
  const comVenc = quit.filter(x => x.f.venc), noPrazo = comVenc.filter(x => atrasoPagamento(x.f) <= 0);
  const tiles = `<div class="stats">
    <div class="stat"><span class="rot"><i class="ph ph-hand-coins"></i>Total recebido</span><span class="val">${brl(total)}</span><span class="sub">no período</span></div>
    <div class="stat"><span class="rot"><i class="ph ph-receipt"></i>Pagamentos</span><span class="val">${pags.length}</span><span class="sub">${pags.length === 1 ? 'recebido' : 'recebidos'}</span></div>
    <div class="stat"><span class="rot"><i class="ph ph-check-circle"></i>Fiados quitados</span><span class="val">${quit.length}</span><span class="sub">contas fechadas</span></div>
    <div class="stat"><span class="rot"><i class="ph ph-calendar-check"></i>Pagaram no prazo</span><span class="val">${comVenc.length ? noPrazo.length + ' de ' + comVenc.length : '-'}</span><span class="sub">entre os quitados</span></div>
  </div>`;

  const formaIcone = { Dinheiro: 'ph-money', Pix: 'ph-qr-code', 'Cartão': 'ph-credit-card', Outro: 'ph-dots-three' };
  const porForma = FORMAS.map(f => ({ f, v: pags.filter(x => (x.p.forma || 'Dinheiro') === f).reduce((s, x) => s + recebido(x.p), 0) })).filter(x => x.v > 0);
  const porCli = new Map();
  for (const { f, p } of pags) porCli.set(f.clienteId, (porCli.get(f.clienteId) || 0) + recebido(p));
  const topCli = [...porCli.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lateral = `<div>
    <section class="card"><div class="card-h"><h2>Como pagaram</h2></div>${porForma.length ? `<div class="formas">${porForma.map(x => `<div><span><i class="ph ${formaIcone[x.f]}"></i>${x.f}</span><b class="num">${brl(x.v)}</b></div>`).join('')}</div>` : '<p class="muted">Sem pagamentos neste período.</p>'}</section>
    <section class="card"><div class="card-h"><h2>Quem mais pagou</h2></div>${topCli.length ? `<div class="formas">${topCli.map(([id, v]) => `<div><span>${esc((cliente(id) || { nome: 'Cliente apagado' }).nome)}</span><b class="num">${brl(v)}</b></div>`).join('')}</div>` : '<p class="muted">Sem pagamentos neste período.</p>'}</section>
  </div>`;

  let lista;
  if (g.aba === 'pagamentos') {
    const ord = ordenarPor(pags, 'pags', { data: x => x.p.data, cliente: x => nomeDe(x.f), forma: x => x.p.forma || 'Dinheiro', valor: x => recebido(x.p), situacao: x => { const q = quitacao(x.f); return q && q.pid === x.p.id ? 0 : 1; } });
    const cel = ord.length ? `<div class="lista">${ord.map(({ f, p }) => {
      const q = quitacao(f), fechou = q && q.pid === p.id;
      return `<div class="item"><button class="row simples" data-action="abrir-fiado" data-id="${f.id}"><span class="avatar" aria-hidden="true">${esc(iniciais(nomeDe(f)))}</span>
        <span class="cell-main"><strong>${esc(nomeDe(f))}</strong><small>${fmtData(p.data)}, ${esc(p.forma || 'Dinheiro')}</small></span>
        <span class="cell-val"><strong>${brl(recebido(p))}</strong>${p.encargo ? `<small>com ${brl(p.encargo)} de juros</small>` : ''}</span>
        ${fechou ? '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Quitou o fiado</span>' : restante(f) > 0 ? `<span class="badge"><i class="ph ph-hourglass-medium"></i>Parcial, falta ${brl(restante(f))}</span>` : ''}</button></div>`;
    }).join('')}</div>` : '';
    const tab = `<table class="tb"><thead><tr>${th('pags', 'data', 'Data')}${th('pags', 'cliente', 'Cliente')}${th('pags', 'forma', 'Forma')}${th('pags', 'valor', 'Valor recebido', 1)}${th('pags', 'situacao', 'Situação')}</tr></thead><tbody>
      ${ord.map(({ f, p }) => { const q = quitacao(f), fechou = q && q.pid === p.id;
        return `<tr data-action="abrir-fiado" data-id="${f.id}" tabindex="0"><td class="dt">${fmtData(p.data)}</td><td>${celCli(nomeDe(f))}</td><td>${esc(p.forma || 'Dinheiro')}</td><td class="n"><b>${brl(recebido(p))}</b>${p.encargo ? `<br><small class="muted">com ${brl(p.encargo)} de juros</small>` : ''}</td>
        <td>${fechou ? '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Quitou o fiado</span>' : restante(f) > 0 ? `<span class="badge"><i class="ph ph-hourglass-medium"></i>Parcial, falta ${brl(restante(f))}</span>` : ''}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="3">${ord.length} ${ord.length === 1 ? 'pagamento' : 'pagamentos'}</td><td class="n">${brl(total)}</td><td></td></tr></tfoot></table>`;
    lista = ord.length ? `<div class="so-cel">${cel}</div><div class="so-pc">${tab}</div>` : vazioPagos('Nenhum pagamento neste período', 'Mude o período ou os filtros para ver outros recebimentos.');
  } else {
    const ord = ordenarPor(quit, 'quit', { cliente: x => nomeDe(x.f), quitado: x => x.q.data, venc: x => x.f.venc || '9999', valor: x => x.f.valor, pont: x => { const a = atrasoPagamento(x.f); return a === null ? 9999 : a; } });
    const bdg = f => { const a = atrasoPagamento(f);
      return a === null ? '<span class="badge"><i class="ph ph-calendar-blank"></i>Sem vencimento</span>'
        : a <= 0 ? '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Pagou no prazo</span>'
        : `<span class="badge st-hoje"><i class="ph ph-clock"></i>Pagou ${a} ${a === 1 ? 'dia' : 'dias'} depois</span>`; };
    const cel = `<div class="lista">${ord.map(({ f, q }) => `<div class="item"><button class="row simples" data-action="abrir-fiado" data-id="${f.id}"><span class="avatar" aria-hidden="true">${esc(iniciais(nomeDe(f)))}</span>
        <span class="cell-main"><strong>${esc(nomeDe(f))}</strong><small>Quitado em ${fmtData(q.data)}</small></span>
        <span class="cell-val"><strong>${brl(f.valor)}</strong></span>${bdg(f)}</button></div>`).join('')}</div>`;
    const tab = `<table class="tb"><thead><tr>${th('quit', 'cliente', 'Cliente')}${th('quit', 'quitado', 'Quitado em')}${th('quit', 'venc', 'Vencimento')}${th('quit', 'valor', 'Valor', 1)}${th('quit', 'pont', 'Pontualidade')}</tr></thead><tbody>
      ${ord.map(({ f, q }) => `<tr data-action="abrir-fiado" data-id="${f.id}" tabindex="0"><td>${celCli(nomeDe(f))}</td><td class="dt">${fmtData(q.data)}</td><td class="dt">${f.venc ? fmtData(f.venc) : '-'}</td><td class="n"><b>${brl(f.valor)}</b></td><td>${bdg(f)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">${ord.length} ${ord.length === 1 ? 'fiado quitado' : 'fiados quitados'}</td><td class="n">${brl(ord.reduce((t, x) => t + x.f.valor, 0))}</td><td></td></tr></tfoot></table>`;
    lista = ord.length ? `<div class="so-cel">${cel}</div><div class="so-pc">${tab}</div>` : vazioPagos('Nenhum fiado quitado neste período', 'Quando um cliente terminar de pagar, o fiado aparece aqui.');
  }
  el.innerHTML = tiles + `<div class="grade-2"><section class="card" aria-label="${g.aba === 'pagamentos' ? 'Pagamentos recebidos' : 'Fiados quitados'}">${lista}</section>${lateral}</div>`;
}
const vazioPagos = (t, p) => `<div class="vazio"><i class="ph ph-hand-coins"></i><h3>${t}</h3><p>${p}</p></div>`;
function baixarCsvPagos() {
  const cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  let linhas, n;
  if (ui.pg.aba === 'pagamentos') {
    const l = pagamentosFiltrados(); n = l.length;
    linhas = [['Data', 'Cliente', 'Valor recebido', 'Multa e juros', 'Forma', 'Fiado (valor total)']];
    for (const { f, p } of l) linhas.push([fmtData(p.data), nomeDe(f), valorInput(recebido(p)), valorInput(p.encargo || 0), p.forma || 'Dinheiro', valorInput(f.valor)]);
  } else {
    const l = quitadosFiltrados(); n = l.length;
    linhas = [['Quitado em', 'Cliente', 'Valor', 'Vencimento', 'Dias de atraso']];
    for (const { f, q } of l) { const a = atrasoPagamento(f); linhas.push([fmtData(q.data), nomeDe(f), valorInput(f.valor), fmtData(f.venc), a === null ? '' : Math.max(0, a)]); }
  }
  baixar(`${ui.pg.aba === 'pagamentos' ? 'pagamentos' : 'quitados'}-${hoje()}.csv`, '\ufeff' + linhas.map(r => r.map(cel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast(`Planilha com ${n} ${n === 1 ? 'linha' : 'linhas'} baixada.`);
}
function blocoUltimosPagamentos() {
  const l = [];
  for (const f of db.fiados) for (const p of f.pagamentos) l.push({ f, p });
  l.sort((a, b) => b.p.data.localeCompare(a.p.data));
  if (!l.length) return '';
  return `<section class="card" aria-labelledby="h-ult"><div class="card-h"><h2 id="h-ult">Últimos pagamentos</h2><button class="link" data-action="ir" data-view="pagos">Ver todos</button></div>
    <div class="lista">${l.slice(0, 5).map(({ f, p }) => `<div class="item"><button class="row simples" data-action="abrir-fiado" data-id="${f.id}" style="grid-template-columns:44px 1fr auto;grid-template-areas:'av main val'"><span class="avatar" aria-hidden="true">${esc(iniciais(nomeDe(f)))}</span><span class="cell-main"><strong>${esc(nomeDe(f))}</strong><small>${fmtData(p.data)}, ${esc(p.forma || 'Dinheiro')}</small></span><span class="cell-val"><strong>${brl(recebido(p))}</strong></span></button></div>`).join('')}</div></section>`;
}

/* ---------- produtos mais vendidos ---------- */
function vendidos(a, b) {
  const m = new Map();
  for (const f of db.fiados) {
    if (f.data < a || f.data > b) continue;
    for (const i of f.itens || []) {
      const o = m.get(i.pid) || { pid: i.pid, nome: i.nome, un: i.un, qtd: 0, valor: 0 };
      o.qtd += i.qtd; o.valor += subtotal(i); m.set(i.pid, o);
    }
  }
  return m;
}

/* ---------- cobrancas do dia ---------- */
function paraCobrar() {
  const h = hoje(), m = new Map();
  for (const f of db.fiados) {
    if (restante(f) <= 0 || !f.venc || f.venc > h) continue;
    const o = m.get(f.clienteId) || { id: f.clienteId, fiados: [], principal: 0, enc: 0, dias: 0, ultima: '' };
    o.fiados.push(f); o.principal += restante(f); o.enc += encargoDevido(f);
    o.dias = Math.max(o.dias, diffDias(f.venc, h));
    if (f.cobrado && f.cobrado > o.ultima) o.ultima = f.cobrado;
    m.set(f.clienteId, o);
  }
  return [...m.values()].map(o => ({ ...o, total: o.principal + o.enc, feito: o.fiados.every(f => f.cobrado === h) }))
    .filter(o => cliente(o.id)).sort((a, b) => (a.feito - b.feito) || b.dias - a.dias);
}
function abrirCobrancas() {
  const l = paraCobrar();
  const corpo = l.length ? `<p class="muted" style="margin-bottom:12px">Clientes com fiado vencido ou que vence hoje. Toque em <b>Cobrar</b> para abrir o WhatsApp com a mensagem pronta.</p>
    <div class="lista cob-lista">${l.map(o => { const c = cliente(o.id);
      const sit = o.dias > 0 ? `${o.dias} ${o.dias === 1 ? 'dia' : 'dias'} de atraso` : 'Vence hoje';
      return `<div class="item"><div class="row simples" style="cursor:default"><span class="avatar" aria-hidden="true">${esc(iniciais(c.nome))}</span>
        <span class="cell-main"><strong>${esc(c.nome)}</strong><small>${sit}${o.ultima ? ', última cobrança ' + fmtCurta(o.ultima) : ', ainda não cobrado'}</small></span>
        <span class="cell-val"><strong>${brl(o.total)}</strong>${o.enc ? `<small>com ${brl(o.enc)} de juros</small>` : ''}</span>
        ${o.feito ? '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Cobrado hoje</span>' : ''}</div>
        <div class="item-acoes"><button class="btn ${o.feito ? '' : 'btn-zap'}" data-action="cobrar-dia" data-id="${o.id}"><i class="ph ph-whatsapp-logo"></i>${o.feito ? 'Cobrar de novo' : 'Cobrar'}</button>
        <button class="btn" data-action="abrir-cliente" data-id="${o.id}">Ver cliente</button></div></div>`; }).join('')}</div>`
    : '<div class="vazio"><i class="ph ph-check-circle"></i><h3>Ninguém para cobrar hoje</h3><p>Nenhum fiado venceu ou vence hoje.</p></div>';
  abrir(sheet('Quem cobrar hoje', corpo));
}

/* ---------- tela: Relatorios ---------- */
const PERIODOS_REL = [['mes', 'Este mês'], ['mespass', 'Mês passado'], ['3m', '3 meses'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['custom', 'Escolher datas']];
function intervaloRel() {
  const r = ui.rel, h = hoje(), d = new Date();
  if (r.periodo === 'mespass') {
    const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1), fim = new Date(d.getFullYear(), d.getMonth(), 0);
    return [isoDe(ini), isoDe(fim)];
  }
  if (r.periodo === 'ano') return [h.slice(0, 4) + '-01-01', h];
  if (r.periodo === 'custom') return [r.de || '0000-00-00', r.ate || '9999-99-99'];
  return intervalo(r.periodo);
}
function textoPeriodoRel() {
  const [a, b] = intervaloRel(), p = ui.rel.periodo;
  if (p === 'tudo') return 'todo o período';
  if (p === 'mes') return 'este mês (' + fmtData(a) + ' a ' + fmtData(b) + ')';
  return (a === '0000-00-00' ? 'o começo' : fmtData(a)) + ' a ' + (b === '9999-99-99' ? 'hoje' : fmtData(b));
}
function vRelatorios() {
  const r = ui.rel;
  return `<div class="pagina-h"><div><h1>Relatórios</h1><p>Um resumo do seu fiado: quanto foi anotado, quanto você recebeu, quem está atrasado e o que mais sai.</p></div>
    <div class="rel-acoes"><button class="btn" data-action="imprimir"><i class="ph ph-printer"></i>Imprimir ou salvar PDF</button><button class="btn" data-action="csv-rel"><i class="ph ph-file-csv"></i>Baixar planilha</button></div></div>
  <section class="card filtros" aria-label="Período do relatório">
    <div class="chips" role="group" aria-label="Período">${PERIODOS_REL.map(([v, t]) => `<button class="chip" data-action="rel-periodo" data-v="${v}" aria-pressed="${r.periodo === v}">${t}</button>`).join('')}</div>
    ${r.periodo === 'custom' ? `<div class="campo-2" style="margin-top:14px"><div class="campo" style="margin:0"><label for="rel-de">De</label><input type="date" id="rel-de" data-bind="rel-de" value="${r.de}" data-limpar="1" data-vazio="Do começo"></div>
      <div class="campo" style="margin:0"><label for="rel-ate">Até</label><input type="date" id="rel-ate" data-bind="rel-ate" value="${r.ate}" data-limpar="1" data-vazio="Até hoje"></div></div>` : ''}
  </section>
  <div id="rel-corpo"></div>`;
}
function dadosRelatorio() {
  const [a, b] = intervaloRel(), h = hoje();
  const o = { a, b, anotado: 0, nAnotado: 0, recebido: 0, nPag: 0, enc: 0, formas: new Map(), clientes: new Map() };
  const cli = id => { let c = o.clientes.get(id); if (!c) { c = { id, anotado: 0, recebido: 0, deve: 0, atrasos: [] }; o.clientes.set(id, c); } return c; };
  for (const f of db.fiados) {
    const c = cli(f.clienteId);
    if (f.data >= a && f.data <= b) { o.anotado += f.valor; o.nAnotado++; c.anotado += f.valor; }
    for (const p of f.pagamentos) if (p.data >= a && p.data <= b) {
      const v = recebido(p); o.recebido += v; o.nPag++; o.enc += p.encargo || 0; c.recebido += v;
      const fm = p.forma || 'Dinheiro'; o.formas.set(fm, (o.formas.get(fm) || 0) + v);
    }
    if (restante(f) > 0) c.deve += restante(f);
    const q = quitacao(f), at = atrasoPagamento(f); if (q && at !== null) c.atrasos.push(at);
  }
  /* envelhecimento do que esta em aberto hoje */
  const ag = [['A vencer ou sem data', 0], ['1 a 7 dias de atraso', 0], ['8 a 30 dias', 0], ['31 a 60 dias', 0], ['Mais de 60 dias', 0]];
  for (const f of db.fiados) {
    const r = restante(f); if (r <= 0) continue;
    const d = f.venc && f.venc < h ? diffDias(f.venc, h) : 0;
    ag[d === 0 ? 0 : d <= 7 ? 1 : d <= 30 ? 2 : d <= 60 ? 3 : 4][1] += r;
  }
  o.aging = ag;
  o.linhas = [...o.clientes.values()].filter(c => c.anotado || c.recebido || c.deve).sort((x, y) => y.deve - x.deve || y.anotado - x.anotado);
  return o;
}
function renderRelatorios() {
  const el = $('#rel-corpo'); if (!el) return;
  const d = dadosRelatorio(), s = stats();
  const media = c => c.atrasos.length ? Math.round(c.atrasos.reduce((t, x) => t + x, 0) / c.atrasos.length) : null;
  const tiles = `<div class="stats">
    <div class="stat"><span class="rot"><i class="ph ph-notebook"></i>Anotado no período</span><span class="val">${brl(d.anotado)}</span><span class="sub">${d.nAnotado} ${d.nAnotado === 1 ? 'fiado' : 'fiados'}</span></div>
    <div class="stat"><span class="rot"><i class="ph ph-hand-coins"></i>Recebido no período</span><span class="val">${brl(d.recebido)}</span><span class="sub">${d.nPag} ${d.nPag === 1 ? 'pagamento' : 'pagamentos'}${d.enc ? ', ' + brl(d.enc) + ' de juros' : ''}</span></div>
    <div class="stat"><span class="rot"><i class="ph ph-wallet"></i>Falta receber hoje</span><span class="val">${brl(s.aberto)}</span><span class="sub">${s.nAberto} ${s.nAberto === 1 ? 'fiado em aberto' : 'fiados em aberto'}</span></div>
    <div class="stat ${s.nAtrasado ? 'alerta' : ''}"><span class="rot"><i class="ph ph-warning-circle"></i>Atrasado hoje</span><span class="val">${brl(s.atrasado)}</span><span class="sub">${s.aberto ? Math.round(s.atrasado / s.aberto * 100) + '% do que está em aberto' : 'Nada em aberto'}</span></div>
  </div>`;
  const maxAg = Math.max(1, ...d.aging.map(x => x[1]));
  const aging = `<section class="card" aria-labelledby="h-ag"><div class="card-h"><h2 id="h-ag">Quanto está atrasado</h2></div><p class="card-sub">O que ainda falta receber hoje, separado pelo tempo de atraso.</p>
    <div class="mini-barras">${d.aging.map(([t, v], i) => `<div><span>${t}</span><span class="trilho"><i class="${i >= 3 ? 'ruim' : i >= 1 ? 'medio' : ''}" style="width:${Math.round(v / maxAg * 100)}%"></i></span><b class="num">${brl(v)}</b></div>`).join('')}</div></section>`;
  const vend = [...vendidos(d.a, d.b).values()].sort((x, y) => y.valor - x.valor).slice(0, 8), maxV = Math.max(1, ...vend.map(x => x.valor));
  const maisV = `<section class="card" aria-labelledby="h-mv"><div class="card-h"><h2 id="h-mv">Produtos mais vendidos</h2></div><p class="card-sub">Pelo que foi anotado no fiado neste período.</p>
    ${vend.length ? `<div class="mini-barras">${vend.map(x => `<div><span>${esc(x.nome)}<br><small class="muted">${fmtQtd(Math.round(x.qtd * 100) / 100)} ${UN_CURTA[x.un] || 'un'}</small></span><span class="trilho"><i style="width:${Math.round(x.valor / maxV * 100)}%"></i></span><b class="num">${brl(x.valor)}</b></div>`).join('')}</div>`
      : '<p class="muted">Nenhum produto foi anotado neste período. Escolha produtos ao anotar o fiado para ver este quadro.</p>'}</section>`;
  const fm = FORMAS.map(f => [f, d.formas.get(f) || 0]).filter(x => x[1] > 0);
  const formas = `<section class="card" aria-labelledby="h-fm"><div class="card-h"><h2 id="h-fm">Como pagaram</h2></div>${fm.length ? `<div class="formas">${fm.map(([f, v]) => `<div><span>${f}</span><b class="num">${brl(v)}</b></div>`).join('')}</div>` : '<p class="muted">Sem pagamentos neste período.</p>'}</section>`;
  const abas = [['resumo', 'ph-chart-pie-slice', 'Resumo'], ['produtos', 'ph-package', 'Produtos'], ['clientes', 'ph-users', 'Clientes']];
  const nav = `<div class="abas" role="tablist" aria-label="Partes do relatório">${abas.map(([v, ic, t]) => `<button class="aba" role="tab" data-action="rel-aba" data-v="${v}" aria-selected="${ui.rel.aba === v}"><i class="ph ${ic}"></i>${t}</button>`).join('')}</div>`;
  const topo = `<p class="rel-topo" style="margin-bottom:12px"><b>${esc(db.config.comercio || 'Caderninho do Fiado')}</b>, relatório de ${esc(textoPeriodoRel())}. Emitido em ${fmtData(hoje())}.</p>`;
  if (ui.rel.aba === 'resumo') { el.innerHTML = topo + nav + tiles + `<div class="rel-grade"><div class="largo-2">${blocoGrafico(12)}</div>${aging}${maisV}${formas}</div>`; return; }
  const ph = ui.rel.aba === 'produtos' ? 'Buscar produto pelo nome' : 'Buscar cliente pelo nome';
  const sub = ui.rel.aba === 'produtos' ? 'Todos os produtos e serviços vendidos no período. Clique no título de uma coluna para ordenar.' : 'Quem mais deve aparece primeiro. "Costuma pagar" mostra o atraso médio dos fiados já quitados.';
  el.innerHTML = topo + nav + `<section class="card"><p class="card-sub" style="margin-bottom:12px">${sub}</p><div class="busca"><i class="ph ph-magnifying-glass"></i><input type="search" id="rel-q" placeholder="${ph}" value="${esc(ui.rel.q)}" aria-label="${ph}" data-bind="rel-q" autocomplete="off"></div></section><section class="card rel-tab" id="rel-tab" aria-live="polite"></section>`;
  renderRelTab();
}
function renderRelTab() {
  const el = $('#rel-tab'); if (!el) return;
  const d = dadosRelatorio(), q = norm(ui.rel.q);
  const media = c => c.atrasos.length ? Math.round(c.atrasos.reduce((t, x) => t + x, 0) / c.atrasos.length) : null;
  if (ui.rel.aba === 'produtos') {
    let l = [...vendidos(d.a, d.b).values()].filter(x => !q || norm(x.nome).includes(q));
    const tot = l.reduce((t, x) => t + x.valor, 0);
    if (!l.length) { el.innerHTML = '<p class="muted" style="padding:18px">Nenhum produto encontrado neste período.</p>'; return; }
    l = ordenarPor(l.sort((x, y) => y.valor - x.valor), 'relp', { nome: x => x.nome, qtd: x => x.qtd, valor: x => x.valor, pct: x => x.valor });
    el.innerHTML = `<div class="tb-rel"><table class="tb"><thead><tr>${th('relp', 'nome', 'Produto ou serviço')}${th('relp', 'qtd', 'Quantidade', 1)}${th('relp', 'valor', 'Total vendido', 1)}${th('relp', 'pct', '% do total', 1)}</tr></thead><tbody>
      ${l.map(x => `<tr style="cursor:default"><td><b>${esc(x.nome)}</b></td><td class="n">${fmtQtd(Math.round(x.qtd * 100) / 100)} ${UN_CURTA[x.un] || 'un'}</td><td class="n"><b>${brl(x.valor)}</b></td><td class="n">${tot ? (x.valor / tot * 100).toFixed(1).replace('.', ',') : '0'}%</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${l.length} ${l.length === 1 ? 'item' : 'itens'}</td><td></td><td class="n">${brl(tot)}</td><td></td></tr></tfoot></table></div>`;
    return;
  }
  let l = d.linhas.filter(c => { const cl = cliente(c.id); return !q || norm(cl ? cl.nome : '').includes(q); });
  if (!l.length) { el.innerHTML = '<p class="muted" style="padding:18px">Nenhum cliente com movimento neste período.</p>'; return; }
  const nm = c => { const cl = cliente(c.id); return cl ? cl.nome : 'Cliente apagado'; };
  l = ordenarPor(l, 'relc', { nome: nm, anotado: c => c.anotado, recebido: c => c.recebido, deve: c => c.deve, pagar: c => { const m = media(c); return m === null ? -9999 : m; } });
  const sm = k => l.reduce((t, c) => t + c[k], 0);
  el.innerHTML = `<div class="tb-rel"><table class="tb"><thead><tr>${th('relc', 'nome', 'Cliente')}${th('relc', 'anotado', 'Anotado', 1)}${th('relc', 'recebido', 'Recebido', 1)}${th('relc', 'deve', 'Deve hoje', 1)}${th('relc', 'pagar', 'Costuma pagar')}</tr></thead><tbody>
    ${l.map(c => { const m = media(c); return `<tr style="cursor:default"><td>${celCli(nm(c))}</td><td class="n">${brl(c.anotado)}</td><td class="n">${brl(c.recebido)}</td><td class="n"><b>${brl(c.deve)}</b></td><td>${m === null ? '-' : m <= 0 ? 'No prazo' : m + (m === 1 ? ' dia depois' : ' dias depois')}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td>${l.length} ${l.length === 1 ? 'cliente' : 'clientes'}</td><td class="n">${brl(sm('anotado'))}</td><td class="n">${brl(sm('recebido'))}</td><td class="n">${brl(sm('deve'))}</td><td></td></tr></tfoot></table></div>`;
}
function baixarCsvRel() {
  const d = dadosRelatorio(), cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const linhas = [['Cliente', 'Anotado no período', 'Recebido no período', 'Deve hoje', 'Atraso médio (dias)']];
  for (const c of d.linhas) { const cl = cliente(c.id); linhas.push([cl ? cl.nome : 'Cliente apagado', valorInput(c.anotado), valorInput(c.recebido), valorInput(c.deve), c.atrasos.length ? Math.round(c.atrasos.reduce((t, x) => t + x, 0) / c.atrasos.length) : '']); }
  baixar(`relatorio-${hoje()}.csv`, '﻿' + linhas.map(r => r.map(cel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast('Planilha do relatório baixada.');
}

/* ---------- recibo para imprimir ou salvar em PDF ---------- */
function extenso(cent) {
  const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(C[c]);
    if (r) p.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''));
    return p.join(' e ');
  };
  const inteiro = n => {
    if (n === 0) return 'zero';
    const mi = Math.floor(n / 1e6), mil = Math.floor(n % 1e6 / 1000), r = n % 1000, p = [];
    if (mi) p.push(ate999(mi) + (mi === 1 ? ' milhão' : ' milhões'));
    if (mil) p.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
    if (r) p.push(ate999(r));
    return p.reduce((t, x, i) => i === 0 ? x : t + (i === p.length - 1 && (r ? r < 100 || r % 100 === 0 : true) ? ' e ' : ', ') + x, '');
  };
  const reais = Math.floor(cent / 100), cts = cent % 100, out = [];
  if (reais) out.push(inteiro(reais) + (reais === 1 ? ' real' : ' reais'));
  if (cts) out.push(inteiro(cts) + (cts === 1 ? ' centavo' : ' centavos'));
  return out.join(' e ') || 'zero reais';
}
function imprimirRecibo(fid, pid) {
  const f = db.fiados.find(x => x.id === fid), p = f && f.pagamentos.find(x => x.id === pid); if (!p) return;
  const c = cliente(f.clienteId), r = restante(f), loja = db.config.comercio || 'Comércio';
  $('#impressao').innerHTML = `<div class="recibo"><h1>RECIBO</h1><div class="r-loja">${esc(loja)}</div>
    <div class="r-valor">${brl(recebido(p))}</div>
    <p>Recebemos de <b>${esc(c ? c.nome : 'cliente')}</b> a quantia de <b>${esc(extenso(recebido(p)))}</b>, referente a pagamento de fiado${descFiado(f) ? ' (' + esc(descFiado(f)) + ')' : ''} anotado em ${fmtData(f.data)}. Pago em ${fmtData(p.data)}, forma: ${esc(p.forma || 'Dinheiro')}.</p>
    ${p.encargo ? `<p>Composição: ${brl(p.valor)} do fiado e ${brl(p.encargo)} de multa e juros por atraso.</p>` : ''}
    <p>${r > 0 ? `Saldo que ainda falta neste fiado: <b>${brl(r)}</b>.` : '<b>Com este pagamento, o fiado está quitado.</b>'}</p>
    <p style="margin-top:28px">${esc(fmtData(p.data))}</p>
    <div class="r-ass"><div></div>${esc(loja)}</div></div>`;
  document.body.classList.add('imprimindo');
  setTimeout(() => window.print(), 80);
}
window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo'));

/* ---------- tela: Mais (menu do celular) ---------- */
function vMais() {
  const lnk = (href, ic, t, d) => `<a class="menu-item" href="${href}"><span class="menu-ic"><i class="ph ${ic}"></i></span><span class="menu-tx"><strong>${t}</strong><small>${d}</small></span><i class="ph ph-caret-right"></i></a>`;
  const it = (view, ic, t, d) => `<button class="menu-item" data-action="ir" data-view="${view}"><span class="menu-ic"><i class="ph ${ic}"></i></span><span class="menu-tx"><strong>${t}</strong><small>${d}</small></span><i class="ph ph-caret-right"></i></button>`;
  return `<div class="pagina-h"><div><h1>Mais opções</h1></div></div>
  <div class="menu-lista">
    ${it('pagos', 'ph-hand-coins', 'Quem já pagou', 'Pagamentos recebidos e fiados quitados')}
    ${it('relatorios', 'ph-chart-bar', 'Relatórios', 'Resumo do período, atrasos e mais vendidos')}
    ${it('produtos', 'ph-package', 'Produtos e serviços', 'Cadastre o que você vende')}
    ${it('ajustes', 'ph-gear-six', 'Ajustes e cópia de segurança', 'Nome do comércio, mensagem de cobrança, tema')}
    <button class="menu-item" data-action="ajuda"><span class="menu-ic"><i class="ph ph-question"></i></span><span class="menu-tx"><strong>Como usar</strong><small>Passo a passo rápido</small></span><i class="ph ph-caret-right"></i></button>
    ${window.CF_USER ? `<p class="nav-grupo" style="margin-top:14px">Minha conta (${esc(window.CF_USER.nome)})</p>
    ${window.CF_USER.admin ? lnk('admin.php', 'ph-shield-check', 'Administração', 'Comércios, usuários e período de teste') : ''}
    ${window.CF_USER.dono ? lnk('equipe.php', 'ph-users-three', 'Minha equipe', 'Dar acesso a outras pessoas do comércio') : ''}
    ${lnk('senha.php', 'ph-key', 'Minha senha', 'Alterar a senha de acesso')}
    ${lnk('sair.php', 'ph-sign-out', 'Sair', 'Fechar o caderninho neste aparelho')}` : ''}
  </div>`;
}

/* ---------- tela: Ajustes ---------- */
function precisaBackup() {
  const u = db.config.ultimoBackup;
  return !u || diffDias(u, hoje()) >= 7;
}
function vAjustes() {
  const c = db.config;
  const tema = (v, t, ic) => `<label class="chip"><input type="radio" name="tema" value="${v}" data-bind="tema" ${temaAtual() === v ? 'checked' : ''}><span><i class="ph ${ic}"></i>${t}</span></label>`;
  return `<div class="pagina-h"><div><h1>Ajustes e cópia de segurança</h1><p>Deixe o sistema com a cara do seu comércio e proteja seus dados.</p></div></div>
  <section class="card ajuste-bloco" aria-labelledby="h-bk">
    <div class="card-h"><h2 id="h-bk">Cópia de segurança</h2></div>
    <p class="card-sub">${SYNC ? 'Seus dados ficam guardados <b>no servidor</b>, com cópia automática diária. Mesmo assim, é bom baixar uma cópia de vez em quando e guardar no WhatsApp, e-mail ou Google Drive.' : 'Seus dados ficam guardados <b>só neste aparelho</b>, dentro do navegador. Não vão para a internet. Por isso, se você limpar os dados do navegador ou trocar de celular ou computador, eles se perdem. Baixe uma cópia toda semana e guarde no WhatsApp, e-mail ou Google Drive.'}</p>
    <p class="muted" style="margin-bottom:14px">${c.ultimoBackup ? 'Última cópia: <b>' + fmtData(c.ultimoBackup) + '</b>' : 'Você ainda não baixou nenhuma cópia.'}</p>
    <div class="botoes-linha">
      <button class="btn btn-primary" data-action="baixar-backup"><i class="ph ph-download-simple"></i>Baixar cópia de segurança</button>
      <button class="btn" data-action="restaurar"><i class="ph ph-upload-simple"></i>Restaurar uma cópia</button>
    </div>
  </section>
  <section class="card ajuste-bloco" aria-labelledby="h-lj">
    <div class="card-h"><h2 id="h-lj">Seu comércio</h2></div>
    <form data-form="loja" novalidate>
      <div class="campo"><label for="a-nome">Nome do comércio</label><input type="text" id="a-nome" name="comercio" value="${esc(c.comercio)}" placeholder="Exemplo: Mercearia do Zé" autocomplete="off"><small class="ajuda">Aparece no topo e na mensagem de cobrança.</small></div>
      <div class="campo"><label for="a-msg">Mensagem de cobrança pelo WhatsApp</label>
        <div class="var-chips" aria-hidden="true"><code>{nome}</code><code>{valor}</code><code>{vencimento}</code><code>{comercio}</code></div>
        <textarea id="a-msg" name="msg" data-bind="msg">${esc(c.msg)}</textarea>
        <small class="ajuda">As palavras entre chaves são trocadas pelos dados do cliente na hora de enviar.</small></div>
      <div class="previa" id="previa"></div>
      <div class="botoes-linha" style="margin-top:14px"><button class="btn btn-primary" type="submit">Salvar</button><button class="btn" type="button" data-action="msg-padrao">Voltar à mensagem original</button></div>
    </form>
  </section>
  <section class="card ajuste-bloco" aria-labelledby="h-en">
    <div class="card-h"><h2 id="h-en">Multa e juros por atraso</h2></div>
    <p class="card-sub">Se quiser, o sistema calcula uma multa e juros para quem paga depois do vencimento. Fica desligado até você ativar.</p>
    <form data-form="encargos" novalidate>
      <label class="check"><input type="checkbox" name="ativo" data-bind="enc" ${c.encargos ? 'checked' : ''}><span><b>Cobrar multa e juros de quem atrasa</b><small>O valor aparece na hora de receber e na mensagem de cobrança. Você escolhe se cobra ou não, caso a caso.</small></span></label>
      <div class="campo-2">
        <div class="campo"><label for="a-multa">Multa única (%)</label><input type="text" id="a-multa" name="multa" inputmode="decimal" value="${String(c.multa ?? 2).replace('.', ',')}" data-bind="enc" autocomplete="off"><small class="ajuda">Cobrada uma vez quando passa do vencimento.</small></div>
        <div class="campo"><label for="a-juros">Juros ao mês (%)</label><input type="text" id="a-juros" name="juros" inputmode="decimal" value="${String(c.juros ?? 1).replace('.', ',')}" data-bind="enc" autocomplete="off"><small class="ajuda">Contado por dia de atraso.</small></div>
      </div>
      <div class="previa" id="enc-previa" aria-live="polite"></div>
      <div class="botoes-linha" style="margin-top:14px"><button class="btn btn-primary" type="submit">Salvar</button></div>
    </form>
  </section>
  <section class="card ajuste-bloco" aria-labelledby="h-ap">
    <div class="card-h"><h2 id="h-ap">Aparência</h2></div>
    <div class="chips" role="radiogroup" aria-label="Tema">${tema('auto', 'Automático', 'ph-circle-half')}${tema('light', 'Claro', 'ph-sun')}${tema('dark', 'Escuro', 'ph-moon')}</div>
  </section>
  <section class="card ajuste-bloco" aria-labelledby="h-ins">
    <div class="card-h"><h2 id="h-ins">Usar como aplicativo</h2></div>
    <p class="card-sub">Dá para colocar o Caderninho na tela inicial do celular, como se fosse um aplicativo. No Android, use o menu do navegador e toque em <b>Instalar aplicativo</b>. No iPhone, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>
    <div class="botoes-linha"><button class="btn" data-action="instalar" id="bt-instalar" hidden><i class="ph ph-device-mobile"></i>Instalar agora</button><button class="btn" data-action="ajuda"><i class="ph ph-question"></i>Ver o passo a passo de uso</button></div>
  </section>
  <section class="card ajuste-bloco" aria-labelledby="h-per">
    <div class="card-h"><h2 id="h-per">Zona de cuidado</h2></div>
    <p class="card-sub">Estas ações não podem ser desfeitas. Baixe uma cópia de segurança antes.</p>
    <div class="botoes-linha"><button class="btn" data-action="exemplo"><i class="ph ph-flask"></i>Carregar dados de exemplo</button><button class="btn btn-danger" data-action="apagar-tudo"><i class="ph ph-trash"></i>Apagar todos os dados</button></div>
  </section>`;
}
function montarMsg(texto, nome, valor, venc) {
  return texto.replaceAll('{nome}', nome).replaceAll('{valor}', valor).replaceAll('{vencimento}', venc).replaceAll('{comercio}', db.config.comercio || 'nosso comércio');
}
function numPct(v) { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n >= 0 ? Math.min(n, 100) : 0; }
function atualizarEncPrevia() {
  const f = $('form[data-form="encargos"]'), p = $('#enc-previa'); if (!f || !p) return;
  const m = numPct(f.elements.multa.value), j = numPct(f.elements.juros.value), ativo = f.elements.ativo.checked;
  const multa = Math.round(10000 * m / 100), juros = Math.round(10000 * (j / 100 / 30) * 10);
  p.innerHTML = '<b>Exemplo</b>' + (ativo ? `Um fiado de ${brl(10000)} pago com 10 dias de atraso: ${brl(multa)} de multa + ${brl(juros)} de juros = ${brl(10000 + multa + juros)} no total.` : 'Desligado: ninguém paga multa nem juros.');
}
function atualizarPrevia() {
  const t = $('#a-msg'), p = $('#previa'); if (!t || !p) return;
  p.innerHTML = '<b>Prévia da mensagem</b>' + esc(montarMsg(t.value, 'Dona Neuza', 'R$ 84,50', '25/11/2026'));
}

/* ---------- janela: fiado (novo e editar) ---------- */
function formFiado(f, clienteId) {
  const editando = !!f;
  const lista = db.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const semClientes = !lista.length;
  const selecionado = f ? f.clienteId : clienteId || '';
  let prazo = db.config.prazo || '15', venc = '';
  if (editando) { prazo = f.venc ? 'custom' : 'none'; venc = f.venc || ''; }
  const prazoChip = (v, t) => `<label class="chip"><input type="radio" name="prazo" value="${v}" ${prazo === v ? 'checked' : ''}><span>${t}</span></label>`;
  const maisAberto = editando && (f.desc || f.data !== hoje());
  const corpo = `<form data-form="fiado" novalidate>
    <input type="hidden" name="id" value="${f ? f.id : ''}">
    <div class="form-2col"><div class="col">
    <section class="passo-bloco" aria-labelledby="p1"><h3 class="passo" id="p1"><span class="n">1</span>Quem pegou fiado?</h3>
    ${semClientes ? '<input type="hidden" name="cliente" value="__novo">' : `
    <div class="campo" id="pick-cli"><label class="sr-only" for="ff-cliente">Escolha o cliente</label>
      <div class="pick">
        <select id="ff-cliente" name="cliente" ${selecionado ? '' : 'autofocus'}>
          <option value="">Escolher cliente</option>
          ${lista.map(c => `<option value="${c.id}" ${selecionado === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
          <option value="__novo" hidden>Cliente novo</option>
        </select>
        <button type="button" class="btn" data-action="cliente-novo-no-fiado"><i class="ph ph-user-plus"></i>Novo</button>
      </div><small class="erro" data-erro="cliente"></small></div>`}
    <div class="alerta-limite" id="limite-aviso" hidden aria-live="polite"></div>
    <div class="novo-cli" id="novo-cli" ${semClientes ? '' : 'hidden'}>
      <div class="campo"><label for="ff-nn">Nome do cliente novo</label><input type="text" id="ff-nn" name="novoNome" placeholder="Exemplo: Dona Neuza" autocomplete="off" ${semClientes ? 'autofocus' : ''}><small class="erro" data-erro="novoNome"></small></div>
      <div class="campo"><label for="ff-nt">WhatsApp (opcional)</label><input type="tel" id="ff-nt" name="novoTel" inputmode="tel" placeholder="(11) 91234-5678" autocomplete="off"><small class="ajuda">Com o número, dá para cobrar com um toque.</small></div>
      ${semClientes ? '' : '<button type="button" class="btn btn-bloco" data-action="cliente-da-lista" style="margin-bottom:14px"><i class="ph ph-arrow-left"></i>Voltar e escolher da lista</button>'}
    </div></section>
    <section class="passo-bloco" aria-labelledby="p2"><h3 class="passo" id="p2"><span class="n">2</span>O que ele levou? <small>(opcional)</small></h3>
      <div id="itens" aria-live="polite"></div>
      <div class="pick">
        <label class="sr-only" for="ff-prod">Escolher produto ou serviço</label>
        <select id="ff-prod" name="prod">
          <option value="">${db.produtos.length ? 'Escolher produto' : 'Nenhum cadastrado'}</option>
          ${db.produtos.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(p => `<option value="${p.id}">${esc(p.nome)} (${brl(p.preco)}/${UN_CURTA[p.un] || 'un'})</option>`).join('')}
        </select>
        <button type="button" class="btn" data-action="prod-novo"><i class="ph ph-plus"></i>Novo</button>
      </div>
      <small class="ajuda">${db.produtos.length ? 'Escolha na lista e ele entra sozinho. Para mais de um, escolha de novo.' : 'Se preferir, pule este passo e digite só o valor no passo 3.'}</small>
      <small class="erro" data-erro="prod"></small>
      <div class="novo-cli" id="novo-prod" hidden style="margin-top:12px">
        <div class="campo"><label for="ff-pn">Nome do produto ou serviço</label><input type="text" id="ff-pn" name="pNome" placeholder="Exemplo: Arroz 5kg, Corte de cabelo" autocomplete="off"><small class="erro" data-erro="pNome"></small></div>
        <div class="campo-2">
          <div class="campo"><label for="ff-pp">Preço</label><div class="valor-wrap"><span>R$</span><input type="text" id="ff-pp" name="pPreco" inputmode="decimal" placeholder="0,00" autocomplete="off"></div><small class="erro" data-erro="pPreco"></small></div>
          <div class="campo"><label for="ff-pu">Cobrado por</label><select id="ff-pu" name="pUn">${Object.entries(UN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        </div>
        <div class="sheet-acoes linha" style="margin:0 0 14px"><button type="button" class="btn btn-primary" data-action="add-prod-novo"><i class="ph ph-check"></i>Cadastrar e adicionar</button><button type="button" class="btn" data-action="prod-novo-cancelar">Cancelar</button></div>
      </div>
    </section>
    </div><div class="col">
    <section class="passo-bloco" aria-labelledby="p3"><h3 class="passo" id="p3"><span class="n">3</span>Quanto e quando?</h3>
    <div class="campo"><label for="ff-valor">Valor do fiado</label>
      <div class="valor-wrap"><span>R$</span><input type="text" id="ff-valor" name="valor" inputmode="decimal" placeholder="0,00" value="${f ? valorInput(f.valor) : ''}" autocomplete="off"></div>
      <small class="ajuda" id="valor-ajuda">Com produtos escolhidos, o valor é somado sozinho. Se der desconto, é só mudar aqui.</small>
      <small class="erro" data-erro="valor"></small></div>
    <div class="campo"><span class="rotulo" id="l-prazo">Quando ele vai pagar?</span>
      <div class="chips" role="radiogroup" aria-labelledby="l-prazo">${prazoChip('7', 'Em 7 dias')}${prazoChip('15', 'Em 15 dias')}${prazoChip('30', 'Em 30 dias')}${prazoChip('custom', 'Escolher o dia')}${prazoChip('none', 'Sem data')}</div>
      <div id="venc-box" ${prazo === 'custom' ? '' : 'hidden'} style="margin-top:8px"><label class="sr-only" for="ff-venc">Dia do vencimento</label><input type="date" id="ff-venc" name="venc" value="${venc}" data-vazio="Escolher o dia"></div>
      <small class="ajuda" id="venc-preview"></small><small class="erro" data-erro="venc"></small></div>
    ${editando ? '' : `<label class="check" style="margin-bottom:12px"><input type="checkbox" name="avisar" ${db.config.avisarZap !== false ? 'checked' : ''}><span><b><i class="ph ph-whatsapp-logo"></i> Avisar o cliente no WhatsApp</b><small>Depois de salvar, você vê a mensagem e envia com um toque.</small></span></label>`}
    <details class="mais" style="margin-top:0" ${maisAberto ? 'open' : ''}><summary><i class="ph ph-caret-down"></i>Mais detalhes (anotação e data da compra)</summary>
      <div style="padding-top:8px">
        <div class="campo"><label for="ff-desc">Anotação (opcional)</label><input type="text" id="ff-desc" name="desc" placeholder="Exemplo: levou na quinta, vai pagar no dia 5" value="${esc(f ? f.desc : '')}" autocomplete="off"></div>
        <div class="campo" style="margin-bottom:0"><label for="ff-data">Data da compra</label><input type="date" id="ff-data" name="data" value="${f ? f.data : hoje()}"></div>
      </div>
    </details>
    </section>
    </div></div>
    <div class="sheet-acoes"><button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-check"></i>${editando ? 'Salvar alterações' : 'Salvar fiado'}</button></div>
  </form>`;
  return sheet(editando ? 'Corrigir fiado' : 'Anotar fiado', corpo);
}
function previaVenc(form) {
  const fd = new FormData(form), p = fd.get('prazo'), data = fd.get('data') || hoje();
  let t = '';
  if (p === 'none') t = 'Sem data combinada. Esse fiado não vai aparecer como atrasado.';
  else if (p === 'custom') t = fd.get('venc') ? 'Vence em ' + fmtData(fd.get('venc')) : '';
  else t = 'Vence em ' + fmtData(addDias(data, +p));
  const el = $('#venc-preview', form); if (el) el.textContent = t;
  const box = $('#venc-box', form); if (box) box.hidden = p !== 'custom';
}
function abrirFormFiado(id, clienteId) {
  const f = id ? db.fiados.find(x => x.id === id) : null;
  formItens = f ? f.itens.map(i => ({ ...i })) : [];
  abrir(formFiado(f, clienteId), 'largo');
  previaVenc($('form', dlg));
  renderItens();
  atualizarLimite($('form', dlg));
}

/* lista de produtos dentro do formulario de fiado */
function totalItens() { return formItens.reduce((s, i) => s + subtotal(i), 0); }
function renderItens() {
  const el = $('#itens'); if (!el) return;
  if (!formItens.length) {
    el.innerHTML = db.produtos.length ? '' : '<p class="muted" style="margin-bottom:8px">Você ainda não cadastrou produtos. Cadastre pelo menu <b>Produtos</b> ou escolha "Cadastrar produto novo" abaixo. Se preferir, digite só o valor.</p>';
    return;
  }
  el.innerHTML = `<div class="itens">${formItens.map((i, n) => `<div class="it">
      <div class="it-n"><strong>${esc(i.nome)}</strong><small>${brl(i.preco)} por ${UN[i.un] || 'unidade'}</small></div>
      <div class="it-q"><button type="button" class="qbtn" data-action="qtd-menos" data-i="${n}" aria-label="Diminuir ${esc(i.nome)}"><i class="ph ph-minus"></i></button>
        <input type="text" inputmode="decimal" value="${fmtQtd(i.qtd)}" data-bind="qtd" data-i="${n}" aria-label="Quantidade de ${esc(i.nome)}">
        <button type="button" class="qbtn" data-action="qtd-mais" data-i="${n}" aria-label="Aumentar ${esc(i.nome)}"><i class="ph ph-plus"></i></button></div>
      <div class="it-t num" id="it-t-${n}">${brl(subtotal(i))}</div>
      <button type="button" class="icon-btn it-x" data-action="remover-item" data-i="${n}" aria-label="Tirar ${esc(i.nome)}"><i class="ph ph-trash"></i></button>
    </div>`).join('')}<div class="it-total"><span>Total dos produtos</span><strong class="num" id="itens-total">${brl(totalItens())}</strong></div></div>`;
}
function sincronizarValor() {
  const inp = $('#ff-valor', dlg); if (!inp) return;
  const t = totalItens();
  if (formItens.length && t > 0) inp.value = valorInput(t);
  atualizarLimite(inp.form);
}
/* aviso do limite de fiado do cliente, enquanto o formulario e preenchido */
function atualizarLimite(form) {
  const box = form && $('#limite-aviso', form); if (!box) return;
  const cid = form.elements.cliente ? form.elements.cliente.value : '', c = cliente(cid);
  if (!c || !c.limite) { box.hidden = true; return; }
  const valor = parseValor(form.elements.valor.value) || 0, id = form.elements.id.value;
  const usado = abertoDe(cid, id), depois = usado + valor;
  if (depois > c.limite) { box.innerHTML = `<i class="ph ph-warning"></i><div><b>Passou do limite de ${esc(c.nome.split(' ')[0])}</b><br>Com este fiado ele passa a dever ${brl(depois)}. O limite é ${brl(c.limite)}.</div>`; box.hidden = false; }
  else if (valor > 0 && depois >= c.limite * 0.8) { box.innerHTML = `<i class="ph ph-info"></i><div><b>Perto do limite</b><br>Ele vai passar a dever ${brl(depois)} de um limite de ${brl(c.limite)}.</div>`; box.hidden = false; }
  else box.hidden = true;
}
function mudarItens() { renderItens(); sincronizarValor(); }
function adicionarItem(p) {
  const e = formItens.find(i => i.pid === p.id);
  if (e) e.qtd = Math.round((e.qtd + 1) * 1000) / 1000;
  else formItens.push({ pid: p.id, nome: p.nome, preco: p.preco, un: p.un || 'un', qtd: 1 });
  mudarItens();
}

/* ---------- janela: detalhe do fiado ---------- */
function abrirFiado(id) {
  const f = db.fiados.find(x => x.id === id); if (!f) return;
  const r = restante(f), st = status(f);
  const pags = f.pagamentos.slice().sort((a, b) => b.data.localeCompare(a.data));
  const corpo = `
    <div class="resumo-valor">${badge(f)}<div class="big">${brl(Math.max(0, r))}</div><small>${st === 'pago' ? 'Fiado quitado' : 'ainda falta receber'}</small></div>
    <dl class="dados">
      <dt>Valor do fiado</dt><dd class="num">${brl(f.valor)}</dd>
      <dt>Já recebido</dt><dd class="num">${brl(pago(f))}</dd>
      <dt>Data da compra</dt><dd>${fmtData(f.data)}</dd>
      <dt>Vencimento</dt><dd>${f.venc ? fmtData(f.venc) : 'Sem data'}</dd>
      ${f.desc ? `<dt>Anotação</dt><dd>${esc(f.desc)}</dd>` : ''}
      ${f.cobrado && r > 0 ? `<dt>Última cobrança</dt><dd>${fmtData(f.cobrado)}</dd>` : ''}
    </dl>
    ${r > 0 && encargoDevido(f) > 0 ? `<div class="nota-encargo"><span>Com multa e juros de hoje</span><b class="num">${brl(r + encargoDevido(f))}</b></div>` : ''}
    ${f.itens && f.itens.length ? `<h3>Produtos</h3><div class="itens-ro">${f.itens.map(i => `<div><span>${fmtQtd(i.qtd)}x ${esc(i.nome)}</span><b class="num">${brl(subtotal(i))}</b></div>`).join('')}</div>` : ''}
    <div class="sheet-acoes">
      ${r > 0 ? `<button class="btn btn-primary btn-grande" data-action="receber" data-id="${f.id}"><i class="ph ph-hand-coins"></i>Receber pagamento</button>
      <button class="btn btn-zap" data-action="cobrar-fiado" data-id="${f.id}"><i class="ph ph-whatsapp-logo"></i>Cobrar no WhatsApp</button>` : ''}
    </div>
    <h3>Pagamentos recebidos</h3>
    ${pags.length ? pags.map(p => `<div class="pag"><div><b>${brl(recebido(p))}</b><small>${fmtData(p.data)}, ${esc(p.forma || 'Dinheiro')}${p.encargo ? ', com ' + brl(p.encargo) + ' de multa e juros' : ''}</small></div>
        <button class="icon-btn icon-zap" data-action="imprimir-recibo" data-id="${f.id}" data-pag="${p.id}" aria-label="Imprimir recibo deste pagamento ou salvar em PDF"><i class="ph ph-printer"></i></button>
        <button class="icon-btn icon-zap" data-action="recibo" data-id="${f.id}" data-pag="${p.id}" aria-label="Enviar comprovante deste pagamento pelo WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
        <button class="icon-btn" data-action="apagar-pagamento" data-id="${f.id}" data-pag="${p.id}" aria-label="Apagar este pagamento"><i class="ph ph-trash"></i></button></div>`).join('')
      : '<p class="muted">Nenhum pagamento recebido ainda.</p>'}
    <div class="sheet-acoes linha" style="margin-top:18px">
      <button class="btn" data-action="editar-fiado" data-id="${f.id}"><i class="ph ph-pencil-simple"></i>Corrigir</button>
      <button class="btn btn-danger" data-action="apagar-fiado" data-id="${f.id}"><i class="ph ph-trash"></i>Apagar</button>
    </div>`;
  abrir(sheet('Fiado de ' + esc(nomeDe(f)), corpo));
}

function abrirReceber(id) {
  const f = db.fiados.find(x => x.id === id); if (!f) return;
  const r = restante(f), enc = encargoDevido(f), dias = f.venc ? diffDias(f.venc, hoje()) : 0;
  const forma = (v, i) => `<label class="chip"><input type="radio" name="forma" value="${v}" ${v === 'Dinheiro' ? 'checked' : ''}><span><i class="ph ${i}"></i>${v}</span></label>`;
  abrir(sheet('Receber de ' + esc(nomeDe(f)), `<form data-form="receber" novalidate>
    <input type="hidden" name="id" value="${f.id}">
    <p class="muted" style="margin-bottom:16px">Ainda falta receber <b class="num" style="color:var(--ink)">${brl(r)}</b>.</p>
    <div class="campo"><label for="fr-valor">Quanto ele pagou${enc > 0 ? ' do fiado' : ''}?</label>
      <div class="valor-wrap"><span>R$</span><input type="text" id="fr-valor" name="valor" inputmode="decimal" value="${valorInput(r)}" autofocus autocomplete="off"></div>
      <small class="ajuda">Pagou só uma parte? Digite o valor que recebeu. O resto continua anotado.</small><small class="erro" data-erro="valor"></small></div>
    ${enc > 0 ? `<label class="check"><input type="checkbox" name="cobrarEnc" checked><span><b>Cobrar multa e juros: ${brl(enc)}</b><small>Atraso de ${dias} ${dias === 1 ? 'dia' : 'dias'}. Desmarque se quiser perdoar. O cliente paga ${brl(r + enc)} para quitar tudo.</small></span></label>` : ''}
    <div class="campo"><span class="rotulo" id="l-forma">Como pagou?</span><div class="chips" role="radiogroup" aria-labelledby="l-forma">${forma('Dinheiro', 'ph-money')}${forma('Pix', 'ph-qr-code')}${forma('Cartão', 'ph-credit-card')}${forma('Outro', 'ph-dots-three')}</div></div>
    <div class="campo"><label for="fr-data">Data do pagamento</label><input type="date" id="fr-data" name="data" value="${hoje()}"></div>
    <div class="sheet-acoes"><button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-check"></i>Confirmar recebimento</button></div>
  </form>`));
}

/* ---------- janela: cliente ---------- */
function formCliente(c) {
  abrir(sheet(c ? 'Editar cliente' : 'Novo cliente', `<form data-form="cliente" novalidate>
    <input type="hidden" name="id" value="${c ? c.id : ''}">
    <div class="campo"><label for="fc-nome">Nome</label><input type="text" id="fc-nome" name="nome" value="${esc(c ? c.nome : '')}" placeholder="Exemplo: Seu Orlando" autofocus autocomplete="off"><small class="erro" data-erro="nome"></small></div>
    <div class="campo"><label for="fc-tel">WhatsApp (opcional)</label><input type="tel" id="fc-tel" name="tel" inputmode="tel" value="${esc(c ? c.tel : '')}" placeholder="(11) 91234-5678" autocomplete="off"><small class="ajuda">Com o número, dá para cobrar com um toque.</small></div>
    <div class="campo"><label for="fc-obs">Observações (opcional)</label><input type="text" id="fc-obs" name="obs" value="${esc(c ? c.obs : '')}" placeholder="Exemplo: paga sempre no dia 5" autocomplete="off"></div>
    <div class="campo"><label for="fc-lim">Limite de fiado (opcional)</label><div class="valor-wrap"><span>R$</span><input type="text" id="fc-lim" name="limite" inputmode="decimal" placeholder="Sem limite" value="${c && c.limite ? valorInput(c.limite) : ''}" autocomplete="off"></div><small class="ajuda">Até quanto este cliente pode dever. Quando passar, o sistema avisa na hora de anotar.</small></div>
    <div class="sheet-acoes"><button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-check"></i>Salvar cliente</button></div>
  </form>`));
}
function abrirCliente(id) {
  const c = cliente(id); if (!c) return;
  const fs = db.fiados.filter(f => f.clienteId === id).sort((a, b) => (a.venc || '9999').localeCompare(b.venc || '9999'));
  const abertos = fs.filter(f => restante(f) > 0), total = abertos.reduce((s, f) => s + restante(f), 0);
  const atras = abertos.filter(f => status(f) === 'atrasado').reduce((s, f) => s + restante(f), 0);
  const jaPagou = fs.reduce((s, f) => s + pago(f), 0);
  const atrasos = fs.map(atrasoPagamento).filter(x => x !== null);
  const media = atrasos.length ? Math.round(atrasos.reduce((s, x) => s + x, 0) / atrasos.length) : null;
  const lim = c.limite || 0;
  const costume = media === null ? '' : media <= 0 ? 'No prazo' : `${media} ${media === 1 ? 'dia' : 'dias'} depois`;
  abrir(sheet(esc(c.nome), `
    <div class="resumo-valor"><small>Deve hoje</small><div class="big">${brl(total)}</div>${atras ? `<span class="badge st-atrasado"><i class="ph ph-warning-circle"></i>${brl(atras)} atrasado</span>` : total ? '' : '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Em dia</span>'}</div>
    ${(c.tel || c.obs || jaPagou || lim) ? `<dl class="dados">${lim ? `<dt>Limite de fiado</dt><dd class="num">${brl(lim)}${total > lim ? ' (passou)' : ''}</dd>` : ''}${c.tel ? `<dt>WhatsApp</dt><dd>${esc(c.tel)}</dd>` : ''}${c.obs ? `<dt>Observação</dt><dd>${esc(c.obs)}</dd>` : ''}${jaPagou ? `<dt>Já pagou no total</dt><dd class="num">${brl(jaPagou)}</dd>` : ''}${costume ? `<dt>Costuma pagar</dt><dd>${costume}</dd>` : ''}</dl>` : ''}
    <div class="sheet-acoes">
      <button class="btn btn-primary btn-grande" data-action="novo-fiado" data-cliente="${c.id}"><i class="ph ph-plus"></i>Anotar fiado para ${esc(c.nome.split(' ')[0])}</button>
      ${total > 0 ? `<button class="btn btn-zap" data-action="cobrar-cliente" data-id="${c.id}"><i class="ph ph-whatsapp-logo"></i>Cobrar o total no WhatsApp</button>` : ''}
    </div>
    <h3>Fiados deste cliente</h3>
    ${fs.length ? `<div class="lista">${fs.map(f => `<div class="item"><button class="row simples" data-action="abrir-fiado" data-id="${f.id}"><span class="avatar" aria-hidden="true"><i class="ph ph-receipt"></i></span><span class="cell-main"><strong>${descFiado(f) ? esc(descFiado(f)) : 'Compra de ' + fmtCurta(f.data)}</strong><small>${fmtData(f.data)}</small></span><span class="cell-val"><strong>${brl(status(f) === 'pago' ? f.valor : restante(f))}</strong></span>${badge(f)}</button></div>`).join('')}</div>` : '<p class="muted">Este cliente ainda não tem fiados.</p>'}
    <div class="sheet-acoes linha" style="margin-top:18px">
      <button class="btn" data-action="editar-cliente" data-id="${c.id}"><i class="ph ph-pencil-simple"></i>Editar</button>
      <button class="btn btn-danger" data-action="apagar-cliente" data-id="${c.id}"><i class="ph ph-trash"></i>Apagar</button>
    </div>`));
}

/* ---------- WhatsApp ---------- */
function numeroZap(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return d;
}
function enviarZap(c, msg) {
  const num = numeroZap(c && c.tel);
  if (!num) toast('Esse cliente está sem número. Escolha o contato no WhatsApp.');
  window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
}
const MSG_NOVO = 'Olá, {nome}! Passando para avisar que foi anotado um fiado de {valor} na {comercio}.{itens} O pagamento ficou combinado para {vencimento}. Qualquer dúvida é só chamar. Obrigado!';
function msgNovoFiado(f) {
  const c = cliente(f.clienteId);
  const itens = (f.itens || []).length ? ' Itens: ' + f.itens.map(i => fmtQtd(i.qtd) + 'x ' + i.nome).join(', ') + '.' : '';
  return montarMsg(db.config.msgNovo || MSG_NOVO, c ? c.nome.split(' ')[0] : 'tudo bem', brl(f.valor), f.venc ? fmtData(f.venc) : 'data a combinar').replaceAll('{itens}', itens);
}
function abrirAviso(fid) {
  const f = db.fiados.find(x => x.id === fid); if (!f) return;
  const c = cliente(f.clienteId);
  abrir(sheet('Avisar o cliente', `<p class="card-sub">Confira a mensagem. Ao tocar em enviar, o WhatsApp abre já com o texto pronto.</p>
    ${c && c.tel ? `<p><b>${esc(c.nome)}</b> · ${esc(c.tel)}</p>` : `<div class="campo"><label for="av-tel">WhatsApp de ${esc(c ? c.nome : 'cliente')}</label><input type="tel" id="av-tel" inputmode="tel" placeholder="(11) 91234-5678" autocomplete="off"><small class="ajuda">Esse cliente está sem número. Digite para enviar (fica guardado no cadastro).</small></div>`}
    <div class="campo"><label for="av-msg">Mensagem</label><textarea id="av-msg" rows="6">${esc(msgNovoFiado(f))}</textarea></div>
    <div class="sheet-acoes"><button class="btn btn-zap btn-grande" data-action="enviar-aviso" data-id="${f.id}"><i class="ph ph-whatsapp-logo"></i>Enviar no WhatsApp</button><button class="btn" data-action="fechar">Agora não</button></div>`));
}
function abrirZap(c, valor, venc, enc) {
  const v = venc ? fmtData(venc) : 'data a combinar';
  let msg = montarMsg(db.config.msg || MSG_PADRAO, c ? c.nome.split(' ')[0] : 'tudo bem', brl(valor), v);
  if (enc > 0) msg += ` Com multa e juros por atraso, o valor de hoje é ${brl(valor + enc)}.`;
  enviarZap(c, msg);
}
function abrirRecibo(fid, pid) {
  const f = db.fiados.find(x => x.id === fid), p = f && f.pagamentos.find(x => x.id === pid); if (!p) return;
  const c = cliente(f.clienteId), r = restante(f);
  const msg = `Olá, ${c ? c.nome.split(' ')[0] : 'tudo bem'}! Recebemos o seu pagamento de ${brl(recebido(p))} no dia ${fmtData(p.data)} (${p.forma || 'Dinheiro'}). ` +
    (r > 0 ? `Ainda falta ${brl(r)} do seu fiado.` : 'Seu fiado está quitado. Muito obrigado!') + ` ${db.config.comercio || ''}`.trimEnd();
  enviarZap(c, msg);
}

/* ---------- arquivos: cópia de segurança e planilha ---------- */
function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function baixarBackup() {
  const dados = { app: 'caderninho-fiado', versao: 1, exportadoEm: new Date().toISOString(), ...db };
  baixar(`caderninho-fiado-${hoje()}.json`, JSON.stringify(dados, null, 1), 'application/json');
  db.config.ultimoBackup = hoje(); salvar();
  toast('Cópia baixada. Guarde o arquivo em um lugar seguro.');
  if (ui.view === 'ajustes' || ui.view === 'inicio') render();
}
function baixarCsv() {
  const l = filtrados();
  const cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const linhas = [['Cliente', 'O que levou', 'Data da compra', 'Vencimento', 'Valor', 'Recebido', 'Falta receber', 'Situação']];
  const nomeSt = { pago: 'Pago', atrasado: 'Atrasado', aberto: 'Em aberto' };
  for (const f of l) linhas.push([nomeDe(f), descFiado(f), fmtData(f.data), fmtData(f.venc), valorInput(f.valor), valorInput(pago(f)), valorInput(Math.max(0, restante(f))), nomeSt[status(f)]]);
  baixar(`fiados-${hoje()}.csv`, '\ufeff' + linhas.map(r => r.map(cel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast(`Planilha com ${l.length} ${l.length === 1 ? 'fiado' : 'fiados'} baixada.`);
}
async function restaurar(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.clientes) || !Array.isArray(d.fiados)) throw new Error('formato');
    const ok = await confirmar({ titulo: 'Restaurar esta cópia?', texto: `A cópia tem ${d.clientes.length} clientes e ${d.fiados.length} fiados. Tudo que está aqui agora será substituído.`, ok: 'Sim, restaurar', perigo: false });
    if (!ok) return;
    db = normalizar(d); salvar(); aplicarTema(); render(); toast('Cópia restaurada com sucesso.');
  } catch (e) {
    toast('Esse arquivo não parece ser uma cópia do Caderninho. Escolha o arquivo .json que você baixou antes.', 'erro');
  }
}

/* ---------- dados de exemplo ---------- */
function carregarExemplo() {
  /* dados de exemplo com bastante movimento: 36 clientes, 36 produtos e serviços e uns 100 fiados */
  let seed = 20261117;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const h = hoje(), d = n => addDias(h, n);
  const nomes = ['Neuza Albuquerque', 'Orlando Ferreira', 'Marcelo Tavares', 'Vanessa Prado', 'Josias Meireles', 'Aparecida Lemos', 'Rogério Bastos', 'Dona Zilda', 'Seu Antônio Carvalho', 'Luciana Moraes',
    'Edvaldo Souza', 'Maria das Dores', 'Benedito Nogueira', 'Cleusa Ribeiro', 'Adriano Campos', 'Fátima Gouveia', 'José Aparecido', 'Tereza Cristina', 'Gilberto Matos', 'Rosângela Dias',
    'Valdir Pereira', 'Sandra Mara', 'Wilson Teixeira', 'Eliane Barros', 'Cícero Almeida', 'Lourdes Fonseca', 'Paulo Roberto', 'Ivone Santana', 'Nelson Batista', 'Marlene Costa',
    'Joaquim Vieira', 'Creuza Andrade', 'Altair Rocha', 'Sônia Machado', 'Reinaldo Duarte', 'Dirce Cardoso'];
  const obs = ['Paga sempre perto do dia 5', 'Vizinho da padaria', 'Trabalha na obra ao lado', 'Só paga com Pix', 'Recebe no dia 10', 'Cliente antigo, de confiança', '', '', '', ''];
  const cl = nomes.map((nome, i) => ({ id: uid(), nome, tel: i % 7 === 3 ? '' : '(11) 9' + String(1000 + i * 37).slice(-4) + '-' + String(1000 + i * 91).slice(-4), obs: pick(obs) }));
  cl[4].limite = 20000; cl[0].limite = 50000; cl[9].limite = 30000; cl[13].limite = 15000;
  const cat = [['Arroz 5kg', 24.9, 'pct'], ['Feijão carioca 1kg', 8.9, 'pct'], ['Óleo de soja', 7.5, 'un'], ['Açúcar 1kg', 5.2, 'pct'], ['Café 500g', 16.9, 'pct'], ['Leite integral', 5.4, 'l'],
    ['Macarrão', 4.5, 'pct'], ['Sabão em pó', 12, 'un'], ['Pão francês', 14.9, 'kg'], ['Bolo (fatia)', 7, 'un'], ['Salgado', 6.5, 'un'], ['Refrigerante 2L', 9.5, 'un'],
    ['Cerveja lata', 4.5, 'un'], ['Ovos', 13, 'dz'], ['Carvão 3kg', 18, 'pct'], ['Carne moída', 36, 'kg'], ['Frango inteiro', 14, 'kg'], ['Linguiça', 24, 'kg'],
    ['Ração para cães 15kg', 120, 'saco'], ['Ração para gatos 10kg', 95, 'saco'], ['Milho', 85, 'saco'], ['Sal mineral', 140, 'saco'], ['Vermífugo', 28, 'un'], ['Marmita', 22, 'un'],
    ['Prato feito', 25, 'un'], ['Cimento 50kg', 38, 'saco'], ['Tinta 18L', 280, 'un'], ['Fio elétrico', 3.5, 'm'], ['Corte de cabelo', 40, 'serv'], ['Barba', 25, 'serv'],
    ['Troca de óleo', 120, 'serv'], ['Mão de obra', 80, 'hora'], ['Gás de cozinha', 110, 'un'], ['Analgésico', 9, 'cx'], ['Fralda (pacote)', 38, 'pct'], ['Detergente', 2.8, 'un']];
  const pr = cat.map(([nome, preco, un]) => ({ id: uid(), nome, preco: Math.round(preco * 100), un }));
  const fiados = [];
  const novoFiado = (ci, dc, prazo, cenario) => {
    const n = 1 + Math.floor(rnd() * 4), usados = new Set(), itens = [];
    while (itens.length < n) {
      const p = pick(pr); if (usados.has(p.id)) continue; usados.add(p.id);
      const frac = p.un === 'kg' || p.un === 'm' ? Math.round((0.5 + rnd() * 2.5) * 2) / 2 : p.un === 'serv' || p.un === 'hora' || p.preco > 8000 ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 5);
      itens.push({ pid: p.id, nome: p.nome, preco: p.preco, un: p.un, qtd: frac });
    }
    const valor = itens.reduce((t, x) => t + subtotal(x), 0), venc = prazo === null ? '' : d(dc + prazo);
    const pags = [], id = () => uid();
    const quando = (min) => { const x = Math.max(min, Math.min(0, min + Math.floor(rnd() * 8) - 2)); return d(x); };
    if (cenario === 'quitado') { const atraso = rnd() < 0.3 ? Math.floor(rnd() * 12) : -Math.floor(rnd() * 4); const dp = prazo === null ? dc + 5 : Math.min(0, dc + prazo + atraso); const enc = atraso > 5 && rnd() < 0.5 ? Math.round(valor * 0.03) : 0;
      pags.push({ id: id(), valor, data: d(dp), forma: pick(['Dinheiro', 'Pix', 'Pix', 'Cartão']), ...(enc ? { encargo: enc } : {}) }); }
    else if (cenario === 'parcial') { const v1 = Math.round(valor * (0.3 + rnd() * 0.4) / 100) * 100 || 100; pags.push({ id: id(), valor: Math.min(v1, valor - 100), data: quando(dc + 2), forma: pick(['Dinheiro', 'Pix']) }); }
    const f = { id: uid(), clienteId: cl[ci].id, desc: rnd() < 0.2 ? pick(['Levou na quinta', 'Vai passar para pagar', 'Combinou de pagar no dia', 'Pediu para anotar']) : '', itens, valor, data: d(dc), venc, pagamentos: pags };
    if (cenario !== 'quitado' && venc && venc <= h && rnd() < 0.4) f.cobrado = d(-Math.floor(rnd() * 4));
    fiados.push(f);
  };
  cl.forEach((c, ci) => {
    const qtd = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < qtd; k++) {
      const dc = -Math.floor(rnd() * 150), prazo = rnd() < 0.08 ? null : pick([7, 15, 15, 30]);
      const fim = prazo === null ? dc + 20 : dc + prazo;
      let cen;
      if (fim < -25) cen = rnd() < 0.8 ? 'quitado' : rnd() < 0.5 ? 'parcial' : 'aberto';
      else if (fim < 0) cen = rnd() < 0.45 ? 'quitado' : rnd() < 0.5 ? 'parcial' : 'aberto';
      else cen = rnd() < 0.15 ? 'parcial' : 'aberto';
      novoFiado(ci, dc, prazo, cen);
    }
  });
  /* alguns que vencem hoje, amanhã e esta semana, para o painel ficar vivo */
  [[2, -15, 15], [5, -14, 14], [11, -13, 15], [17, -2, 7], [21, -6, 7], [26, -1, 7], [30, -10, 15]].forEach(([ci, dc, pz]) => novoFiado(ci, dc, pz, 'aberto'));
  db.clientes = cl; db.produtos = pr; db.fiados = fiados; db.config.demo = true; db.config.iniciado = true;
  if (!db.config.comercio) db.config.comercio = 'Mercearia do Bairro';
  salvar(); fechar(); render(); toast('Dados de exemplo carregados.');
}

/* ---------- tema ---------- */
function aplicarTema() {
  const t = temaAtual();
  const escuro = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  const m = $('meta[name="theme-color"]'); if (m) m.content = escuro ? '#111318' : '#f5f6f8';
  document.querySelectorAll('[data-tema-btn]').forEach(b => {
    const ic = b.querySelector('i'), tx = b.querySelector('span');
    if (ic) ic.className = 'ph ' + (escuro ? 'ph-sun' : 'ph-moon');
    if (tx) tx.textContent = escuro ? 'Modo claro' : 'Modo escuro';
    b.setAttribute('aria-label', escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);

/* ---------- ajuda e boas-vindas ---------- */
function abrirAjuda() {
  abrir(sheet('Como usar o Caderninho', `<ol class="passos">
    <li><div><strong>Cadastre o que você vende (se quiser)</strong><span>Em <b>Produtos e serviços</b>, anote o nome e o preço. Dá para começar com sugestões do seu ramo. Assim o total do fiado é somado sozinho.</span></div></li>
    <li><div><strong>Anote o fiado na hora</strong><span>Toque em <b>Anotar fiado</b>, siga os 3 passos: quem pegou fiado (ou cadastre um cliente novo ali mesmo), o que levou e quanto e quando vai pagar.</span></div></li>
    <li><div><strong>Acompanhe pelo Início</strong><span>A tela inicial mostra quanto falta receber, o que está atrasado e quem vence nesta semana.</span></div></li>
    <li><div><strong>Quando ele pagar, toque em Receber</strong><span>Abra o fiado e confirme o valor. Se pagou só uma parte, o resto continua anotado. Em <b>Quem já pagou</b> você vê tudo que já recebeu.</span></div></li>
    <li><div><strong>Cobre sem constrangimento</strong><span>No Início aparece quem você precisa cobrar hoje. O botão do WhatsApp abre a conversa com uma mensagem educada já escrita. Você pode mudar o texto nos Ajustes.</span></div></li>
    <li><div><strong>Controle o limite e os atrasos</strong><span>No cadastro do cliente dá para definir um limite de fiado. Nos Ajustes você pode ligar multa e juros por atraso. Em <b>Relatórios</b> você vê o resumo do mês, quem está atrasado e o que mais vende.</span></div></li>
    <li><div><strong>Faça a cópia de segurança</strong><span>${SYNC ? 'Seus dados ficam guardados no servidor, com cópia automática. Em Ajustes, você também pode baixar uma cópia sua.' : 'Seus dados ficam só neste aparelho. Em Ajustes, baixe uma cópia toda semana e guarde em um lugar seguro.'}</span></div></li>
  </ol><div class="sheet-acoes"><button class="btn btn-primary btn-grande" data-action="fechar">Entendi</button></div>`));
}
function abrirBoasVindas() {
  abrir(`<div class="sheet"><header class="sheet-h"><h2>Bem-vindo ao Caderninho</h2></header><div class="sheet-b">
    <p class="muted" style="margin-bottom:16px">Aqui você anota quem pegou fiado, quanto e quando vai pagar. ${SYNC ? 'Seus dados ficam guardados com segurança no servidor e podem ser vistos por quem tiver acesso ao seu comércio.' : 'Seus dados ficam guardados só neste aparelho, nada vai para a internet.'}</p>
    <form data-form="boasvindas" novalidate>
      <div class="campo"><label for="bv-nome">Como se chama o seu comércio?</label><input type="text" id="bv-nome" name="comercio" placeholder="Exemplo: Mercearia do Zé" autofocus autocomplete="off"><small class="ajuda">Vai aparecer no topo e nas mensagens de cobrança. Dá para mudar depois.</small></div>
      <div class="campo"><label for="bv-ramo">Qual é o seu ramo? (opcional)</label><select id="bv-ramo" name="ramo"><option value="">Escolher o ramo</option>${Object.entries(RAMOS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select><small class="ajuda">Com o ramo, o sistema sugere os produtos ou serviços mais comuns para você cadastrar.</small></div>
      <div class="sheet-acoes"><button class="btn btn-primary btn-grande" type="submit">Começar</button>
      <button class="btn" type="button" data-action="exemplo">Ver com dados de exemplo</button></div>
    </form></div></div>`);
}

/* ---------- eventos ---------- */
const acoes = {
  'tema-alternar'() { setTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); if (ui.view === 'ajustes') render(); },
  ir: el => { fechar(); ir(el.dataset.view); },
  fechar: () => fechar(),
  ajuda: () => abrirAjuda(),
  'novo-fiado': el => abrirFormFiado(null, el.dataset.cliente),
  'abrir-fiado': el => abrirFiado(el.dataset.id),
  'editar-fiado': el => abrirFormFiado(el.dataset.id),
  receber: el => abrirReceber(el.dataset.id),
  'cobrar-fiado': el => {
    const f = db.fiados.find(x => x.id === el.dataset.id); if (!f) return;
    abrirZap(cliente(f.clienteId), restante(f), f.venc, encargoDevido(f));
    f.cobrado = hoje(); salvar(); render(); if (dlg.open) abrirFiado(f.id);
  },
  'cobrar-cliente': el => {
    const c = cliente(el.dataset.id), ab = db.fiados.filter(f => f.clienteId === el.dataset.id && restante(f) > 0);
    const venc = ab.map(f => f.venc).filter(Boolean).sort()[0] || '';
    abrirZap(c, ab.reduce((s, f) => s + restante(f), 0), venc, ab.reduce((s, f) => s + encargoDevido(f), 0));
    ab.forEach(f => { f.cobrado = hoje(); }); salvar(); render();
  },
  ordenar: el => {
    const t = el.dataset.t, c = el.dataset.c, o = ui.sort[t];
    ui.sort[t] = o && o.c === c ? { c, d: -o.d } : { c, d: 1 };
    render();
  },
  'enviar-aviso': el => {
    const f = db.fiados.find(x => x.id === el.dataset.id); if (!f) return;
    const c = cliente(f.clienteId), t = $('#av-tel'), msg = ($('#av-msg') || {}).value || msgNovoFiado(f);
    if (t) { if (numeroZap(t.value).length < 12) return toast('Digite o número com DDD. Exemplo: (11) 91234-5678'); if (c) { c.tel = t.value.trim(); salvar(); } }
    enviarZap(c, msg); fechar();
  },
  cobrancas: () => abrirCobrancas(),
  sugestoes: () => abrirSugestoes(db.config.ramo),
  'cobrar-dia': el => {
    const o = paraCobrar().find(x => x.id === el.dataset.id); if (!o) return;
    const venc = o.fiados.map(f => f.venc).sort()[0];
    abrirZap(cliente(o.id), o.principal, venc, o.enc);
    o.fiados.forEach(f => { f.cobrado = hoje(); }); salvar(); render(); abrirCobrancas();
  },
  imprimir: () => window.print(),
  'imprimir-recibo': el => imprimirRecibo(el.dataset.id, el.dataset.pag),
  'rel-aba': el => { ui.rel.aba = el.dataset.v; ui.rel.q = ''; render(); },
  'rel-periodo': el => { ui.rel.periodo = el.dataset.v; render(); },
  'csv-rel': () => baixarCsvRel(),
  'prod-ordem': el => { ui.po = el.dataset.v; render(); },
  'apagar-fiado': async el => {
    const f = db.fiados.find(x => x.id === el.dataset.id); if (!f) return;
    if (!await confirmar({ titulo: 'Apagar este fiado?', texto: `O fiado de ${nomeDe(f)} no valor de ${brl(f.valor)} e os pagamentos dele serão apagados. Isso não pode ser desfeito.` })) return;
    db.fiados = db.fiados.filter(x => x.id !== f.id); salvar(); fechar(); render(); toast('Fiado apagado.');
  },
  'apagar-pagamento': async el => {
    const f = db.fiados.find(x => x.id === el.dataset.id); if (!f) return;
    if (!await confirmar({ titulo: 'Apagar este pagamento?', texto: 'O valor volta a aparecer como "falta receber" neste fiado.' })) return;
    f.pagamentos = f.pagamentos.filter(p => p.id !== el.dataset.pag); salvar(); render(); abrirFiado(f.id); toast('Pagamento apagado.');
  },
  'cliente-novo-no-fiado': () => {
    const form = $('form[data-form="fiado"]', dlg), sel = form.elements.cliente; if (!sel) return;
    sel.value = '__novo'; Controles.sincronizar(sel); $('#pick-cli', form).hidden = true; $('#novo-cli', form).hidden = false; atualizarLimite(form); $('#ff-nn', form).focus();
  },
  'cliente-da-lista': () => {
    const form = $('form[data-form="fiado"]', dlg), sel = form.elements.cliente; if (!sel) return;
    sel.value = ''; Controles.sincronizar(sel); $('#pick-cli', form).hidden = false; $('#novo-cli', form).hidden = true; atualizarLimite(form);
    if (sel._ctl) sel._ctl.focus();
  },
  'prod-novo': () => { const form = $('form[data-form="fiado"]', dlg); $('#novo-prod', form).hidden = false; $('#ff-pn', form).focus(); },
  'prod-novo-cancelar': () => { const form = $('form[data-form="fiado"]', dlg); $('#novo-prod', form).hidden = true; mostrarErros(form, {}); },
  'add-item': () => {
    const form = $('form[data-form="fiado"]', dlg), v = form.elements.prod.value;
    if (!v) return mostrarErros(form, { prod: 'Escolha um produto na lista e toque em Adicionar.' });
    if (v === '__novo') return mostrarErros(form, { pNome: 'Preencha o produto novo e toque em "Cadastrar e adicionar".' });
    const p = produto(v); if (p) { adicionarItem(p); form.elements.prod.value = ''; Controles.sincronizar(form.elements.prod); mostrarErros(form, {}); }
  },
  'add-prod-novo': () => {
    const form = $('form[data-form="fiado"]', dlg), el = form.elements, e = {};
    const nome = el.pNome.value.trim(), preco = parseValor(el.pPreco.value);
    if (!nome) e.pNome = 'Escreva o nome do produto.';
    if (!(preco > 0)) e.pPreco = 'Digite o preço. Exemplo: 8,90';
    if (Object.keys(e).length) return mostrarErros(form, e);
    const p = { id: uid(), nome, preco, un: el.pUn.value };
    db.produtos.push(p); salvar();
    const op = document.createElement('option'); op.value = p.id; op.textContent = `${p.nome} (${brl(p.preco)}/${UN_CURTA[p.un] || 'un'})`;
    el.prod.insertBefore(op, el.prod.querySelector('option[value="__novo"]'));
    el.prod.value = ''; Controles.sincronizar(el.prod); el.pNome.value = ''; el.pPreco.value = ''; $('#novo-prod', form).hidden = true; mostrarErros(form, {});
    adicionarItem(p); toast('Produto cadastrado e adicionado.');
  },
  'qtd-mais': el => { const i = formItens[+el.dataset.i]; if (i) { i.qtd = Math.round((i.qtd + 1) * 1000) / 1000; mudarItens(); } },
  'qtd-menos': el => {
    const n = +el.dataset.i, i = formItens[n]; if (!i) return;
    if (i.qtd <= 1) formItens.splice(n, 1); else i.qtd = Math.round((i.qtd - 1) * 1000) / 1000;
    mudarItens();
  },
  'remover-item': el => { formItens.splice(+el.dataset.i, 1); mudarItens(); },
  'novo-produto': () => formProduto(null),
  'editar-produto': el => formProduto(produto(el.dataset.id)),
  'apagar-produto': async el => {
    const p = produto(el.dataset.id); if (!p) return;
    if (!await confirmar({ titulo: `Apagar ${p.nome}?`, texto: 'O produto sai da sua lista. Os fiados que já foram anotados com ele não mudam.' })) return;
    db.produtos = db.produtos.filter(x => x.id !== p.id); salvar(); fechar(); render(); toast('Produto apagado.');
  },
  'pg-aba': el => { ui.pg.aba = el.dataset.v; render(); },
  'pg-periodo': el => { ui.pg.periodo = el.dataset.v; render(); },
  'csv-pagos': () => baixarCsvPagos(),
  recibo: el => abrirRecibo(el.dataset.id, el.dataset.pag),
  'novo-cliente': () => formCliente(null),
  'abrir-cliente': el => abrirCliente(el.dataset.id),
  'editar-cliente': el => formCliente(cliente(el.dataset.id)),
  'apagar-cliente': async el => {
    const c = cliente(el.dataset.id); if (!c) return;
    const n = db.fiados.filter(f => f.clienteId === c.id).length;
    if (!await confirmar({ titulo: `Apagar ${c.nome}?`, texto: n ? `Os ${n} fiados deste cliente também serão apagados. Isso não pode ser desfeito.` : 'O cadastro será apagado. Isso não pode ser desfeito.' })) return;
    db.clientes = db.clientes.filter(x => x.id !== c.id); db.fiados = db.fiados.filter(f => f.clienteId !== c.id);
    salvar(); fechar(); render(); toast('Cliente apagado.');
  },
  filtrar: el => {
    ui.f = { busca: '', status: el.dataset.status || 'abertos', cliente: '', de: '', ate: '', ordem: el.dataset.ordem || 'venc' };
    if (ui.view === 'fiados') { render(); } else ir('fiados');
  },
  'limpar-filtros': () => { ui.f = { busca: '', status: 'todos', cliente: '', de: '', ate: '', ordem: 'venc' }; render(); },
  csv: () => baixarCsv(),
  'baixar-backup': () => baixarBackup(),
  restaurar: () => { $('#arquivo').value = ''; $('#arquivo').click(); },
  exemplo: async () => {
    if (db.clientes.length || db.fiados.length) {
      if (!await confirmar({ titulo: 'Trocar pelos dados de exemplo?', texto: 'Tudo que você anotou até agora será substituído pelos exemplos. Baixe uma cópia de segurança antes se quiser guardar.', ok: 'Sim, trocar' })) return;
    }
    carregarExemplo();
  },
  'apagar-exemplo': async () => {
    if (!await confirmar({ titulo: 'Apagar os exemplos?', texto: 'Os clientes e fiados de exemplo serão removidos e o caderninho fica vazio para você começar.', ok: 'Sim, apagar exemplos' })) return;
    db.clientes = []; db.produtos = []; db.fiados = []; db.config.demo = false; salvar(); render(); toast('Pronto, o caderninho está vazio.');
  },
  'apagar-tudo': async () => {
    if (!await confirmar({ titulo: 'Apagar todos os dados?', texto: SYNC ? 'Clientes, fiados e pagamentos serão apagados para todos os usuários do comércio. Só dá para recuperar se você tiver uma cópia de segurança.' : 'Clientes, fiados e pagamentos serão apagados deste aparelho. Só dá para recuperar se você tiver uma cópia de segurança.', ok: 'Sim, apagar tudo' })) return;
    const nome = db.config.comercio; db = vazio(); db.config.comercio = nome; db.config.iniciado = true;
    salvar(); render(); toast('Todos os dados foram apagados.');
  },
  'msg-padrao': () => { $('#a-msg').value = MSG_PADRAO; atualizarPrevia(); },
  instalar: async () => { if (!pedidoInstalar) return; pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; $('#bt-instalar').hidden = true; }
};
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-action]')) e.target.click(); });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const fn = acoes[el.dataset.action]; if (fn) fn(el, e);
});

const forms = {
  boasvindas: f => {
    db.config.comercio = f.elements.comercio.value.trim(); db.config.iniciado = true; db.config.ramo = f.elements.ramo.value; salvar(); fechar(); render();
    if (db.config.ramo) setTimeout(() => abrirSugestoes(db.config.ramo), 50); else toast('Tudo pronto. Toque em "Anotar fiado" para começar.');
  },
  loja: f => {
    db.config.comercio = f.elements.comercio.value.trim();
    db.config.msg = f.elements.msg.value.trim() || MSG_PADRAO;
    salvar(); atualizarNav(); toast('Ajustes salvos.');
  },
  cliente: f => {
    const nome = f.elements.nome.value.trim();
    if (!nome) return mostrarErros(f, { nome: 'Escreva o nome do cliente.' });
    const id = f.elements.id.value;
    const lim = parseValor(f.elements.limite.value);
    const dados = { nome, tel: f.elements.tel.value.trim(), obs: f.elements.obs.value.trim(), limite: lim > 0 ? lim : 0 };
    if (id) Object.assign(cliente(id), dados); else db.clientes.push({ id: uid(), ...dados });
    salvar(); fechar(); render(); toast(id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  },
  produto: f => {
    const el = f.elements, e = {}, id = el.id.value, nome = el.nome.value.trim(), preco = parseValor(el.preco.value);
    if (!nome) e.nome = 'Escreva o nome do produto.';
    else if (db.produtos.some(p => p.id !== id && norm(p.nome) === norm(nome))) e.nome = 'Você já tem um produto com esse nome.';
    if (!(preco > 0)) e.preco = 'Digite o preço. Exemplo: 8,90';
    if (Object.keys(e).length) return mostrarErros(f, e);
    const dados = { nome, preco, un: el.un.value };
    if (id) Object.assign(produto(id), dados); else db.produtos.push({ id: uid(), ...dados });
    salvar(); fechar(); render(); toast(id ? 'Produto atualizado.' : 'Produto cadastrado.');
  },
  sugestoes: f => {
    const r = RAMOS[f.elements.ramo.value]; if (!r) return mostrarErros(f, { ramo: 'Escolha o seu ramo.' });
    const tem = new Set(db.produtos.map(p => norm(p.nome))); let n = 0;
    $$('input[name="s"]:checked', f).forEach(c => { const [nome, preco, un] = r[1][+c.value]; if (!tem.has(norm(nome))) { db.produtos.push({ id: uid(), nome, preco: Math.round(preco * 100), un }); n++; } });
    db.config.ramo = f.elements.ramo.value; salvar(); fechar(); render(); toast(n ? `${n} ${n === 1 ? 'item cadastrado' : 'itens cadastrados'}. Ajuste os preços quando quiser.` : 'Nada novo para cadastrar.');
  },
  encargos: f => {
    db.config.encargos = f.elements.ativo.checked; db.config.multa = numPct(f.elements.multa.value); db.config.juros = numPct(f.elements.juros.value);
    salvar(); toast(db.config.encargos ? 'Multa e juros ligados.' : 'Multa e juros desligados.'); atualizarEncPrevia();
  },
  fiado: async f => {
    const e = {}, el = f.elements, id = el.id.value, existente = id ? db.fiados.find(x => x.id === id) : null;
    let cid = el.cliente.value, nomeNovo = '';
    if (cid === '__novo') { nomeNovo = el.novoNome.value.trim(); if (!nomeNovo) e.novoNome = 'Escreva o nome de quem pegou fiado.'; }
    else if (!cid) e.cliente = 'Escolha quem pegou fiado.';
    const valor = parseValor(el.valor.value);
    if (!(valor > 0)) e.valor = 'Digite o valor. Exemplo: 25,90';
    else if (existente && valor < pago(existente)) e.valor = `Esse valor é menor do que já foi recebido (${brl(pago(existente))}).`;
    const data = el.data.value || hoje(), prazo = el.prazo.value;
    let venc = '';
    if (prazo === 'custom') { venc = el.venc.value; if (!venc) e.venc = 'Escolha o dia do vencimento.'; }
    else if (prazo !== 'none') venc = addDias(data, +prazo);
    if (venc && venc < data && !e.venc) e.venc = 'O vencimento não pode ser antes da data da compra.';
    if (Object.keys(e).length) return mostrarErros(f, e);
    const cl = cliente(cid);
    if (cl && cl.limite && abertoDe(cid, id) + valor > cl.limite) {
      if (!await confirmar({ titulo: 'Passou do limite', texto: `${cl.nome} passa a dever ${brl(abertoDe(cid, id) + valor)}, e o limite dele é ${brl(cl.limite)}. Quer anotar mesmo assim?`, ok: 'Sim, anotar mesmo assim', perigo: false })) return;
    }
    if (cid === '__novo') { cid = uid(); db.clientes.push({ id: cid, nome: nomeNovo, tel: el.novoTel.value.trim(), obs: '' }); }
    const dados = { clienteId: cid, desc: el.desc.value.trim(), itens: formItens.filter(i => i.qtd > 0).map(i => ({ ...i })), valor, data, venc };
    let novoId = '';
    if (existente) Object.assign(existente, dados); else { novoId = uid(); db.fiados.push({ id: novoId, ...dados, pagamentos: [] }); }
    if (prazo !== 'custom' && prazo !== 'none') db.config.prazo = prazo;
    const avisar = !existente && el.avisar && el.avisar.checked;
    if (!existente && el.avisar) db.config.avisarZap = el.avisar.checked;
    salvar(); fechar(); render();
    toast(existente ? 'Fiado corrigido.' : 'Fiado anotado.');
    if (avisar) setTimeout(() => abrirAviso(novoId), 80);
  },
  receber: f => {
    const fi = db.fiados.find(x => x.id === f.elements.id.value); if (!fi) return;
    const v = parseValor(f.elements.valor.value), r = restante(fi);
    if (!(v > 0)) return mostrarErros(f, { valor: 'Digite o valor que foi pago. Exemplo: 20,00' });
    if (v > r) return mostrarErros(f, { valor: `Esse valor é maior do que falta receber (${brl(r)}).` });
    const dataPag = f.elements.data.value || hoje(), chk = f.elements.cobrarEnc;
    const pg = { id: uid(), valor: v, data: dataPag, forma: f.elements.forma.value };
    if (chk && chk.checked) { const en = encargoDevido(fi, dataPag); if (en > 0) pg.encargo = en; }
    fi.pagamentos.push(pg);
    salvar(); render(); abrirFiado(fi.id);
    toast(restante(fi) <= 0 ? 'Fiado quitado. Parabéns!' : 'Pagamento registrado.');
  }
};
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault(); const fn = forms[f.dataset.form]; if (fn) fn(f);
});

document.addEventListener('input', e => {
  const t = e.target, b = t.dataset && t.dataset.bind;
  if (t.matches('input[type="tel"]')) { t.value = mascaraTel(t.value); }
  if (b === 'busca') { ui.f.busca = t.value; renderLista(); }
  else if (b === 'cb') { ui.cb = t.value; renderListaClientes(); }
  else if (b === 'pb') { ui.pb = t.value; renderListaProdutos(); }
  else if (b === 'msg') atualizarPrevia();
  else if (b === 'qtd') {
    const i = formItens[+t.dataset.i];
    if (i) {
      const q = parseFloat(String(t.value).replace(',', '.'));
      i.qtd = isFinite(q) && q > 0 ? q : 0;
      const st = $('#it-t-' + t.dataset.i); if (st) st.textContent = brl(subtotal(i));
      const tt2 = $('#itens-total'); if (tt2) tt2.textContent = brl(totalItens());
      sincronizarValor();
    }
  }
  const form = t.closest('form[data-form="fiado"]');
  if (form && (t.name === 'venc' || t.name === 'data')) previaVenc(form);
  if (form && t.name === 'valor') atualizarLimite(form);
  if (b === 'enc') atualizarEncPrevia();
});
document.addEventListener('change', e => {
  const t = e.target, b = t.dataset && t.dataset.bind;
  if (b === 'cliente' || b === 'ordem' || b === 'de' || b === 'ate') { ui.f[b] = t.value; if (b === 'ordem') ui.sort.fiados = null; renderLista(); }
  else if (b === 'tema') { setTema(t.value); }
  else if (b === 'pg-cliente') { ui.pg.cliente = t.value; renderPagos(); }
  else if (b === 'pg-forma') { ui.pg.forma = t.value; renderPagos(); }
  else if (b === 'ramo-sug') { $('#sug-lista').innerHTML = listaSug(t.value); }
  else if (b === 'rel-q') { ui.rel.q = t.value; renderRelTab(); }
  else if (b === 'rel-de' || b === 'rel-ate') { ui.rel[b === 'rel-de' ? 'de' : 'ate'] = t.value; renderRelatorios(); }
  const form = t.closest('form[data-form="fiado"]');
  if (form) {
    if (t.name === 'prod') {
      $('#novo-prod', form).hidden = t.value !== '__novo';
      const p = t.value && t.value !== '__novo' ? produto(t.value) : null;
      if (p) { adicionarItem(p); t.value = ''; Controles.sincronizar(t); }
    }
    if (t.name === 'prazo') previaVenc(form);
    if (t.name === 'cliente') { const n = $('#novo-cli', form); n.hidden = t.value !== '__novo'; atualizarLimite(form); if (!n.hidden) $('input', n).focus(); }
  }
});
document.addEventListener('blur', e => {
  const t = e.target;
  if (t.matches && t.matches('input[name="valor"],input[name="pPreco"],input[name="preco"]')) { const c = parseValor(t.value); if (c > 0) t.value = valorInput(c); }
}, true);
$('#arquivo').addEventListener('change', e => { if (e.target.files[0]) restaurar(e.target.files[0]); });

let pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; const b = $('#bt-instalar'); if (b) b.hidden = false; });


/* ---------- sincronização com o servidor ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let srvVer = 0, srvDb = null, enviando = false, pendente = false, tEnvio = null, avisouOff = false;
try { const s = JSON.parse(localStorage.getItem(CACHE_SRV) || 'null'); if (s && s.db) { srvVer = s.ver; srvDb = s.db; } } catch (e) { /* ignora */ }
function guardarSrv() { try { localStorage.setItem(CACHE_SRV, JSON.stringify({ ver: srvVer, db: srvDb })); } catch (e) { /* ignora */ } }
function statusSync(s) {
  document.body.dataset.sync = s;
  const t = { ok: 'Salvo', salvando: 'Salvando…', erro: 'Sem conexão: salvo neste aparelho' }[s] || '';
  document.querySelectorAll('[data-sync-chip]').forEach(el => { el.textContent = t; el.title = t; });
}
function api(metodo, corpo) {
  return fetch('api.php', { method: metodo, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-CF': window.CF_USER.csrf }, body: corpo ? JSON.stringify(corpo) : undefined });
}
/* junta o que mudou aqui (local) com o que mudou no servidor, tendo a última versão conhecida (base) como referência */
function fundirReg(b, l, s) {
  const r = { ...s };
  Object.keys(l).forEach(k => {
    if (k === 'pagamentos') r.pagamentos = fundirLista(b.pagamentos || [], l.pagamentos || [], s.pagamentos || []);
    else if (!igual(l[k], b[k])) r[k] = l[k];
  });
  Object.keys(b).forEach(k => { if (!(k in l)) delete r[k]; });
  return r;
}
function fundirLista(base, local, srv) {
  const bM = new Map(base.map(x => [x.id, x])), lM = new Map(local.map(x => [x.id, x]));
  const out = srv.filter(x => !(bM.has(x.id) && !lM.has(x.id)));   // apagados aqui, saem
  local.forEach(l => {
    const b = bM.get(l.id), i = out.findIndex(x => x.id === l.id);
    if (!b) { if (i === -1) out.push(l); return; }                  // novos aqui
    if (igual(b, l)) return;                                         // sem mudança aqui: vale o servidor
    if (i === -1) out.push(l); else out[i] = fundirReg(b, l, out[i]);
  });
  return out;
}
function fundir(base, local, srv) {
  base = normalizar(base || vazio()); srv = normalizar(srv);
  const cfg = { ...srv.config };
  Object.keys(local.config).forEach(k => { if (!igual(local.config[k], base.config[k])) cfg[k] = local.config[k]; });
  return { config: cfg, clientes: fundirLista(base.clientes, local.clientes, srv.clientes), produtos: fundirLista(base.produtos, local.produtos, srv.produtos), fiados: fundirLista(base.fiados, local.fiados, srv.fiados) };
}
function adotar(d) { db = normalizar(d); try { localStorage.setItem(CACHE, JSON.stringify(db)); } catch (e) { /* ignora */ } }
function agendarEnvio() { statusSync('salvando'); clearTimeout(tEnvio); tEnvio = setTimeout(enviar, 700); }
async function enviar() {
  if (enviando) { pendente = true; return; }
  enviando = true; pendente = false;
  try {
    for (let i = 0; i < 5; i++) {
      const snap = clone(db), r = await api('POST', { base: srvVer, dados: snap });
      if (r.status === 200) { const j = await r.json(); srvVer = j.versao; srvDb = snap; guardarSrv(); statusSync('ok'); avisouOff = false; break; }
      if (r.status === 409) {
        const j = await r.json();
        if (j.erro !== 'versao') throw new Error('409');
        const merged = fundir(srvDb, db, j.dados);
        srvVer = j.versao; srvDb = normalizar(j.dados); adotar(merged); guardarSrv(); render(); continue;
      }
      if (r.status === 401) { toast('Sua sessão terminou. Entre de novo para continuar.', 'erro'); setTimeout(() => location.reload(), 2500); break; }
      throw new Error('http ' + r.status);
    }
  } catch (e) {
    statusSync('erro');
    if (!avisouOff) { avisouOff = true; toast('Sem conexão com o servidor. Suas alterações estão salvas neste aparelho e serão enviadas quando voltar.', 'erro'); }
    setTimeout(() => { if (!enviando && !igual(db, srvDb)) enviar(); }, 15000);
  } finally { enviando = false; if (pendente) enviar(); }
}
const temModal = () => !!document.querySelector('dialog[open]');
async function buscar(inicial) {
  if (enviando || document.hidden && !inicial) return;
  try {
    const r = await api('GET');
    if (r.status === 401) { location.reload(); return; }
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json(), sujo = !srvDb || !igual(db, srvDb);
    if (j.versao === 0) {                                   // servidor vazio: envia o que há aqui (migração do aparelho)
      if (!srvDb) { srvDb = null; srvVer = 0; }
      if (db.clientes.length || db.fiados.length || db.produtos.length || db.config.iniciado) await enviar(); else statusSync('ok');
      return;
    }
    if (j.versao === srvVer && srvDb) { if (sujo) enviar(); else statusSync('ok'); return; }
    if (!srvDb) {                                            // primeira vez neste aparelho: o servidor manda
      try { if (localStorage.getItem(KEY) && !localStorage.getItem(KEY + '-antes-do-servidor')) localStorage.setItem(KEY + '-antes-do-servidor', localStorage.getItem(KEY)); } catch (e) { /* ignora */ }
      adotar(j.dados); srvVer = j.versao; srvDb = clone(db); guardarSrv(); statusSync('ok'); render(); return;
    }
    if (sujo) { enviar(); return; }                          // tenho mudanças: junta no envio
    if (temModal() && !inicial) return;                      // não atrapalha quem está digitando
    adotar(j.dados); srvVer = j.versao; srvDb = clone(db); guardarSrv(); statusSync('ok'); render();
  } catch (e) { statusSync('erro'); }
}
if (SYNC) {
  setInterval(() => buscar(false), 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(false); });
  window.addEventListener('online', () => buscar(false));
}

/* ---------- inicio ---------- */
aplicarTema();
render();
if (SYNC) {
  statusSync('salvando');
  buscar(true).then(() => { render(); if (!db.config.iniciado && !db.clientes.length && !db.fiados.length) abrirBoasVindas(); });
} else if (!db.config.iniciado && !db.clientes.length && !db.fiados.length) abrirBoasVindas();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

})();
