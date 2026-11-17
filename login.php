<?php
define('CF', 1); require __DIR__ . '/auth.php';
$erro = ''; $usuarios = cf_usuarios(); $primeiro = count($usuarios) === 0;
if (cf_atual()) cf_ir('');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $login = trim($_POST['usuario'] ?? '');
    if ($primeiro) {
        /* primeiro acesso: cria o administrador */
        $nome = trim($_POST['nome'] ?? ''); $s = $_POST['senha'] ?? ''; $s2 = $_POST['senha2'] ?? '';
        if ($nome === '' || $login === '') $erro = 'Preencha o nome e o usuário.';
        elseif (!preg_match('/^[a-z0-9._-]{3,30}$/i', $login)) $erro = 'O usuário deve ter de 3 a 30 letras, números, ponto ou traço (sem espaços).';
        elseif (!cf_senha_ok($s)) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
        elseif ($s !== $s2) $erro = 'As duas senhas não são iguais.';
        else {
            $u = cf_novo_usuario($login, $nome, $s, true);
            if (!cf_salvar_usuarios(array($u))) $erro = 'Não consegui salvar. Confira se a pasta do site permite gravar arquivos.';
            else { cf_entrar($u); cf_ir(''); }
        }
    } else {
        $senha = $_POST['senha'] ?? '';
        $min = cf_bloqueado($login);
        if ($min) $erro = 'Muitas tentativas. Tente de novo em ' . $min . ' minuto' . ($min > 1 ? 's' : '') . '.';
        else {
            $u = cf_achar($usuarios, 'usuario', strtolower($login));
            $ok = $u && !empty($u['ativo']) && password_verify($senha, $u['hash']);
            if (!$u) password_verify($senha, '$2y$10$abcdefghijklmnopqrstuuF4mZcQJ0m5yQ0h3o2YcJw1y8s6u5eXe');  // gasta o mesmo tempo
            if ($ok) { cf_limpar_falhas($login); if (password_needs_rehash($u['hash'], PASSWORD_DEFAULT)) { /* mantém */ } cf_entrar($u); cf_ir(''); }
            else { cf_falha($login); $erro = ($u && empty($u['ativo'])) ? 'Este acesso está desativado. Fale com o administrador.' : 'Usuário ou senha incorretos.'; }
        }
    }
}
cf_topo($primeiro ? 'Primeiro acesso' : 'Entrar');
?>
<main class="aut">
  <section class="card aut-card">
    <?= cf_marca() ?>
    <?php if ($primeiro): ?>
      <h1>Primeiro acesso</h1>
      <p class="aut-sub">Crie o administrador do sistema. É com ele que você vai cadastrar os outros usuários e trocar senhas.</p>
    <?php else: ?>
      <h1>Entrar</h1>
      <p class="aut-sub">Digite seu usuário e sua senha para abrir o caderninho.</p>
    <?php endif; ?>
    <?php if ($erro): ?><div class="aut-erro" role="alert"><i class="ph ph-warning-circle"></i><span><?= cf_h($erro) ?></span></div><?php endif; ?>
    <form method="post" autocomplete="on">
      <?php if ($primeiro): ?>
        <div class="campo"><label for="nome">Seu nome</label><input type="text" id="nome" name="nome" value="<?= cf_h($_POST['nome'] ?? '') ?>" required autocomplete="name"></div>
      <?php endif; ?>
      <div class="campo"><label for="usuario">Usuário</label><input type="text" id="usuario" name="usuario" value="<?= cf_h($_POST['usuario'] ?? '') ?>" required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></div>
      <?= cf_campo_senha('senha', 'senha', 'Senha', $primeiro ? 'new-password' : 'current-password') ?>
      <?php if ($primeiro) echo cf_campo_senha('senha2', 'senha2', 'Repita a senha'); ?>
      <button class="btn btn-primary btn-grande" type="submit"><i class="ph ph-sign-in"></i><?= $primeiro ? 'Criar administrador e entrar' : 'Entrar' ?></button>
    </form>
    <?php if (!$primeiro): ?><p class="aut-nota">Esqueceu a senha? Peça uma nova para o administrador.</p><?php endif; ?>
  </section>
</main>
<?php cf_rodape();
