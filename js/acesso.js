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
    if (e.target.closest('[data-fechar]')) { document.getElementById('dlg-senha').close(); }
  });
  document.addEventListener('submit', function (e) {
    var m = e.target.getAttribute && e.target.getAttribute('data-confirma');
    if (m && !window.confirm(m)) e.preventDefault();
  });
})();
