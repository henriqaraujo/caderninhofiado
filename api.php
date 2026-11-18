<?php
/* Caderninho do Fiado - leitura e gravação do caderninho do comércio (JSON). */
define('CF', 1); require __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
function resp($cod, $arr) { http_response_code($cod); echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }

$u = cf_atual();
if (!$u) resp(401, array('erro' => 'sessao'));
if (!cf_modo_banco()) resp(409, array('erro' => 'sem-banco'));
$cid = $u['cid'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try { $d = cf_d_ler($cid); } catch (Exception $e) { resp(500, array('erro' => 'banco')); }
    resp(200, $d);
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $tok = $_SERVER['HTTP_X_CF'] ?? '';
    if (!hash_equals(cf_csrf(), (string)$tok)) resp(403, array('erro' => 'csrf'));
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 12 * 1024 * 1024) resp(413, array('erro' => 'grande'));
    $in = json_decode($raw, true);
    if (!is_array($in) || !isset($in['dados']) || !is_array($in['dados']) || !isset($in['base'])) resp(400, array('erro' => 'formato'));
    $d = $in['dados'];
    foreach (array('clientes', 'produtos', 'fiados') as $k) if (!isset($d[$k]) || !is_array($d[$k])) resp(400, array('erro' => 'formato'));
    if (!isset($d['config']) || !is_array($d['config'])) resp(400, array('erro' => 'formato'));
    try {
        $r = cf_d_gravar($cid, (int)$in['base'], json_encode($d, JSON_UNESCAPED_UNICODE), $u['usuario']);
    } catch (Exception $e) { resp(500, array('erro' => 'banco')); }
    if ($r['ok']) resp(200, array('versao' => $r['versao']));
    resp(409, array('erro' => 'versao', 'versao' => $r['versao'], 'dados' => $r['dados']));
}
resp(405, array('erro' => 'metodo'));
