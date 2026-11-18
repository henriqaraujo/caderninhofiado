<?php
/* Caderninho do Fiado - acesso com usuário e senha.
   Os usuários ficam numa pasta própria (_dados_caderninho), fora da pasta do sistema,
   para o envio automático do site nunca apagar nem sobrescrever. */
if (!defined('CF')) { http_response_code(403); exit; }

@date_default_timezone_set('America/Sao_Paulo');
define('CF_COOKIE', 'cf_acesso');
define('CF_DIAS', 30);            // quantos dias o usuário continua logado
define('CF_MAX_ERROS', 5);        // erros de senha antes de bloquear
define('CF_BLOQUEIO_MIN', 10);    // minutos de bloqueio

function cf_pasta() {
    $d = getenv('CF_DADOS');
    if (!$d) $d = dirname(__DIR__) . '/_dados_caderninho';
    if (!is_dir($d)) {
        @mkdir($d, 0755, true);
        @file_put_contents($d . '/.htaccess', "Require all denied\nDeny from all\n");
        @file_put_contents($d . '/index.html', '');
    }
    return $d;
}
/* arquivos de dados começam com uma linha PHP que bloqueia a leitura pelo navegador */
function cf_ler($nome, $padrao) {
    $f = cf_pasta() . '/' . $nome . '.php';
    if (!is_file($f)) return $padrao;
    $t = file_get_contents($f);
    $t = substr($t, strpos($t, "\n") + 1);
    $j = json_decode($t, true);
    return is_array($j) ? $j : $padrao;
}
function cf_gravar($nome, $dados) {
    $f = cf_pasta() . '/' . $nome . '.php';
    $tmp = $f . '.tmp' . getmypid();
    $ok = @file_put_contents($tmp, "<?php http_response_code(403); exit; ?>\n" . json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    if ($ok === false) return false;
    return @rename($tmp, $f);
}
function cf_segredo() {
    $s = cf_ler('segredo', array());
    if (empty($s['k'])) { $s = array('k' => bin2hex(random_bytes(32))); cf_gravar('segredo', $s); }
    return $s['k'];
}
function cf_usuarios() { return cf_ler('usuarios', array()); }
function cf_salvar_usuarios($l) { return cf_gravar('usuarios', array_values($l)); }
function cf_achar($lista, $campo, $valor) {
    foreach ($lista as $u) if (isset($u[$campo]) && $u[$campo] === $valor) return $u;
    return null;
}
function cf_h($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function cf_https() { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'); }
function cf_url($arq) { $b = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\'); return $b . '/' . $arq; }
function cf_ir($arq) { header('Location: ' . cf_url($arq)); exit; }

/* ---- sessão por cookie assinado (não depende de sessão do servidor) ---- */
function cf_assinar($txt) { return hash_hmac('sha256', $txt, cf_segredo()); }
function cf_entrar($u) {
    $exp = time() + CF_DIAS * 86400;
    $corpo = $u['id'] . '.' . $exp . '.' . substr(md5($u['hash']), 0, 12);
    $val = $corpo . '.' . cf_assinar($corpo);
    setcookie(CF_COOKIE, $val, array('expires' => $exp, 'path' => '/', 'secure' => cf_https(), 'httponly' => true, 'samesite' => 'Lax'));
    $_COOKIE[CF_COOKIE] = $val;
}
function cf_sair() {
    setcookie(CF_COOKIE, '', array('expires' => 1, 'path' => '/', 'secure' => cf_https(), 'httponly' => true, 'samesite' => 'Lax'));
    unset($_COOKIE[CF_COOKIE]);
}
/* Período de teste: o campo 'ate' (AAAA-MM-DD) é o último dia de acesso. Sem 'ate' = acesso liberado.
   Administradores nunca expiram. */
function cf_ate($dias) { return date('Y-m-d', strtotime('+' . (int)$dias . ' days')); }
function cf_expirado($u) {
    if (!empty($u['admin']) || empty($u['ate'])) return false;
    return date('Y-m-d') > $u['ate'];
}
function cf_dias_restantes($u) {
    if (empty($u['ate'])) return null;
    return (int) floor((strtotime($u['ate']) - strtotime(date('Y-m-d'))) / 86400);
}
function cf_data_br($d) { return $d ? date('d/m/Y', strtotime($d)) : ''; }
function cf_atual() {
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;
    if (empty($_COOKIE[CF_COOKIE])) return null;
    $p = explode('.', $_COOKIE[CF_COOKIE]);
    if (count($p) !== 4) return null;
    list($id, $exp, $marca, $ass) = $p;
    if (!hash_equals(cf_assinar($id . '.' . $exp . '.' . $marca), $ass)) return null;
    if ((int)$exp < time()) return null;
    $u = cf_u_id($id);
    if (!$u || empty($u['ativo'])) return null;
    if (substr(md5($u['hash']), 0, 12) !== $marca) return null;   // trocou a senha: sai de todos os aparelhos
    if (cf_expirado($u)) { $GLOBALS['cf_expirou'] = $u; return null; }
    return $cache = $u;
}
function cf_exigir_login() {
    if (!cf_atual()) {
        if (!empty($GLOBALS['cf_expirou'])) {
            http_response_code(403); cf_topo('Período de teste encerrado');
            echo '<main class="aut"><section class="card aut-card">' . cf_marca() . '<h1>Seu período de teste terminou</h1><p class="aut-sub">Para continuar usando o Caderninho do Fiado, fale com o administrador para liberar o seu acesso. Seus dados continuam salvos neste aparelho.</p><a class="btn btn-primary" href="sair.php"><i class="ph ph-sign-out"></i>Sair</a></section></main>';
            cf_rodape(); exit;
        }
        cf_ir('login.php');
    }
    return cf_atual();
}
function cf_exigir_admin() {
    $u = cf_exigir_login();
    if (empty($u['admin'])) { http_response_code(403); cf_topo('Sem permissão'); echo '<main class="aut"><section class="card aut-card"><h1>Sem permissão</h1><p>Esta página é só para o administrador.</p><a class="btn btn-primary" href="' . cf_h(cf_url('')) . '">Voltar ao sistema</a></section></main>'; cf_rodape(); exit; }
    return $u;
}
function cf_csrf() { $u = cf_atual(); return cf_assinar('csrf|' . ($u ? $u['id'] . $u['hash'] : 'x')); }
function cf_csrf_ok() { return isset($_POST['csrf']) && hash_equals(cf_csrf(), (string)$_POST['csrf']); }

/* ---- bloqueio de tentativas ---- */
function cf_chave($usuario) { return sha1(($_SERVER['REMOTE_ADDR'] ?? '') . '|' . strtolower($usuario)); }
function cf_bloqueado($usuario) {
    $t = cf_ler('tentativas', array()); $k = cf_chave($usuario);
    return isset($t[$k]) && !empty($t[$k]['ate']) && $t[$k]['ate'] > time() ? (int)ceil(($t[$k]['ate'] - time()) / 60) : 0;
}
function cf_falha($usuario) {
    $t = cf_ler('tentativas', array()); $k = cf_chave($usuario);
    foreach ($t as $kk => $v) if (!empty($v['ate']) && $v['ate'] < time() - 86400) unset($t[$kk]);
    $n = (isset($t[$k]['n']) ? $t[$k]['n'] : 0) + 1;
    $t[$k] = array('n' => $n, 'ate' => $n >= CF_MAX_ERROS ? time() + CF_BLOQUEIO_MIN * 60 : 0);
    if ($n >= CF_MAX_ERROS) $t[$k]['n'] = 0;
    cf_gravar('tentativas', $t);
}
function cf_limpar_falhas($usuario) { $t = cf_ler('tentativas', array()); unset($t[cf_chave($usuario)]); cf_gravar('tentativas', $t); }

function cf_senha_ok($s) { return is_string($s) && strlen($s) >= 6 && strlen($s) <= 100; }
function cf_novo_usuario($usuario, $nome, $senha, $admin) {
    return array('id' => bin2hex(random_bytes(6)), 'usuario' => strtolower(trim($usuario)), 'nome' => trim($nome),
        'hash' => password_hash($senha, PASSWORD_DEFAULT), 'admin' => (bool)$admin, 'ativo' => true, 'criado' => date('Y-m-d H:i'));
}

/* ---- visual das páginas (usa o mesmo estilo do sistema) ---- */
function cf_topo($titulo) {
    header('Cache-Control: no-store');
    $base = cf_url('');
    echo '<!DOCTYPE html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
    echo '<title>' . cf_h($titulo) . ' · Caderninho do Fiado</title><meta name="robots" content="noindex">';
    echo '<link rel="icon" href="' . $base . 'icons/icon.svg" type="image/svg+xml">';
    echo '<script>(function(){try{var d=JSON.parse(localStorage.getItem("caderninho-fiado-v1")||"{}");var t=localStorage.getItem("cf-tema")||(d.config&&d.config.tema)||"auto";var k=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",k?"dark":"light");}catch(e){}})();</script>';
    $v = static function ($f) { return '?v=' . (int) @filemtime(__DIR__ . '/' . $f); };
    echo '<link rel="stylesheet" href="' . $base . 'css/ph.css' . $v('css/ph.css') . '"><link rel="stylesheet" href="' . $base . 'css/app.css' . $v('css/app.css') . '"><link rel="stylesheet" href="' . $base . 'css/acesso.css' . $v('css/acesso.css') . '"></head><body class="pag-acesso">';
}
function cf_rodape() { echo '<script src="' . cf_url('js/acesso.js') . '?v=' . (int) @filemtime(__DIR__ . '/js/acesso.js') . '"></script></body></html>'; }
function cf_marca() { return '<div class="aut-marca"><span class="brand-mark"><i class="ph ph-notebook"></i></span><strong>Caderninho do Fiado</strong></div>'; }
function cf_campo_senha($id, $nome, $rotulo, $auto = 'new-password') {
    return '<div class="campo"><label for="' . $id . '">' . $rotulo . '</label><div class="senha-wrap"><input type="password" id="' . $id . '" name="' . $nome . '" autocomplete="' . $auto . '" required minlength="6"><button type="button" class="ver-senha" data-ver="' . $id . '" aria-label="Mostrar ou esconder a senha"><i class="ph ph-eye"></i></button></div></div>';
}

require __DIR__ . '/db.php';
