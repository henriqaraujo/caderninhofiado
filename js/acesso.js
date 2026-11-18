/* Telas de acesso: mostrar/esconder senha, gerar senha, janela de nova senha e confirmação */
(function () {
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ver]');
    if (b) {
      var i = document.getElementById(b.getAttribute('data-ver')); if (!i) return;
      var ver = i.type === 'password'; i.type = ver ? 'text' : 'password';
      b.querySelector('i').className = ver ? 'ph ph-eye-slash' : 'ph ph-eye'; return;
    }
    b = e.target.closest('[data-gerar]');
    if (b) {
      var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = '', a = new Uint32Array(8);
      (window.crypto || window.msCrypto).getRandomValues(a);
      for (var k = 0; k < 8; k++) s += c[a[k] % c.length];
      var inp = document.getElementById(b.getAttribute('data-gerar')); inp.type = 'text'; inp.value = s; inp.focus(); inp.select(); return;
    }
    b = e.target.closest('[data-senha]');
    if (b) {
      document.getElementById('dlg-senha-id').value = b.getAttribute('data-senha');
      document.getElementById('dlg-senha-nome').textContent = 'Para: ' + b.getAttribute('data-nome');
      var d = document.getElementById('dlg-senha'); document.getElementById('dlg-nova').value = ''; d.showModal(); document.getElementById('dlg-nova').focus(); return;
    }
    b = e.target.closest('[data-periodo]');
    if (b) {
      document.getElementById('dlg-periodo-id').value = b.getAttribute('data-periodo');
      document.getElementById('dlg-periodo-nome').textContent = 'Para: ' + b.getAttribute('data-nome');
      document.getElementById('dlg-periodo').showModal(); document.getElementById('dlg-dias').focus(); return;
    }
    if (e.target.closest('[data-fechar]')) { var dd = e.target.closest('dialog'); if (dd) dd.close(); }
  });
  document.addEventListener('submit', function (e) {
    var m = e.target.getAttribute && e.target.getAttribute('data-confirma');
    if (m && !window.confirm(m)) e.preventDefault();
  });
})();

/* botão de tema (claro/escuro) nas telas de acesso */
(function () {
  try {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tema-fixo';
    function pinta() {
      var e = document.documentElement.dataset.theme === 'dark';
      b.innerHTML = '<i class="ph ' + (e ? 'ph-sun' : 'ph-moon') + '"></i>';
      b.setAttribute('aria-label', e ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
      b.title = e ? 'Modo claro' : 'Modo escuro';
    }
    b.addEventListener('click', function () {
      var novo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = novo;
      try { localStorage.setItem('cf-tema', novo); } catch (e) {}
      pinta();
    });
    pinta(); document.body.appendChild(b);
  } catch (e) {}
})();
