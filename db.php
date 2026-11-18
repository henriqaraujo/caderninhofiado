<?php
/* Caderninho do Fiado - banco de dados (MySQL da Locaweb).
   Os dados de acesso ao banco ficam em _dados_caderninho/banco.php (fora do GitHub). */
if (!defined('CF')) { http_response_code(403); exit; }

define('CF_MAX_EQUIPE', 5);   // usuários por comércio (dono + equipe)

/* ---- conexão ---- */
function cf_db_config() { $c = cf_ler('banco', array()); return !empty($c['host']) && !empty($c['banco']) ? $c : null; }
function cf_modo_banco() { return cf_db_config() !== null; }
function cf_db_abrir($c) {
    $dsn = 'mysql:host=' . $c['host'] . (!empty($c['porta']) ? ';port=' . (int)$c['porta'] : '') . ';dbname=' . $c['banco'] . ';charset=utf8mb4';
    return new PDO($dsn, $c['usuario'], $c['senha'], array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 8, PDO::ATTR_EMULATE_PREPARES => false));
}
function cf_db() {
    static $pdo = false;
    if ($pdo !== false) return $pdo;
    $pdo = null; $c = cf_db_config();
    if (!$c) return null;
    try { $pdo = cf_db_abrir($c); }
    catch (Exception $e) { $GLOBALS['cf_db_erro'] = $e->getMessage(); $pdo = null; }
    return $pdo;
}
/* configurado mas sem conexão: mostra aviso em vez de deixar entrar sem conferir a senha */
function cf_db_exigir() {
    if (!cf_modo_banco()) return null;
    $p = cf_db();
    if ($p) return $p;
    http_response_code(503); cf_topo('Indisponível');
    echo '<main class="aut"><section class="card aut-card">' . cf_marca() . '<h1>Sistema indisponível</h1><p class="aut-sub">Não consegui falar com o banco de dados agora. Tente de novo em alguns minutos.</p></section></main>';
    cf_rodape(); exit;
}

function cf_db_instalar($pdo) {
    $t = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $pdo->exec('CREATE TABLE IF NOT EXISTS comercios (id CHAR(12) NOT NULL PRIMARY KEY, nome VARCHAR(120) NOT NULL, ate DATE NULL, criado DATETIME NOT NULL)' . $t);
    $pdo->exec('CREATE TABLE IF NOT EXISTS usuarios (id CHAR(12) NOT NULL PRIMARY KEY, cid CHAR(12) NOT NULL, usuario VARCHAR(30) NOT NULL, nome VARCHAR(120) NOT NULL, hash VARCHAR(255) NOT NULL, admin TINYINT(1) NOT NULL DEFAULT 0, dono TINYINT(1) NOT NULL DEFAULT 0, ativo TINYINT(1) NOT NULL DEFAULT 1, criado DATETIME NOT NULL, UNIQUE KEY u_usuario (usuario), KEY k_cid (cid))' . $t);
    $pdo->exec('CREATE TABLE IF NOT EXISTS dados (cid CHAR(12) NOT NULL PRIMARY KEY, versao INT UNSIGNED NOT NULL, conteudo MEDIUMTEXT NOT NULL, atualizado DATETIME NOT NULL, por VARCHAR(30) NULL)' . $t);
    $pdo->exec('CREATE TABLE IF NOT EXISTS dados_bkp (cid CHAR(12) NOT NULL, dia DATE NOT NULL, conteudo MEDIUMTEXT NOT NULL, PRIMARY KEY (cid, dia))' . $t);
}
/* traz os usuários do arquivo antigo (usuarios.php) para o banco, uma única vez */
function cf_db_importar($pdo) {
    if ((int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) return 0;
    $n = 0;
    foreach (cf_ler('usuarios', array()) as $u) {
        $cid = bin2hex(random_bytes(6));
        $criado = !empty($u['criado']) ? $u['criado'] . ':00' : date('Y-m-d H:i:s');
        $pdo->prepare('INSERT INTO comercios (id, nome, ate, criado) VALUES (?,?,?,?)')->execute(array($cid, $u['nome'], !empty($u['ate']) && empty($u['admin']) ? $u['ate'] : null, $criado));
        $pdo->prepare('INSERT INTO usuarios (id, cid, usuario, nome, hash, admin, dono, ativo, criado) VALUES (?,?,?,?,?,?,1,?,?)')
            ->execute(array($u['id'], $cid, $u['usuario'], $u['nome'], $u['hash'], !empty($u['admin']) ? 1 : 0, !empty($u['ativo']) ? 1 : 0, $criado));
        $n++;
    }
    return $n;
}

/* ---- usuários e comércios ---- */
function cf_u_linha($r) {
    $u = array('id' => $r['id'], 'cid' => $r['cid'], 'usuario' => $r['usuario'], 'nome' => $r['nome'], 'hash' => $r['hash'],
        'admin' => (bool)$r['admin'], 'dono' => (bool)$r['dono'], 'ativo' => (bool)$r['ativo'], 'criado' => $r['criado'], 'cnome' => $r['cnome']);
    if (!empty($r['ate'])) $u['ate'] = $r['ate'];
    return $u;
}
function cf_u_sql() { return 'SELECT u.*, c.nome AS cnome, c.ate AS ate FROM usuarios u JOIN comercios c ON c.id = u.cid'; }
function cf_u_todos() {
    if (!cf_modo_banco()) {
        $l = cf_ler('usuarios', array());
        foreach ($l as &$u) { $u['cid'] = 'arquivo'; $u['dono'] = true; $u['cnome'] = $u['nome']; } unset($u);
        return $l;
    }
    $p = cf_db_exigir(); $o = array();
    foreach ($p->query(cf_u_sql() . ' ORDER BY c.nome, u.dono DESC, u.nome')->fetchAll() as $r) $o[] = cf_u_linha($r);
    return $o;
}
function cf_u_achar($campo, $valor) {
    if (!cf_modo_banco()) { $u = cf_achar(cf_u_todos(), $campo, $valor); return $u; }
    $p = cf_db_exigir();
    $col = $campo === 'id' ? 'u.id' : 'u.usuario';
    $s = $p->prepare(cf_u_sql() . ' WHERE ' . $col . ' = ? LIMIT 1'); $s->execute(array($valor));
    $r = $s->fetch(); return $r ? cf_u_linha($r) : null;
}
function cf_u_id($id) { return cf_u_achar('id', $id); }
function cf_u_login($login) { return cf_u_achar('usuario', strtolower($login)); }
function cf_u_equipe($cid) {
    $p = cf_db_exigir(); $s = $p->prepare(cf_u_sql() . ' WHERE u.cid = ? ORDER BY u.dono DESC, u.nome'); $s->execute(array($cid));
    $o = array(); foreach ($s->fetchAll() as $r) $o[] = cf_u_linha($r); return $o;
}
function cf_c_todos() {
    $p = cf_db_exigir(); return $p->query('SELECT id, nome, ate FROM comercios ORDER BY nome')->fetchAll();
}
function cf_c_criar($nome, $ate) {
    $p = cf_db_exigir(); $id = bin2hex(random_bytes(6));
    $p->prepare('INSERT INTO comercios (id, nome, ate, criado) VALUES (?,?,?,?)')->execute(array($id, $nome, $ate, date('Y-m-d H:i:s')));
    return $id;
}
function cf_c_ate($cid, $ate) { cf_db_exigir()->prepare('UPDATE comercios SET ate = ? WHERE id = ?')->execute(array($ate, $cid)); }

/* cria o usuário; devolve o usuário ou null se o nome de acesso já existe */
function cf_u_criar($cid, $login, $nome, $senha, $admin, $dono) {
    $u = array('id' => bin2hex(random_bytes(6)), 'cid' => $cid, 'usuario' => strtolower(trim($login)), 'nome' => trim($nome),
        'hash' => password_hash($senha, PASSWORD_DEFAULT), 'admin' => (bool)$admin, 'dono' => (bool)$dono, 'ativo' => true, 'criado' => date('Y-m-d H:i'));
    if (!cf_modo_banco()) {
        $l = cf_ler('usuarios', array()); $l[] = $u;
        return cf_gravar('usuarios', array_values($l)) ? $u : null;
    }
    $p = cf_db_exigir();
    try {
        $p->prepare('INSERT INTO usuarios (id, cid, usuario, nome, hash, admin, dono, ativo, criado) VALUES (?,?,?,?,?,?,?,1,?)')
          ->execute(array($u['id'], $cid, $u['usuario'], $u['nome'], $u['hash'], (int)$u['admin'], (int)$u['dono'], date('Y-m-d H:i:s')));
    } catch (PDOException $e) { return null; }
    return $u;
}
/* muda campos de um usuário: hash, ativo, admin */
function cf_u_set($id, $campos) {
    if (!cf_modo_banco()) {
        $l = cf_ler('usuarios', array());
        foreach ($l as &$x) if ($x['id'] === $id) foreach ($campos as $k => $v) $x[$k] = $v; unset($x);
        return cf_gravar('usuarios', array_values($l));
    }
    $set = array(); $val = array();
    foreach ($campos as $k => $v) { if (!in_array($k, array('hash', 'ativo', 'admin'), true)) continue; $set[] = $k . ' = ?'; $val[] = is_bool($v) ? (int)$v : $v; }
    if (!$set) return true;
    $val[] = $id;
    cf_db_exigir()->prepare('UPDATE usuarios SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($val);
    return true;
}
function cf_u_excluir($id) { cf_db_exigir()->prepare('DELETE FROM usuarios WHERE id = ?')->execute(array($id)); }
function cf_u_admins_ativos($ignorar = '') {
    $n = 0; foreach (cf_u_todos() as $u) if ($u['id'] !== $ignorar && !empty($u['admin']) && !empty($u['ativo'])) $n++; return $n;
}

/* ---- dados do comércio (o caderninho) ---- */
function cf_d_ler($cid) {
    $s = cf_db_exigir()->prepare('SELECT versao, conteudo FROM dados WHERE cid = ?'); $s->execute(array($cid));
    $r = $s->fetch(); return $r ? array('versao' => (int)$r['versao'], 'dados' => json_decode($r['conteudo'], true)) : array('versao' => 0, 'dados' => null);
}
/* grava se a versão base ainda for a atual. Devolve array(ok, versao, dados) */
function cf_d_gravar($cid, $base, $json, $quem) {
    $p = cf_db_exigir(); $p->beginTransaction();
    try {
        $s = $p->prepare('SELECT versao, conteudo FROM dados WHERE cid = ? FOR UPDATE'); $s->execute(array($cid)); $r = $s->fetch();
        $atual = $r ? (int)$r['versao'] : 0;
        if ($atual !== (int)$base) { $p->rollBack(); return array('ok' => false, 'versao' => $atual, 'dados' => json_decode($r['conteudo'], true)); }
        if ($r) {
            $p->prepare('INSERT IGNORE INTO dados_bkp (cid, dia, conteudo) VALUES (?, CURDATE(), ?)')->execute(array($cid, $r['conteudo']));
            $p->prepare('UPDATE dados SET versao = versao + 1, conteudo = ?, atualizado = ?, por = ? WHERE cid = ?')->execute(array($json, date('Y-m-d H:i:s'), $quem, $cid));
            $p->prepare('DELETE FROM dados_bkp WHERE cid = ? AND dia < DATE_SUB(CURDATE(), INTERVAL 14 DAY)')->execute(array($cid));
        } else {
            $p->prepare('INSERT INTO dados (cid, versao, conteudo, atualizado, por) VALUES (?, 1, ?, ?, ?)')->execute(array($cid, $json, date('Y-m-d H:i:s'), $quem));
        }
        $p->commit();
        return array('ok' => true, 'versao' => $atual + 1);
    } catch (Exception $e) { if ($p->inTransaction()) $p->rollBack(); throw $e; }
}
