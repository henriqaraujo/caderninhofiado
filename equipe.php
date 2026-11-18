<?php
define('CF', 1); require __DIR__ . '/auth.php';
$eu = cf_exigir_login();
if (!cf_modo_banco() || empty($eu['dono'])) {
    http_response_code(403); cf_topo('Sem permissão');
    echo '<main class="aut"><section class="card aut-card">' . cf_marca() . '<h1>Sem permissão</h1><p class="aut-sub">Só o dono do comércio pode gerenciar a equipe.</p><a class="btn btn-primary" href="' . cf_h(cf_url('')) . '">Voltar ao sistema</a></section></main>';
    cf_rodape(); exit;
}
$msg = $_GET['m'] ?? ''; $erro = '';
$MSG = array('criado' => 'Pessoa adicionada à equipe.', 'senha' => 'Senha alterada.', 'ativo' => 'Situação do acesso alterada.', 'excluido' => 'Acesso removido.');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $acao = $_POST['acao'] ?? ''; $id = $_POST['id'] ?? ''; $ok = 'x';
    if (!cf_csrf_ok()) $erro = 'A página expirou. Tente de novo.';
    elseif ($acao === 'criar') {
        $login = trim($_POST['usuario'] ?? ''); $nome = trim($_POST['nome'] ?? ''); $s = $_POST['senha'] ?? '';
        if ($nome === '' || $login === '') $erro = 'Preencha o nome e o usuário.';
        elseif (!preg_match('/^[a-z0-9._-]{3,30}$/i', $login)) $erro = 'O usuário deve ter de 3 a 30 letras, números, ponto ou traço (sem espaços).';
        elseif (cf_u_login($login)) $erro = 'Já existe um usuário com esse nome de acesso. Escolha outro.';
        elseif (!cf_senha_ok($s)) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
        elseif (count(cf_u_equipe($eu['cid'])) >= CF_MAX_EQUIPE) $erro = 'O limite é de ' . CF_MAX_EQUIPE . ' pessoas por comércio.';
        elseif (cf_u_criar($eu['cid'], $login, $nome, $s, false, false)) $ok = 'criado';
        else $erro = 'Não consegui criar o acesso.';
    } else {
        $alvo = cf_u_id($id);
        if (!$alvo || $alvo['cid'] !== $eu['cid']) $erro = 'Pessoa não encontrada.';
        elseif ($alvo['dono'] || $alvo['admin'] || $id === $eu['id']) $erro = 'Esse acesso não pode ser alterado aqui.';
        elseif ($acao === 'senha') {
            if (!cf_senha_ok($_POST['nova'] ?? '')) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
            else { cf_u_set($id, array('hash' => password_hash($_POST['nova'], PASSWORD_DEFAULT))); $ok = 'senha'; }
        } elseif ($acao === 'ativo') { cf_u_set($id, array('ativo' => !$alvo['ativo'])); $ok = 'ativo'; }
        elseif ($acao === 'excluir') { cf_u_excluir($id); $ok = 'excluido'; }
    }
    if (!$erro && $ok !== 'x') cf_ir('equipe.php?m=' . $ok);
}
$lista = cf_u_equipe($eu['cid']);
cf_topo('Minha equipe');
?>
<main class="adm">
  <header class="adm-topo">
    <div><?= cf_marca() ?><h1>Minha equipe</h1><p class="aut-sub">Dê acesso a outras pessoas do seu comércio. Todas veem o mesmo caderninho: <b><?= cf_h($eu['cnome']) ?></b>.</p></div>
    <div class="adm-links"><a class="btn" href="<?= cf_h(cf_url('')) ?>"><i class="ph ph-arrow-left"></i>Voltar ao sistema</a><a class="btn" href="senha.php"><i class="ph ph-key"></i>Minha senha</a><a class="btn" href="sair.php"><i class="ph ph-sign-out"></i>Sair</a></div>
  </header>
  <?php if ($msg && isset($MSG[$msg])): ?><div class="aut-ok" role="status"><i class="ph ph-check-circle"></i><span><?= cf_h($MSG[$msg]) ?></span></div><?php endif; ?>
  <?php if ($erro): ?><div class="aut-erro" role="alert"><i class="ph ph-warning-circle"></i><span><?= cf_h($erro) ?></span></div><?php endif; ?>

  <?php if (count($lista) < CF_MAX_EQUIPE): ?>
  <section class="card adm-bloco">
    <h2>Adicionar pessoa</h2>
    <form method="post" class="adm-novo">
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="acao" value="criar">
      <div class="campo"><label for="n-nome">Nome da pessoa</label><input type="text" id="n-nome" name="nome" required placeholder="Ex.: Maria (balcão)" autocomplete="off"></div>
      <div class="campo"><label for="n-user">Usuário (para entrar)</label><input type="text" id="n-user" name="usuario" required placeholder="Ex.: maria.balcao" autocapitalize="none" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="n-senha">Senha</label><div class="senha-wrap"><input type="text" id="n-senha" name="senha" required minlength="6" autocomplete="off" spellcheck="false"><button type="button" class="ver-senha" data-gerar="n-senha" aria-label="Gerar uma senha"><i class="ph ph-magic-wand"></i></button></div><small class="ajuda">Toque na varinha para gerar uma senha fácil de ler.</small></div>
      <button class="btn btn-primary" type="submit"><i class="ph ph-user-plus"></i>Adicionar à equipe</button>
    </form>
  </section>
  <?php endif; ?>

  <section class="card adm-bloco adm-lista">
    <h2>Pessoas com acesso <span class="adm-qtd"><?= count($lista) ?> de <?= CF_MAX_EQUIPE ?></span></h2>
    <div class="adm-tab"><table class="tb">
      <thead><tr><th><span class="th-bt">Nome</span></th><th><span class="th-bt">Usuário</span></th><th><span class="th-bt">Perfil</span></th><th><span class="th-bt">Situação</span></th><th><span class="th-bt">Ações</span></th></tr></thead>
      <tbody>
      <?php foreach ($lista as $u): $meu = $u['id'] === $eu['id']; $pode = !$u['dono'] && !$u['admin'] && !$meu; ?>
        <tr style="cursor:default">
          <td><b><?= cf_h($u['nome']) ?></b><?= $meu ? ' <span class="badge">você</span>' : '' ?></td>
          <td class="dt" data-l="Usuário"><?= cf_h($u['usuario']) ?></td>
          <td data-l="Perfil"><?= $u['dono'] ? '<span class="badge st-hoje"><i class="ph ph-crown-simple"></i>Dono</span>' : '<span class="badge">Equipe</span>' ?></td>
          <td data-l="Situação"><?= $u['ativo'] ? '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Ativo</span>' : '<span class="badge st-atrasado"><i class="ph ph-prohibit"></i>Desativado</span>' ?></td>
          <td class="td-acoes">
            <div class="adm-acoes">
              <?php if ($pode): ?>
              <button class="btn btn-pq" type="button" data-senha="<?= cf_h($u['id']) ?>" data-nome="<?= cf_h($u['nome']) ?>" data-tip="Criar uma nova senha para <?= cf_h($u['nome']) ?>" aria-label="Nova senha"><i class="ph ph-key"></i></button>
              <form method="post"><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="ativo"><button class="btn btn-pq" type="submit" data-tip="<?= $u['ativo'] ? 'Desativar: a pessoa deixa de conseguir entrar' : 'Reativar: a pessoa volta a poder entrar' ?>" aria-label="<?= $u['ativo'] ? 'Desativar' : 'Reativar' ?>"><?= $u['ativo'] ? '<i class="ph ph-prohibit"></i>' : '<i class="ph ph-check"></i>' ?></button></form>
              <form method="post" data-confirma="Remover o acesso de <?= cf_h($u['nome']) ?>? Os dados do caderninho continuam guardados."><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="excluir"><button class="btn btn-pq btn-perigo" type="submit" data-tip="Remover o acesso desta pessoa" aria-label="Remover"><i class="ph ph-trash"></i></button></form>
              <?php endif; ?>
            </div>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
  </section>

  <dialog id="dlg-senha" class="adm-dlg">
    <form method="post">
      <h2>Nova senha</h2>
      <p class="aut-sub" id="dlg-senha-nome"></p>
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="acao" value="senha"><input type="hidden" name="id" id="dlg-senha-id">
      <div class="campo"><label for="dlg-nova">Nova senha</label><div class="senha-wrap"><input type="text" id="dlg-nova" name="nova" required minlength="6" autocomplete="off" spellcheck="false"><button type="button" class="ver-senha" data-gerar="dlg-nova" aria-label="Gerar uma senha"><i class="ph ph-magic-wand"></i></button></div><small class="ajuda">Anote e passe a senha para a pessoa. Ela sai dos aparelhos onde estava logada.</small></div>
      <div class="adm-dlg-acoes"><button class="btn btn-primary" type="submit"><i class="ph ph-check"></i>Salvar senha</button><button class="btn" type="button" data-fechar>Cancelar</button></div>
    </form>
  </dialog>
</main>
<?php cf_rodape();
