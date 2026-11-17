<?php
define('CF', 1); require __DIR__ . '/auth.php';
$eu = cf_exigir_login();
header('Cache-Control: no-store');
?><!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Caderninho do Fiado</title>
<meta name="description" content="Controle de fiado para comércio local: quem deve, quanto e quando vai pagar.">
<meta name="theme-color" content="#f5f6f8">
<link rel="manifest" href="manifest.webmanifest">
<meta name="robots" content="noindex">
<!-- Google Tag Manager -->
<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-KXJZB3JT"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
</script>
<!-- End Google Tag Manager -->
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<script>
/* Aplica o tema antes de desenhar a tela, para não piscar */
(function(){try{var d=JSON.parse(localStorage.getItem('caderninho-fiado-v1')||'{}');var t=(d.config&&d.config.tema)||'auto';
var dark=t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){}})();
</script>
<link rel="preload" href="fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="css/ph.css">
<link rel="stylesheet" href="css/app.css">
</head>
<body>
<a class="skip" href="#view">Ir para o conteúdo</a>

<div class="app">
  <aside class="side" aria-label="Menu principal">
    <div class="brand">
      <span class="brand-mark"><i class="ph ph-notebook"></i></span>
      <span class="brand-txt"><strong>Caderninho do Fiado</strong><small id="brand-loja"></small></span>
    </div>
    <nav class="side-nav">
      <button class="nav-item" data-action="ir" data-view="inicio"><i class="ph ph-house"></i><span>Início</span></button>
      <p class="nav-grupo">Fiado</p>
      <button class="nav-item" data-action="ir" data-view="fiados"><i class="ph ph-receipt"></i><span>Fiados</span></button>
      <button class="nav-item" data-action="ir" data-view="pagos"><i class="ph ph-hand-coins"></i><span>Quem já pagou</span></button>
      <button class="nav-item" data-action="ir" data-view="relatorios"><i class="ph ph-chart-bar"></i><span>Relatórios</span></button>
      <p class="nav-grupo">Cadastros</p>
      <button class="nav-item" data-action="ir" data-view="clientes"><i class="ph ph-users"></i><span>Clientes</span></button>
      <button class="nav-item" data-action="ir" data-view="produtos"><i class="ph ph-package"></i><span>Produtos</span></button>
      <p class="nav-grupo">Sistema</p>
      <button class="nav-item" data-action="ir" data-view="ajustes"><i class="ph ph-gear-six"></i><span>Ajustes e cópia</span></button>
    </nav>
    <button class="btn btn-primary btn-grande" data-action="novo-fiado"><i class="ph ph-plus"></i>Anotar fiado</button>
    <button class="btn btn-ghost side-ajuda" data-action="ajuda"><i class="ph ph-question"></i>Como usar</button>
    <button class="btn btn-ghost side-tema" data-action="tema-alternar" data-tema-btn><i class="ph ph-moon"></i><span>Modo escuro</span></button>
    <div class="conta" aria-label="Minha conta">
      <p class="conta-nome"><i class="ph ph-user-circle"></i><span><?= cf_h($eu['nome']) ?></span></p>
      <div class="conta-links">
        <?php if (!empty($eu['admin'])): ?><a href="admin.php"><i class="ph ph-shield-check"></i>Administração</a><?php endif; ?>
        <a href="senha.php"><i class="ph ph-key"></i>Minha senha</a>
        <a href="sair.php"><i class="ph ph-sign-out"></i>Sair</a>
      </div>
    </div>
  </aside>

  <header class="top">
    <div class="brand">
      <span class="brand-mark"><i class="ph ph-notebook"></i></span>
      <span class="brand-txt"><strong id="top-titulo">Caderninho do Fiado</strong></span>
    </div>
    <div class="top-acoes">
      <button class="icon-btn" data-action="tema-alternar" data-tema-btn aria-label="Mudar para o modo escuro" title="Mudar tema"><i class="ph ph-moon"></i></button>
      <button class="icon-btn" data-action="ajuda" aria-label="Como usar"><i class="ph ph-question"></i></button>
    </div>
  </header>

  <main id="view" tabindex="-1"></main>

  <nav class="tabbar" aria-label="Menu principal">
    <button class="tab" data-action="ir" data-view="inicio"><i class="ph ph-house"></i><span>Início</span></button>
    <button class="tab" data-action="ir" data-view="fiados"><i class="ph ph-receipt"></i><span>Fiados</span></button>
    <button class="tab tab-novo" data-action="novo-fiado" aria-label="Anotar fiado"><span class="tab-novo-bt"><i class="ph ph-plus"></i></span><span>Anotar</span></button>
    <button class="tab" data-action="ir" data-view="clientes"><i class="ph ph-users"></i><span>Clientes</span></button>
    <button class="tab" data-action="ir" data-view="mais"><i class="ph ph-squares-four"></i><span>Mais</span></button>
  </nav>
</div>

<dialog id="dlg" aria-modal="true"></dialog>
<dialog id="dlg-confirm" class="confirma"></dialog>
<dialog id="dlg-pick" class="pick-dlg" aria-label="Escolha uma opção"></dialog>
<div id="impressao" aria-hidden="true"></div>
<div id="toast" role="status" aria-live="polite"></div>
<input type="file" id="arquivo" accept=".json,application/json" hidden>

<noscript><p style="padding:24px;font-family:sans-serif">Para usar o Caderninho do Fiado é preciso ativar o JavaScript no navegador.</p></noscript>
<script>window.CF_USER = <?= json_encode(array("nome" => $eu["nome"], "usuario" => $eu["usuario"], "admin" => !empty($eu["admin"]))) ?>;</script>
<script src="js/controles.js"></script>
<script src="js/app.js"></script>
</body>
</html>
