<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Passport – BOOP</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Your BOOP Passport: the ID that owns your cards." />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      --ink:#e5e7eb;
      --muted:#cbd5e1;
      --blue:#2f80ed;
      --blue-dark:#1a5fcc;
      --border:rgba(255,255,255,0.10);
      --bg:#0b1220;
      --nav:#102a43;
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0; min-height:100vh; display:flex; flex-direction:column;
      font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
      color:#eef2ff;
      background:
        radial-gradient(1200px 800px at 85% -10%, rgba(47,128,237,.25), transparent 60%),
        radial-gradient(900px 600px at -10% 110%, rgba(16,185,129,.18), transparent 60%),
        linear-gradient(180deg, #0b1220 0%, #0d1220 30%, #0b1220 100%);
    }

    /* NAV */
    nav{ background:var(--nav); color:#fff; position:sticky; top:0; z-index:50; }
    .nav-container{ max-width:1100px; margin:0 auto; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; }
    .nav-left img{ height:34px; display:block; }
    .nav-right{ display:flex; align-items:center; gap:18px; }
    .nav-right a{ color:#fff; text-decoration:none; font-size:.95rem; opacity:.95; font-weight:500; }
    .nav-right a:hover{ opacity:1 }

    .hamburger{ display:none; flex-direction:column; justify-content:space-between; width:26px; height:20px; background:none; border:0; cursor:pointer; }
    .hamburger span{ width:100%; height:3px; background:#fff; border-radius:2px; transition:transform .25s, opacity .25s; }
    .hamburger.active span:nth-child(1){ transform:translateY(8.5px) rotate(45deg); }
    .hamburger.active span:nth-child(2){ opacity:0; }
    .hamburger.active span:nth-child(3){ transform:translateY(-8.5px) rotate(-45deg); }

    .nav-panel{ display:none; }
    @media (max-width: 768px){
      .nav-right{ display:none; }
      .hamburger{ display:flex; }
      .nav-panel{
        display:block; position:fixed; top:0; right:-100%; height:100vh; width:260px;
        background:#0f172a; color:#e5e7eb; box-shadow:-4px 0 14px rgba(0,0,0,.18);
        transition:right .3s ease; z-index:60; padding:80px 20px 20px;
      }
      .nav-panel.active{ right:0; }
      .nav-panel a{ display:block; color:#e5e7eb; text-decoration:none; padding:12px 8px; border-radius:8px; margin-bottom:6px; font-weight:600; }
      .nav-panel a:hover{ background:#111827; }
      .nav-overlay{ display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:55; }
      .nav-overlay.active{ display:block; }
    }

    /* HERO */
    .hero-band{ padding:28px 0 20px; }
    .hero-inner{
      max-width:1100px; margin:0 auto; padding:0 18px;
      display:flex; align-items:center; justify-content:space-between; gap:16px;
    }
    .hero-title{ margin:0; font-size:clamp(22px, 3.2vw, 34px); font-weight:700; text-align:left; }
    .hero-sub{ margin:6px 0 0; color:var(--muted); font-size:.98rem; text-align:left; }
    .pill{
      display:inline-flex; align-items:center; gap:6px;
      border:1px solid var(--border); background:rgba(255,255,255,.06); color:#a5b4fc;
      padding:6px 10px; border-radius:999px; font-size:.8rem; font-weight:700;
    }
    .pill.ok{ color:#86efac; }
    .pill.warn{ color:#fcd34d; }
    .pill.stop{ color:#fca5a5; }

    /* MAIN */
    main{ flex:1; }
    .container{ max-width:1100px; margin:18px auto 46px; padding:0 18px; }
    .grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    @media (max-width: 900px){ .grid{ grid-template-columns:1fr } }

    .card{
      background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01));
      border:1px solid var(--border);
      border-radius:16px;
      padding:18px;
      box-shadow:0 12px 30px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04);
    }
    .card h2{ margin:0 0 10px; font-size:1.1rem; }
    .row{ display:flex; gap:12px; align-items:center; justify-content:space-between; }
    .label{ display:block; color:var(--muted); font-size:.9rem; margin-bottom:4px; }
    .value{ font-weight:700; letter-spacing:.3px; }
    .list{ display:grid; gap:12px; }
    .tile{ border:1px solid var(--border); background:rgba(255,255,255,.02); border-radius:14px; padding:14px; }
    .tile h3{ margin:0 0 6px; font-size:1.02rem; }
    .tile .meta{ color:#9ca3af; font-size:.9rem; }
    .tile .row+.row{ margin-top:8px; }
    .divider{ height:1px; background:var(--border); margin:10px 0; }

    .btn{
      display:inline-flex; align-items:center; justify-content:center; gap:8px;
      padding:10px 14px; border-radius:10px; text-decoration:none; font-weight:700;
      border:1px solid transparent; cursor:pointer;
    }
    .btn.primary{ background:var(--blue); color:#fff; }
    .btn.primary:hover{ background:var(--blue-dark); }

    /* CARD IMAGE STYLE */
    .card-visual {
      position: relative;
      width: 280px;
      height: 180px;
      border-radius: 12px;
      background: url("assets/payulot-card.png") no-repeat center/cover;
      overflow: hidden;
      padding: 16px;
      color: #000; /* dark text on light card */
      font-weight: 600;
    }
    .card-visual .card-type {
      position: absolute;
      top: 16px;
      right: 16px;
      font-size: 0.95rem;
      color: #000;
    }
    .card-visual .card-owner {
      position: absolute;
      bottom: 16px;
      left: 16px;
      font-size: 1rem;
      color: #000;
    }

    /* FOOTER */
    footer{ border-top:1px solid var(--border); background:rgba(15,23,42,.6); color:#9ca3af; }
    .footer-inner{
      max-width:1100px; margin:0 auto; padding:16px 18px;
      display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:.9rem;
    }
    .footer-links a{ color:#9ca3af; text-decoration:none; margin-left:12px; }
    .footer-links a:hover{ text-decoration:underline; }
  </style>
</head>
<body>

  <!-- NAV -->
  <nav>
    <div class="nav-container">
      <div class="nav-left">
        <a href="cardholder.html" aria-label="BOOP home">
          <img src="assets/logo-white.png" alt="Payulot Logo" />
        </a>
      </div>
      <div class="nav-right" aria-label="Primary">
        <a href="cardholder.html">Home</a>
        <a href="send-request.html" id="sendRequestLink">Send / Request</a>
        <a href="transfer.html">Transfer</a>
        <a href="passport.html" aria-current="page">Passport</a>
        <a href="activity.html">Activity</a>
        <a href="help.html">Help</a>
        <a href="#" id="logoutBtn">Log Out</a>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="nav-overlay" id="navOverlay" aria-hidden="true"></div>
    <div class="nav-panel" id="mobileMenu" role="dialog" aria-modal="true" aria-label="Menu">
      <a href="cardholder.html">Home</a>
      <a href="send-request.html">Send / Request</a>
      <a href="transfer.html">Transfer</a>
      <a href="passport.html" aria-current="page">Passport</a>
      <a href="activity.html">Activity</a>
      <a href="help.html">Help</a>
      <a href="#" id="logoutBtnMobile">Log Out</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero-band">
    <div class="hero-inner">
      <div>
        <h1 class="hero-title">Passport</h1>
        <p class="hero-sub">Your Passport owns your cards. If it’s ever compromised, we can rotate the Passport — no wallet number exposed.</p>
      </div>
      <div class="pill" id="passportStatus">Loading…</div>
    </div>
  </section>

  <!-- MAIN -->
  <main class="container">
    <div class="grid">
      <!-- Passport summary -->
      <section class="card" aria-labelledby="passportTitle">
        <h2 id="passportTitle">Passport summary</h2>
        <div class="list">
          <div class="tile">
            <div class="row">
              <div>
                <span class="label">Passport ID</span>
                <div class="value" id="passportId">—</div>
              </div>
              <div>
                <span class="label">Status</span>
                <div class="value"><span class="pill ok" id="passportStatusInline">Active</span></div>
              </div>
            </div>
            <div class="row">
              <div>
                <span class="label">Owner</span>
                <div class="value" id="ownerName">—</div>
              </div>
              <div>
                <span class="label">Email</span>
                <div class="value" id="ownerEmail">—</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Cards in this Passport -->
      <section class="card" aria-labelledby="cardsTitle">
        <h2 id="cardsTitle">Cards in this Passport</h2>
        <div class="list" id="cardsList">
          <div class="tile">
            <div class="row"><div class="muted">Loading cards…</div></div>
          </div>
        </div>
      </section>
    </div>

    <!-- Transit actions -->
    <section class="card" style="margin-top:16px;">
      <div class="row">
        <div class="label" style="margin:0;">Need more rides or a different pass?</div>
        <a class="btn primary" id="buyTransitBtn" href="https://example.com/transit" target="_blank" rel="noopener">Buy transit tickets</a>
      </div>
    </section>
  </main>

  <!-- FOOTER -->
  <footer>
    <div class="footer-inner">
      <div>© <span id="year"></span> Payulot</div>
      <div class="footer-links">
        <a href="/terms.html" target="_blank" rel="noopener">Terms</a>
        <a href="/privacy.html" target="_blank" rel="noopener">Privacy</a>
      </div>
    </div>
  </footer>

  <!-- SCRIPTS -->
  <script>
    (async function(){
      // ---------- Permissions + fresh user ----------
let me; // will hold the fresh user object we just fetched
try {
  const token0 = localStorage.getItem("boop_jwt");
  if (!token0) throw new Error("No token");

  // Always fetch fresh so we have first_name + last_name
  const res = await fetch("/api/users/me", {
    headers: { Authorization: `Bearer ${token0}` }
  });
  const meData = await res.json();
  if (!res.ok) throw new Error(meData?.error || "Unauthorized");

  // If last_name is somehow empty, do a second fetch by id as a belt-and-suspenders
  if (!meData.last_name && meData.id) {
    try {
      const res2 = await fetch(`/api/users/${meData.id}`, {
        headers: { Authorization: `Bearer ${token0}` }
      });
      if (res2.ok) {
        const fullUser = await res2.json();
        me = { ...meData, ...fullUser };
      } else {
        me = meData;
      }
    } catch {
      me = meData;
    }
  } else {
    me = meData;
  }

  // Replace any stale cache so future pages also have last_name
  localStorage.setItem("boopUser", JSON.stringify(me));
} catch {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
  return;
}

      // ---------- Nav/Footer ----------
      document.getElementById('year').textContent = new Date().getFullYear();

      const hamburger = document.getElementById('hamburger');
      const panel = document.getElementById('mobileMenu');
      const overlay = document.getElementById('navOverlay');
      function openMenu(){ hamburger.classList.add('active'); panel.classList.add('active'); overlay.classList.add('active'); document.body.style.overflow='hidden'; }
      function closeMenu(){ hamburger.classList.remove('active'); panel.classList.remove('active'); overlay.classList.remove('active'); document.body.style.overflow=''; }
      hamburger?.addEventListener('click', ()=> hamburger.classList.contains('active')? closeMenu(): openMenu());
      overlay?.addEventListener('click', closeMenu);

      const me = JSON.parse(localStorage.getItem('boopUser') || '{}');
      const ownerNameEl = document.getElementById('ownerName');
      const ownerEmailEl = document.getElementById('ownerEmail');
      ownerEmailEl.textContent = me?.email || '—';
      const first = (me.first_name || "").trim();
      const last = (me.last_name || "").trim();
      const fullName = (first || last) ? `${first}${last ? " " + last : ""}` : "—";
      ownerNameEl.textContent = fullName;

      const passportIdEl = document.getElementById('passportId');
      const passportStatus = document.getElementById('passportStatus');
      const passportStatusInline = document.getElementById('passportStatusInline');
      const cardsList = document.getElementById('cardsList');

      function setStatus(pillEl, text, kind){
        pillEl.textContent = text;
        pillEl.classList.remove('ok','warn','stop');
        if (kind) pillEl.classList.add(kind);
      }

      function normalizeStatus(v){
        const s = (v||'').toLowerCase();
        if (['active','ok','enabled'].includes(s)) return 'active';
        if (['pending','review'].includes(s)) return 'pending';
        if (['disabled','blocked','inactive','frozen','closed'].includes(s)) return 'disabled';
        return 'active';
      }

      function normalizeType(v){
        const s = (v||'').toLowerCase();
        if (['transit','bus','metro','rail'].includes(s)) return 'transit';
        if (['assistance'].includes(s)) return 'assistance';
        return 'spending';
      }

      function renderCards(cards){
        if (!Array.isArray(cards) || !cards.length){
          cardsList.innerHTML = `<div class="tile"><div class="row"><div class="muted">No cards yet.</div></div></div>`;
          return;
        }

        cardsList.innerHTML = cards.map(card => {
          const status = normalizeStatus(card.status);
          const pillKind = status === 'active' ? 'ok' : status === 'pending' ? 'warn' : 'stop';
          const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

          if (card.type === 'spending') {
            return `
              <div class="tile">
                <div class="row">
                  <h3>Spending Card</h3>
                  <span class="pill ${pillKind}">${statusLabel}</span>
                </div>
                <div class="card-visual">
                  <div class="card-type">Spending</div>
                  <div class="card-owner">${fullName}</div>
                </div>
              </div>`;
          }

          return `
            <div class="tile">
              <div class="row">
                <h3>${card.type}</h3>
                <span class="pill ${pillKind}">${statusLabel}</span>
              </div>
            </div>`;
        }).join('');
      }

      // load dummy cards for now
      renderCards([{ type: "spending", status: "active" }]);

    })();
  </script>
</body>
</html>
