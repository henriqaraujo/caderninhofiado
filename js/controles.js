/* Controles proprios: lista de escolha (no lugar do <select>) e calendario (no lugar do <input type="date">).
   Os campos originais continuam no formulario, escondidos, guardando o valor. Quem usa o formulario nao percebe a troca. */
'use strict';
(() => {

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pick = document.getElementById('dlg-pick');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const hojeIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
const fmt = s => s ? s.split('-').reverse().join('/') : '';
const celular = () => matchMedia('(max-width:719px)').matches;

/* ---------- janela flutuante ---------- */
function abrirPick(gatilho, titulo, html, largura) {
  pick.innerHTML = `<div class="pk"><div class="pk-top"><strong>${esc(titulo)}</strong><button type="button" class="icon-btn" data-pk="fechar" aria-label="Fechar"><i class="ph ph-x"></i></button></div>${html}</div>`;
  pick._gat = gatilho; pick._larg = largura || 0;
  pick.classList.toggle('pk-mobile', celular());
  pick.removeAttribute('style');
  pick.showModal();
  posicionar();
}
/* no computador a janela fica colada no campo, para cima ou para baixo conforme o espaço */
function posicionar() {
  if (!pick.open || pick.classList.contains('pk-mobile') || !pick._gat) return;
  const r = pick._gat.getBoundingClientRect(), w = Math.max(r.width, pick._larg);
  pick.style.maxHeight = 'none'; pick.style.top = '0px';
  const h = pick.scrollHeight + 2;
  const abaixo = innerHeight - r.bottom - 14, acima = r.top - 14;
  const emBaixo = abaixo >= h || abaixo >= acima;
  const mh = Math.max(200, Math.min(h, emBaixo ? abaixo : acima));
  pick.style.width = w + 'px';
  pick.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  pick.style.maxHeight = mh + 'px';
  pick.style.top = (emBaixo ? r.bottom + 6 : Math.max(8, r.top - mh - 6)) + 'px';
}
pick.addEventListener('close', () => { pick.innerHTML = ''; });
pick.addEventListener('click', e => { if (e.target === pick) pick.close(); });

/* ---------- lista de escolha ---------- */
function textoOpcao(o) { return o.textContent.replace(/^\+\s*/, ''); }
function sincronizarSelect(sel) {
  const btn = sel._ctl; if (!btn) return;
  const o = sel.options[sel.selectedIndex];
  const t = btn.querySelector('.csel-t');
  t.textContent = o ? textoOpcao(o) : '';
  btn.classList.toggle('vazio', !sel.value);
}
function melhorarSelect(sel) {
  if (sel.dataset.enh) return;
  sel.dataset.enh = '1';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'csel'; btn.id = sel.id;
  btn.setAttribute('aria-haspopup', 'listbox');
  if (sel.id) sel.removeAttribute('id');
  if (sel.hasAttribute('autofocus')) { btn.setAttribute('autofocus', ''); sel.removeAttribute('autofocus'); }
  btn.innerHTML = '<span class="csel-t"></span><i class="ph ph-caret-down" aria-hidden="true"></i>';
  sel.hidden = true; sel.tabIndex = -1;
  sel.parentNode.insertBefore(btn, sel);
  sel._ctl = btn; btn._campo = sel;
  sincronizarSelect(sel);
  btn.addEventListener('click', () => abrirLista(sel));
}
function abrirLista(sel) {
  const btn = sel._ctl, ops = [...sel.options];
  const rotulo = document.querySelector(`label[for="${btn.id}"]`) || btn.closest('.campo')?.querySelector('.rotulo');
  const titulo = rotulo ? rotulo.textContent.trim() : 'Escolha';
  const busca = ops.filter(o => !o.hidden).length > 7;
  const html = (busca ? '<div class="pk-busca"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Buscar" aria-label="Buscar na lista" autocomplete="off"></div>' : '') +
    `<div class="pk-lista" role="listbox" aria-label="${esc(titulo)}">` + ops.map((o, i) => {
      if (o.hidden) return '';
      const novo = o.value.startsWith('__');
      return `<button type="button" role="option" class="pk-op${novo ? ' novo' : ''}${o.selected ? ' sel' : ''}" data-i="${i}" aria-selected="${o.selected}">${novo ? '<i class="ph ph-plus" aria-hidden="true"></i>' : ''}<span>${esc(textoOpcao(o))}</span>${o.selected ? '<i class="ph ph-check pk-ck" aria-hidden="true"></i>' : ''}</button>`;
    }).join('') + '</div>';
  abrirPick(btn, titulo, html);
  pick._sel = sel; pick._tipo = 'lista';
  const alvo = busca ? pick.querySelector('.pk-busca input') : (pick.querySelector('.pk-op.sel') || pick.querySelector('.pk-op'));
  if (alvo) alvo.focus();
  posicionar();
  const sel1 = pick.querySelector('.pk-op.sel'); if (sel1) sel1.scrollIntoView({ block: 'nearest' });
}

/* ---------- calendario ---------- */
const cal = { campo: null, y: 0, m: 0, modo: 'dias' };
function sincronizarData(inp) {
  const btn = inp._ctl; if (!btn) return;
  const t = btn.querySelector('.csel-t');
  t.textContent = inp.value ? fmt(inp.value) : (inp.dataset.vazio || 'Escolher a data');
  btn.classList.toggle('vazio', !inp.value);
}
function melhorarData(inp) {
  if (inp.dataset.enh) return;
  inp.dataset.enh = '1';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'csel'; btn.id = inp.id;
  btn.setAttribute('aria-haspopup', 'dialog');
  if (inp.id) inp.removeAttribute('id');
  btn.innerHTML = '<span class="csel-t"></span><i class="ph ph-calendar-blank" aria-hidden="true"></i>';
  inp.hidden = true; inp.tabIndex = -1;
  inp.parentNode.insertBefore(btn, inp);
  inp._ctl = btn; btn._campo = inp;
  sincronizarData(inp);
  btn.addEventListener('click', () => abrirCalendario(inp));
}
function abrirCalendario(inp) {
  const base = inp.value || hojeIso(), [y, m] = base.split('-').map(Number);
  cal.campo = inp; cal.y = y; cal.m = m - 1; cal.modo = 'dias';
  const rotulo = document.querySelector(`label[for="${inp._ctl.id}"]`);
  abrirPick(inp._ctl, rotulo ? rotulo.textContent.trim() : 'Escolha a data', '<div id="cal-corpo"></div>', 320);
  pick._tipo = 'data';
  desenharCal();
  posicionar();
  const foco = pick.querySelector('.cal-d.sel') || pick.querySelector('.cal-d.hoje') || pick.querySelector('.cal-d');
  if (foco) foco.focus();
}
function desenharCal() {
  const el = pick.querySelector('#cal-corpo'); if (!el) return;
  const inp = cal.campo, sel = inp.value, hoje = hojeIso(), min = inp.min || '', max = inp.max || '';
  let corpo;
  if (cal.modo === 'meses') {
    corpo = `<div class="cal-h"><button type="button" class="icon-btn" data-pk="ano-" aria-label="Ano anterior"><i class="ph ph-caret-left"></i></button>
      <strong class="cal-t">${cal.y}</strong><button type="button" class="icon-btn" data-pk="ano+" aria-label="Próximo ano"><i class="ph ph-caret-right"></i></button></div>
      <div class="cal-meses">${MESES.map((n, i) => `<button type="button" class="cal-m${i === cal.m ? ' sel' : ''}" data-pk="mes" data-m="${i}">${n.slice(0, 3)}</button>`).join('')}</div>`;
  } else {
    const prim = new Date(cal.y, cal.m, 1), ini = new Date(cal.y, cal.m, 1 - prim.getDay());
    let cel = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i), v = iso(d.getFullYear(), d.getMonth(), d.getDate());
      const fora = d.getMonth() !== cal.m, bloq = (min && v < min) || (max && v > max);
      cel += `<button type="button" class="cal-d${fora ? ' fora' : ''}${v === hoje ? ' hoje' : ''}${v === sel ? ' sel' : ''}" data-pk="dia" data-d="${v}" ${bloq ? 'disabled' : ''} aria-label="${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}" ${v === sel ? 'aria-pressed="true"' : ''}>${d.getDate()}</button>`;
    }
    corpo = `<div class="cal-h"><button type="button" class="icon-btn" data-pk="mes-" aria-label="Mês anterior"><i class="ph ph-caret-left"></i></button>
      <button type="button" class="cal-t cal-t-bt" data-pk="modo" aria-label="Escolher mês e ano">${cap(MESES[cal.m])} de ${cal.y}<i class="ph ph-caret-down" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn" data-pk="mes+" aria-label="Próximo mês"><i class="ph ph-caret-right"></i></button></div>
      <div class="cal-sem" aria-hidden="true">${SEMANA.map(s => `<span>${s}</span>`).join('')}</div><div class="cal-g">${cel}</div>`;
  }
  const antes = el.innerHTML;
  el.innerHTML = corpo + `<div class="cal-f"><button type="button" class="btn" data-pk="hoje">Hoje</button>${inp.dataset.limpar ? '<button type="button" class="btn btn-ghost" data-pk="limpar">Limpar</button>' : ''}</div>`;
  if (antes) posicionar();
}
function escolherData(v) {
  const inp = cal.campo; inp.value = v; sincronizarData(inp);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  pick.close();
}

/* ---------- eventos da janela ---------- */
pick.addEventListener('click', e => {
  const el = e.target.closest('[data-pk],.pk-op'); if (!el) return;
  if (el.classList.contains('pk-op')) {
    const sel = pick._sel, o = sel.options[+el.dataset.i]; if (!o) return;
    sel.value = o.value; sincronizarSelect(sel);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    pick.close(); return;
  }
  const a = el.dataset.pk;
  if (a === 'fechar') pick.close();
  else if (a === 'dia') escolherData(el.dataset.d);
  else if (a === 'hoje') escolherData(hojeIso());
  else if (a === 'limpar') escolherData('');
  else if (a === 'mes-') { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } desenharCal(); pick.querySelector('[data-pk="mes-"]').focus(); }
  else if (a === 'mes+') { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } desenharCal(); pick.querySelector('[data-pk="mes+"]').focus(); }
  else if (a === 'modo') { cal.modo = 'meses'; desenharCal(); }
  else if (a === 'ano-') { cal.y--; desenharCal(); pick.querySelector('[data-pk="ano-"]').focus(); }
  else if (a === 'ano+') { cal.y++; desenharCal(); pick.querySelector('[data-pk="ano+"]').focus(); }
  else if (a === 'mes') { cal.m = +el.dataset.m; cal.modo = 'dias'; desenharCal(); }
});
pick.addEventListener('input', e => {
  if (!e.target.matches('.pk-busca input')) return;
  const q = norm(e.target.value);
  pick.querySelectorAll('.pk-op').forEach(b => { b.hidden = q && !norm(b.textContent).includes(q); });
});
pick.addEventListener('keydown', e => {
  if (pick._tipo === 'lista' && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
    const l = [...pick.querySelectorAll('.pk-op:not([hidden])')]; if (!l.length) return;
    const i = l.indexOf(document.activeElement);
    let n = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : l.length - 1;
    n = Math.max(0, Math.min(l.length - 1, n)); l[n].focus(); e.preventDefault();
  }
  if (pick._tipo === 'data' && cal.modo === 'dias' && /^Arrow/.test(e.key) && document.activeElement.classList.contains('cal-d')) {
    const [y, m, d] = document.activeElement.dataset.d.split('-').map(Number);
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const alvo = new Date(y, m - 1, d + passo), v = iso(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
    cal.y = alvo.getFullYear(); cal.m = alvo.getMonth(); desenharCal();
    const b = pick.querySelector(`.cal-d[data-d="${v}"]`); if (b) b.focus(); e.preventDefault();
  }
});

/* ---------- interface publica ---------- */
window.Controles = {
  melhorar(raiz) {
    (raiz || document).querySelectorAll('select:not([data-enh])').forEach(melhorarSelect);
    (raiz || document).querySelectorAll('input[type="date"]:not([data-enh])').forEach(melhorarData);
  },
  sincronizar(campo) {
    if (!campo || !campo._ctl) return;
    if (campo.tagName === 'SELECT') sincronizarSelect(campo); else sincronizarData(campo);
  }
};
})();
