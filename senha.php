<?php
define('CF', 1); require __DIR__ . '/auth.php';
$eu = cf_exigir_login(); $msg = ''; $erro = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!cf_csrf_ok()) $erro = 'A página expirou. Tente de novo.';
    elseif (!password_verify($_POST['atual'] ?? '', $eu['hash'])) $erro = 'A senha atual não confere.';
    elseif (!cf_senha_ok($_POST['nova'] ?? '')) $erro = 'A nova senha precisa ter pelo menos 6 caracteres.';
    elseif (($_POST['nova'] ?? '') !== ($_POST['nova2'] ?? '')) $erro = 'As duas senhas novas não são iguais.';
    else {
        $novo = $eu; $novo['hash'] = password_hash($_POST['nova'], PASSWORD_DEFAULT);
        if (cf_u_set($eu['id'], array('hash' => $novo['hash']))) { cf_entrar($novo); $msg = 'Senha alterada com sucesso.'; } else $erro = 'Não consegui salvar a nova senha.';
    }
}
cf_topo('Minha senha');
?>
<main class="aut">
  <section class="card aut-card">
    <?= cf_marca() ?>
    <h1>Alterar minha senha</h1>
    <p class="aut-sub">Usuário: <b><?= cf_h($eu['usuario']) ?></b></p>
    <?php if ($msg): ?><div class="aut-ok" role="status"><i class="ph ph-check-circle"></i><span><?= cf_h($msg) ?></span></div><?php endif; ?>
    <?php if ($erro): ?><div class="aut-erro" role="alert"><i class="ph ph-warning-circle"></i><span><?= cf_h($erro) ?></span></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>">
      <?= cf_campo_senha('atual', 'atual', 'Senha atual', 'current-password') ?>
      <?= cf_campo_senha('nova', 'nova', 'Nova senha') ?>
      <?= cf_campo_senha('nova2', 'nova2', 'Repita a nova senha') ?>
      <button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-check"></i>Salvar nova senha</button>
    </form>
    <a class="btn btn-ghost aut-voltar" href="<?= cf_h(cf_url('')) ?>"><i class="ph ph-arrow-left"></i>Voltar ao sistema</a>
  </section>
</main>
<?php cf_rodape();
