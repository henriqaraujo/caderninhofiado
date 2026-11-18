<?php
define('CF', 1); require __DIR__ . '/auth.php';
$eu = cf_exigir_admin();
$msg = $_GET['m'] ?? ''; $erro = '';
$MSG = array('criado' => 'Usuário criado.', 'senha' => 'Senha alterada.', 'ativo' => 'Situação do acesso alterada.', 'perfil' => 'Perfil alterado.', 'excluido' => 'Usuário excluído.', 'periodo' => 'Período de acesso atualizado.');

function adm_ativos_admin($l, $ignorar = '') { $n = 0; foreach ($l as $u) if ($u['id'] !== $ignorar && !empty($u['admin']) && !empty($u['ativo'])) $n++; return $n; }

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $acao = $_POST['acao'] ?? ''; $id = $_POST['id'] ?? ''; $l = cf_usuarios(); $ok = 'x';
    if (!cf_csrf_ok()) $erro = 'A página expirou. Tente de novo.';
    elseif ($acao === 'criar') {
        $login = trim($_POST['usuario'] ?? ''); $nome = trim($_POST['nome'] ?? ''); $s = $_POST['senha'] ?? '';
        if ($nome === '' || $login === '') $erro = 'Preencha o nome e o usuário.';
        elseif (!preg_match('/^[a-z0-9._-]{3,30}$/i', $login)) $erro = 'O usuário deve ter de 3 a 30 letras, números, ponto ou traço (sem espaços).';
        elseif (cf_achar($l, 'usuario', strtolower($login))) $erro = 'Já existe um usuário com esse nome de acesso.';
        elseif (!cf_senha_ok($s)) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
        else {
            $nu = cf_novo_usuario($login, $nome, $s, !empty($_POST['admin']));
            $dias = (int)($_POST['dias'] ?? 0);
            if ($dias > 0 && empty($nu['admin'])) $nu['ate'] = cf_ate(min($dias, 3650));
            $l[] = $nu; $ok = 'criado';
        }
    } else {
        $alvo = null; foreach ($l as $i => $u) if ($u['id'] === $id) { $alvo = $i; break; }
        if ($alvo === null) $erro = 'Usuário não encontrado.';
        elseif ($acao === 'senha') {
            if (!cf_senha_ok($_POST['nova'] ?? '')) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
            else { $l[$alvo]['hash'] = password_hash($_POST['nova'], PASSWORD_DEFAULT); $l[$alvo]['senhaEm'] = date('Y-m-d H:i'); $ok = 'senha'; }
        } elseif ($acao === 'ativo') {
            if ($id === $eu['id']) $erro = 'Você não pode desativar o seu próprio acesso.';
            elseif (!empty($l[$alvo]['ativo']) && !empty($l[$alvo]['admin']) && adm_ativos_admin($l, $id) < 1) $erro = 'É preciso manter pelo menos um administrador ativo.';
            else { $l[$alvo]['ativo'] = empty($l[$alvo]['ativo']); $ok = 'ativo'; }
        } elseif ($acao === 'perfil') {
            if ($id === $eu['id']) $erro = 'Você não pode mudar o seu próprio perfil.';
            else { $l[$alvo]['admin'] = empty($l[$alvo]['admin']); $ok = 'perfil'; }
        } elseif ($acao === 'periodo') {
            if (!empty($l[$alvo]['admin'])) $erro = 'Administradores não têm período de teste.';
            elseif (($_POST['modo'] ?? '') === 'liberar') { unset($l[$alvo]['ate']); $ok = 'periodo'; }
            else {
                $dias = (int)($_POST['dias'] ?? 0);
                if ($dias < 1 || $dias > 3650) $erro = 'Informe de 1 a 3650 dias.';
                else { $l[$alvo]['ate'] = cf_ate($dias); $ok = 'periodo'; }
            }
        } elseif ($acao === 'excluir') {
            if ($id === $eu['id']) $erro = 'Você não pode excluir o seu próprio acesso.';
            else { array_splice($l, $alvo, 1); $ok = 'excluido'; }
        }
    }
    if (!$erro && $ok !== 'x') {
        if (cf_salvar_usuarios($l)) cf_ir('admin.php?m=' . $ok);
        $erro = 'Não consegui salvar. Confira se a pasta do site permite gravar arquivos.';
    }
}
$lista = cf_usuarios();
cf_topo('Administração');
?>
<main class="adm">
  <header class="adm-topo">
    <div><?= cf_marca() ?><h1>Administração de usuários</h1><p class="aut-sub">Crie acessos, troque senhas e desative quem não deve mais entrar.</p></div>
    <div class="adm-links"><a class="btn" href="<?= cf_h(cf_url('')) ?>"><i class="ph ph-arrow-left"></i>Voltar ao sistema</a><a class="btn" href="senha.php"><i class="ph ph-key"></i>Minha senha</a><a class="btn" href="sair.php"><i class="ph ph-sign-out"></i>Sair</a></div>
  </header>
  <?php if ($msg && isset($MSG[$msg])): ?><div class="aut-ok" role="status"><i class="ph ph-check-circle"></i><span><?= cf_h($MSG[$msg]) ?></span></div><?php endif; ?>
  <?php if ($erro): ?><div class="aut-erro" role="alert"><i class="ph ph-warning-circle"></i><span><?= cf_h($erro) ?></span></div><?php endif; ?>

  <section class="card adm-bloco">
    <h2>Novo usuário</h2>
    <form method="post" class="adm-novo">
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="acao" value="criar">
      <div class="campo"><label for="n-nome">Nome da pessoa</label><input type="text" id="n-nome" name="nome" required placeholder="Ex.: Mercearia do João" autocomplete="off"></div>
      <div class="campo"><label for="n-user">Usuário (para entrar)</label><input type="text" id="n-user" name="usuario" required placeholder="Ex.: joao" autocapitalize="none" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="n-senha">Senha</label><div class="senha-wrap"><input type="text" id="n-senha" name="senha" required minlength="6" autocomplete="off" spellcheck="false"><button type="button" class="ver-senha" data-gerar="n-senha" aria-label="Gerar uma senha"><i class="ph ph-magic-wand"></i></button></div><small class="ajuda">Toque na varinha para gerar uma senha fácil de ler.</small></div>
      <div class="campo"><label for="n-dias">Dias de teste</label><input type="number" id="n-dias" name="dias" min="0" max="3650" value="7" inputmode="numeric"><small class="ajuda">Depois desses dias o acesso é bloqueado até você liberar. Deixe 0 para não ter limite.</small></div>
      <label class="check"><input type="checkbox" name="admin"><span><b>Também é administrador</b><small>Pode criar usuários e trocar senhas.</small></span></label>
      <button class="btn btn-primary" type="submit"><i class="ph ph-user-plus"></i>Criar usuário</button>
    </form>
  </section>

  <section class="card adm-bloco adm-lista">
    <h2>Usuários <span class="adm-qtd"><?= count($lista) ?></span></h2>
    <div class="adm-tab"><table class="tb">
      <thead><tr><th><span class="th-bt">Nome</span></th><th><span class="th-bt">Usuário</span></th><th><span class="th-bt">Perfil</span></th><th><span class="th-bt">Situação</span></th><th><span class="th-bt">Teste</span></th><th><span class="th-bt">Ações</span></th></tr></thead>
      <tbody>
      <?php foreach ($lista as $u): $meu = $u['id'] === $eu['id']; ?>
        <tr style="cursor:default">
          <td title="Criado em <?= cf_h($u['criado'] ?? '') ?>"><b><?= cf_h($u['nome']) ?></b><?= $meu ? ' <span class="badge">você</span>' : '' ?></td>
          <td class="dt" data-l="Usuário"><?= cf_h($u['usuario']) ?></td>
          <td data-l="Perfil"><?= !empty($u['admin']) ? '<span class="badge st-hoje"><i class="ph ph-shield-check"></i>Administrador</span>' : '<span class="badge">Usuário</span>' ?></td>
          <td data-l="Situação"><?= !empty($u['ativo']) ? '<span class="badge st-pago"><i class="ph ph-check-circle"></i>Ativo</span>' : '<span class="badge st-atrasado"><i class="ph ph-prohibit"></i>Desativado</span>' ?></td>
          <td data-l="Teste"><?php
            if (!empty($u['admin'])) echo '<span class="dt">—</span>';
            elseif (empty($u['ate'])) echo '<span class="badge st-pago"><i class="ph ph-infinity"></i>Liberado</span>';
            elseif (cf_expirado($u)) echo '<span class="badge st-atrasado"><i class="ph ph-hourglass-low"></i>Terminou em ' . cf_h(cf_data_br($u['ate'])) . '</span>';
            else { $r = cf_dias_restantes($u); echo '<span class="badge ' . ($r <= 2 ? 'st-hoje' : '') . '"><i class="ph ph-hourglass-medium"></i>' . ($r === 0 ? 'Termina hoje' : 'Faltam ' . $r . ' dia' . ($r > 1 ? 's' : '')) . ' · ' . cf_h(cf_data_br($u['ate'])) . '</span>'; }
          ?></td>
          <td class="td-acoes">
            <div class="adm-acoes">
              <button class="btn btn-pq" type="button" data-senha="<?= cf_h($u['id']) ?>" data-nome="<?= cf_h($u['nome']) ?>" data-tip="Criar uma nova senha para <?= cf_h($u['nome']) ?>" aria-label="Nova senha"><i class="ph ph-key"></i></button>
              <?php if (!$meu): ?>
                <?php if (empty($u['admin'])): ?><button class="btn btn-pq" type="button" data-periodo="<?= cf_h($u['id']) ?>" data-nome="<?= cf_h($u['nome']) ?>" data-tip="Período de teste: definir dias ou liberar sem limite" aria-label="Período de teste"><i class="ph ph-calendar-check"></i></button><?php endif; ?>
                <form method="post"><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="ativo"><button class="btn btn-pq" type="submit" data-tip="<?= !empty($u['ativo']) ? 'Desativar: a pessoa deixa de conseguir entrar' : 'Reativar: a pessoa volta a poder entrar' ?>" aria-label="<?= !empty($u['ativo']) ? 'Desativar' : 'Reativar' ?>"><?= !empty($u['ativo']) ? '<i class="ph ph-prohibit"></i>' : '<i class="ph ph-check"></i>' ?></button></form>
                <form method="post"><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="perfil"><button class="btn btn-pq" type="submit" data-tip="<?= !empty($u['admin']) ? 'Tirar admin: a pessoa deixa de gerenciar usuários' : 'Tornar admin: a pessoa poderá gerenciar usuários' ?>" aria-label="<?= !empty($u['admin']) ? 'Tirar admin' : 'Tornar admin' ?>"><i class="ph ph-shield"></i></button></form>
                <form method="post" data-confirma="Excluir o acesso de <?= cf_h($u['nome']) ?>? Isso não apaga os dados dele no aparelho."><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="excluir"><button class="btn btn-pq btn-perigo" type="submit" data-tip="Excluir o acesso desta pessoa" aria-label="Excluir"><i class="ph ph-trash"></i></button></form>
              <?php endif; ?>
            </div>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
  </section>

  <dialog id="dlg-periodo" class="adm-dlg">
    <form method="post">
      <h2>Período de acesso</h2>
      <p class="aut-sub" id="dlg-periodo-nome"></p>
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="acao" value="periodo"><input type="hidden" name="id" id="dlg-periodo-id">
      <div class="campo"><label for="dlg-dias">Liberar por quantos dias, a partir de hoje?</label><input type="number" id="dlg-dias" name="dias" min="1" max="3650" value="7" inputmode="numeric"><small class="ajuda">Ex.: 7 para um teste, 30 para um mês pago. Depois da data, o acesso é bloqueado.</small></div>
      <div class="adm-dlg-acoes"><button class="btn btn-primary" type="submit" name="modo" value="dias"><i class="ph ph-check"></i>Salvar dias</button><button class="btn" type="submit" name="modo" value="liberar" formnovalidate><i class="ph ph-infinity"></i>Liberar sem limite</button><button class="btn" type="button" data-fechar>Cancelar</button></div>
    </form>
  </dialog>

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
