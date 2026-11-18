<?php
define('CF', 1); require __DIR__ . '/auth.php';
$eu = cf_exigir_admin();
$msg = $_GET['m'] ?? ''; $erro = '';
$MSG = array('criado' => 'Usuário criado.', 'senha' => 'Senha alterada.', 'ativo' => 'Situação do acesso alterada.', 'perfil' => 'Perfil alterado.', 'excluido' => 'Usuário excluído.', 'periodo' => 'Período de acesso atualizado.', 'banco' => 'Banco de dados conectado e pronto.');
$modo_banco = cf_modo_banco();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $acao = $_POST['acao'] ?? ''; $id = $_POST['id'] ?? ''; $ok = 'x';
    if (!cf_csrf_ok()) $erro = 'A página expirou. Tente de novo.';
    elseif ($acao === 'banco') {
        $ant = cf_ler('banco', array());
        $c = array('host' => trim($_POST['host'] ?? ''), 'banco' => trim($_POST['banco'] ?? ''), 'usuario' => trim($_POST['bd_usuario'] ?? ''), 'senha' => $_POST['bd_senha'] ?? '');
        if ($c['senha'] === '' && !empty($ant['senha'])) $c['senha'] = $ant['senha'];
        if ($c['host'] === '' || $c['banco'] === '' || $c['usuario'] === '') $erro = 'Preencha o endereço, o nome do banco e o usuário.';
        else {
            try {
                $p = cf_db_abrir($c); cf_db_instalar($p); cf_db_importar($p);
                if (cf_gravar('banco', $c)) $ok = 'banco'; else $erro = 'Conectei, mas não consegui guardar a configuração. Confira se a pasta do site permite gravar arquivos.';
            } catch (Exception $e) { $erro = 'Não consegui conectar ao banco: ' . $e->getMessage(); }
        }
    }
    elseif (!$modo_banco) $erro = 'Primeiro conecte o banco de dados.';
    elseif ($acao === 'criar') {
        $login = trim($_POST['usuario'] ?? ''); $nome = trim($_POST['nome'] ?? ''); $s = $_POST['senha'] ?? ''; $com = $_POST['comercio'] ?? 'novo';
        if ($nome === '' || $login === '') $erro = 'Preencha o nome e o usuário.';
        elseif (!preg_match('/^[a-z0-9._-]{3,30}$/i', $login)) $erro = 'O usuário deve ter de 3 a 30 letras, números, ponto ou traço (sem espaços).';
        elseif (cf_u_login($login)) $erro = 'Já existe um usuário com esse nome de acesso.';
        elseif (!cf_senha_ok($s)) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
        elseif ($com !== 'novo' && count(cf_u_equipe($com)) >= CF_MAX_EQUIPE) $erro = 'Esse comércio já tem o máximo de ' . CF_MAX_EQUIPE . ' usuários.';
        else {
            $admin = !empty($_POST['admin']);
            if ($com === 'novo') {
                $dias = (int)($_POST['dias'] ?? 0);
                $cid = cf_c_criar($nome, ($dias > 0 && !$admin) ? cf_ate(min($dias, 3650)) : null); $dono = true;
            } else { $cid = $com; $dono = false; }
            if (cf_u_criar($cid, $login, $nome, $s, $admin, $dono)) $ok = 'criado'; else $erro = 'Não consegui criar o usuário.';
        }
    } else {
        $alvo = cf_u_id($id);
        if (!$alvo) $erro = 'Usuário não encontrado.';
        elseif ($acao === 'senha') {
            if (!cf_senha_ok($_POST['nova'] ?? '')) $erro = 'A senha precisa ter pelo menos 6 caracteres.';
            else { cf_u_set($id, array('hash' => password_hash($_POST['nova'], PASSWORD_DEFAULT))); $ok = 'senha'; }
        } elseif ($acao === 'ativo') {
            if ($id === $eu['id']) $erro = 'Você não pode desativar o seu próprio acesso.';
            elseif ($alvo['ativo'] && $alvo['admin'] && cf_u_admins_ativos($id) < 1) $erro = 'É preciso manter pelo menos um administrador ativo.';
            else { cf_u_set($id, array('ativo' => !$alvo['ativo'])); $ok = 'ativo'; }
        } elseif ($acao === 'perfil') {
            if ($id === $eu['id']) $erro = 'Você não pode mudar o seu próprio perfil.';
            else { cf_u_set($id, array('admin' => !$alvo['admin'])); $ok = 'perfil'; }
        } elseif ($acao === 'periodo') {
            if ($alvo['admin']) $erro = 'Administradores não têm período de teste.';
            elseif (($_POST['modo'] ?? '') === 'liberar') { cf_c_ate($alvo['cid'], null); $ok = 'periodo'; }
            else {
                $dias = (int)($_POST['dias'] ?? 0);
                if ($dias < 1 || $dias > 3650) $erro = 'Informe de 1 a 3650 dias.';
                else { cf_c_ate($alvo['cid'], cf_ate($dias)); $ok = 'periodo'; }
            }
        } elseif ($acao === 'excluir') {
            if ($id === $eu['id']) $erro = 'Você não pode excluir o seu próprio acesso.';
            else { cf_u_excluir($id); $ok = 'excluido'; }
        }
    }
    if (!$erro && $ok !== 'x') cf_ir('admin.php?m=' . $ok);
}
$lista = $modo_banco ? cf_u_todos() : array();
$comercios = $modo_banco ? cf_c_todos() : array();
$cfg = cf_ler('banco', array());

cf_topo('Administração');
?>
<main class="adm">
  <header class="adm-topo">
    <div><?= cf_marca() ?><h1>Administração de usuários</h1><p class="aut-sub">Conecte o banco, crie comércios e acessos, troque senhas e controle o período de teste.</p></div>
    <div class="adm-links"><a class="btn" href="<?= cf_h(cf_url('')) ?>"><i class="ph ph-arrow-left"></i>Voltar ao sistema</a><a class="btn" href="senha.php"><i class="ph ph-key"></i>Minha senha</a><a class="btn" href="sair.php"><i class="ph ph-sign-out"></i>Sair</a></div>
  </header>
  <?php if ($msg && isset($MSG[$msg])): ?><div class="aut-ok" role="status"><i class="ph ph-check-circle"></i><span><?= cf_h($MSG[$msg]) ?></span></div><?php endif; ?>
  <?php if ($erro): ?><div class="aut-erro" role="alert"><i class="ph ph-warning-circle"></i><span><?= cf_h($erro) ?></span></div><?php endif; ?>

  <section class="card adm-bloco">
    <h2>Banco de dados <?php if ($modo_banco): ?><span class="badge st-pago"><i class="ph ph-check-circle"></i>Conectado</span><?php else: ?><span class="badge st-atrasado"><i class="ph ph-warning"></i>Não configurado</span><?php endif; ?></h2>
    <?php if (!$modo_banco): ?><p class="aut-sub">Os dados dos comércios ficam num banco MySQL da Locaweb. Preencha uma vez com os dados do banco (painel da Locaweb). Os usuários que já existem serão trazidos para o banco automaticamente.</p><?php endif; ?>
    <form method="post" class="adm-novo">
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="acao" value="banco">
      <div class="campo"><label for="b-host">Endereço do banco</label><input type="text" id="b-host" name="host" required value="<?= cf_h($cfg['host'] ?? 'caderno_fiado.mysql.dbaas.com.br') ?>" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="b-banco">Nome do banco</label><input type="text" id="b-banco" name="banco" required value="<?= cf_h($cfg['banco'] ?? 'caderno_fiado') ?>" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="b-user">Usuário do banco</label><input type="text" id="b-user" name="bd_usuario" required value="<?= cf_h($cfg['usuario'] ?? 'caderno_fiado') ?>" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="b-senha">Senha do banco</label><div class="senha-wrap"><input type="password" id="b-senha" name="bd_senha" autocomplete="new-password" <?= $modo_banco ? 'placeholder="Deixe vazio para manter a atual"' : 'required' ?>><button type="button" class="ver-senha" data-ver="b-senha" aria-label="Mostrar ou esconder a senha"><i class="ph ph-eye"></i></button></div></div>
      <button class="btn btn-primary" type="submit"><i class="ph ph-plugs-connected"></i><?= $modo_banco ? 'Testar e salvar' : 'Conectar banco' ?></button>
    </form>
  </section>
<?php if ($modo_banco): ?>
  <section class="card adm-bloco">
    <h2>Novo usuário</h2>
    <form method="post" class="adm-novo">
      <input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="acao" value="criar">
      <div class="campo"><label for="n-nome">Nome da pessoa</label><input type="text" id="n-nome" name="nome" required placeholder="Ex.: Mercearia do João" autocomplete="off"></div>
      <div class="campo"><label for="n-user">Usuário (para entrar)</label><input type="text" id="n-user" name="usuario" required placeholder="Ex.: joao" autocapitalize="none" autocomplete="off" spellcheck="false"></div>
      <div class="campo"><label for="n-senha">Senha</label><div class="senha-wrap"><input type="text" id="n-senha" name="senha" required minlength="6" autocomplete="off" spellcheck="false"><button type="button" class="ver-senha" data-gerar="n-senha" aria-label="Gerar uma senha"><i class="ph ph-magic-wand"></i></button></div><small class="ajuda">Toque na varinha para gerar uma senha fácil de ler.</small></div>
      <div class="campo"><label for="n-com">Comércio</label><select id="n-com" name="comercio"><option value="novo">Novo comércio (com o nome da pessoa)</option><?php foreach ($comercios as $c): ?><option value="<?= cf_h($c['id']) ?>">Adicionar a: <?= cf_h($c['nome']) ?></option><?php endforeach; ?></select><small class="ajuda">Para dar acesso a mais alguém do mesmo comércio, escolha o comércio dele.</small></div>
      <div class="campo"><label for="n-dias">Dias de teste</label><input type="number" id="n-dias" name="dias" min="0" max="3650" value="7" inputmode="numeric"><small class="ajuda">Depois desses dias o acesso é bloqueado até você liberar. Deixe 0 para não ter limite. Só vale para comércio novo.</small></div>
      <label class="check"><input type="checkbox" name="admin"><span><b>Também é administrador</b><small>Pode criar usuários e trocar senhas.</small></span></label>
      <button class="btn btn-primary" type="submit"><i class="ph ph-user-plus"></i>Criar usuário</button>
    </form>
  </section>

  <section class="card adm-bloco adm-lista">
    <h2>Usuários <span class="adm-qtd"><?= count($lista) ?></span></h2>
    <div class="adm-tab"><table class="tb">
      <thead><tr><th><span class="th-bt">Nome</span></th><th><span class="th-bt">Usuário</span></th><th><span class="th-bt">Comércio</span></th><th><span class="th-bt">Perfil</span></th><th><span class="th-bt">Situação</span></th><th><span class="th-bt">Teste</span></th><th><span class="th-bt">Ações</span></th></tr></thead>
      <tbody>
      <?php foreach ($lista as $u): $meu = $u['id'] === $eu['id']; ?>
        <tr style="cursor:default">
          <td title="Criado em <?= cf_h($u['criado'] ?? '') ?>"><b><?= cf_h($u['nome']) ?></b><?= $meu ? ' <span class="badge">você</span>' : '' ?></td>
          <td class="dt" data-l="Usuário"><?= cf_h($u['usuario']) ?></td>
          <td data-l="Comércio"><?= cf_h($u['cnome']) ?></td>
          <td data-l="Perfil"><?= !empty($u['admin']) ? '<span class="badge st-hoje"><i class="ph ph-shield-check"></i>Administrador</span>' : (!empty($u['dono']) ? '<span class="badge">Dono</span>' : '<span class="badge">Equipe</span>') ?></td>
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
                <?php if (empty($u['admin'])): ?><button class="btn btn-pq" type="button" data-periodo="<?= cf_h($u['id']) ?>" data-nome="<?= cf_h($u['nome']) ?>" data-tip="Período de teste do comércio todo: definir dias ou liberar sem limite" aria-label="Período de teste"><i class="ph ph-calendar-check"></i></button><?php endif; ?>
                <form method="post"><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="ativo"><button class="btn btn-pq" type="submit" data-tip="<?= !empty($u['ativo']) ? 'Desativar: a pessoa deixa de conseguir entrar' : 'Reativar: a pessoa volta a poder entrar' ?>" aria-label="<?= !empty($u['ativo']) ? 'Desativar' : 'Reativar' ?>"><?= !empty($u['ativo']) ? '<i class="ph ph-prohibit"></i>' : '<i class="ph ph-check"></i>' ?></button></form>
                <form method="post"><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="perfil"><button class="btn btn-pq" type="submit" data-tip="<?= !empty($u['admin']) ? 'Tirar admin: a pessoa deixa de gerenciar usuários' : 'Tornar admin: a pessoa poderá gerenciar usuários' ?>" aria-label="<?= !empty($u['admin']) ? 'Tirar admin' : 'Tornar admin' ?>"><i class="ph ph-shield"></i></button></form>
                <form method="post" data-confirma="Excluir o acesso de <?= cf_h($u['nome']) ?>? Os dados do comércio continuam guardados."><input type="hidden" name="csrf" value="<?= cf_csrf() ?>"><input type="hidden" name="id" value="<?= cf_h($u['id']) ?>"><input type="hidden" name="acao" value="excluir"><button class="btn btn-pq btn-perigo" type="submit" data-tip="Excluir o acesso desta pessoa" aria-label="Excluir"><i class="ph ph-trash"></i></button></form>
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
<?php endif; ?>
</main>
<?php cf_rodape();
