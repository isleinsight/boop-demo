// /public/passport/passport.js
(function(){
  // ---------- helpers ----------
  const $ = (id)=>document.getElementById(id);
  const show = (el)=>{ el.style.display = ""; };
  const hide = (el)=>{ el.style.display = "none"; };
  const setStatus = (el, msg, kind) => {
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
    show(el);
  };
  const fromQS = (k) => {
    try { return new URL(location.href).searchParams.get(k) || ""; } catch { return ""; }
  };

  // normalize a role/type value
  function roleKey(me){
    const r = String(me?.role || "").toLowerCase();
    const t = String(me?.type || "").toLowerCase();

    // prefer role when it’s specific; else fallback to type
    const v = r || t;

    if (["vendor"].includes(v)) return "vendor";
    if (["health","medical","emt","ambulance"].includes(v)) return "health";
    if (["transit","bus","ferry","rail","operator"].includes(v)) return "transit";

    // if they’re none of the above, they can still see the shell, but no special actions
    return "unknown";
  }

  function fullName(me){
    const first = me?.first_name || "";
    const last  = me?.last_name  || "";
    const emailFallback = (me?.email || "").split("@")[0] || "User";
    const name = String((first + " " + last)).trim();
    return name || emailFallback;
  }

  // fetch signed-in user (prefer /api/users/me, fallback to /api/me)
  async function fetchMe(){
    const token = localStorage.getItem("boop_jwt");
    if (!token) throw new Error("No token");

    // try /api/users/me first (has first_name/last_name)
    let res = await fetch("/api/users/me", { headers:{ Authorization:`Bearer ${token}` }});
    if (res.ok) return res.json();

    // fallback to /api/me
    res = await fetch("/api/me", { headers:{ Authorization:`Bearer ${token}` }});
    if (res.ok) return res.json();

    // neither worked
    const msg = (await res.json().catch(()=>({})))?.message || "Unauthorized";
    throw new Error(msg);
  }

  function setRoleView(active){
    // hide all
    ["view-vendor","view-health","view-transit"].forEach(id => {
      $(id).classList.remove("active");
    });
    if (active === "vendor")   $("view-vendor").classList.add("active");
    if (active === "health")   $("view-health").classList.add("active");
    if (active === "transit")  $("view-transit").classList.add("active");
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async ()=>{
    $("year").textContent = new Date().getFullYear();

    // auth + identity
    try {
      const me = await fetchMe();
      localStorage.setItem("boopUser", JSON.stringify(me));

      const who = fullName(me);
      const role = roleKey(me);

      $("signedInAs").textContent = `Signed in as ${who}`;
      $("roleBadge").textContent = role;
      $("whoBadge").textContent = who;

      // Pre-fill PID from URL if available
      const pidEl = $("pid");
      const pidQS = fromQS("pid");
      if (pidQS) pidEl.value = pidQS;

      // show the right view
      setRoleView(role);

    } catch (err){
      // bounce to login if not authorized
      try { await fetch("/api/logout", { method:"POST" }); } catch {}
      localStorage.clear();
      location.href = "../login.html";
      return;
    }

    // ----- Common controls -----
    $("btnPaste")?.addEventListener("click", async ()=>{
      try{
        const text = await navigator.clipboard.readText();
        if (text) $("pid").value = text.trim();
      }catch{
        const st = $("commonStatus");
        setStatus(st, "Clipboard read failed. Paste manually.", "warn");
      }
    });

    $("btnLoad")?.addEventListener("click", ()=>{
      const pid = $("pid").value.trim();
      if (!pid){
        setStatus($("commonStatus"), "Please enter a Passport ID.", "err");
        return;
      }
      hide($("commonStatus"));
      // no network call here yet—this is where you'd fetch passport meta if/when you add that API
    });

    $("logoutLink")?.addEventListener("click", async (e)=>{
      e.preventDefault();
      try { await fetch("/api/logout", { method:"POST" }); } catch {}
      localStorage.clear();
      location.href = "../login.html";
    });

    // ----- Vendor actions (wire to your existing endpoints when ready) -----
    $("v_chargeBtn")?.addEventListener("click", async ()=>{
      const pid = $("pid").value.trim();
      const amt = parseFloat($("v_amount").value);
      const note = $("v_note").value || "";
      const st = $("v_status");

      if (!pid)  return setStatus(st, "Passport ID required.", "err");
      if (!Number.isFinite(amt) || amt <= 0) return setStatus(st, "Enter a valid amount.", "err");

      // Example wiring (uncomment when your endpoint is ready):
      /*
      try{
        hide(st);
        const token = localStorage.getItem("boop_jwt");
        const res = await fetch("/api/vendor/passport-charge", {
          method:"POST",
          headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
          body: JSON.stringify({ passport_id: pid, amount: amt, note })
        });
        const payload = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(payload?.message || payload?.error || res.status);
        setStatus(st, "Charge completed.", "ok");
      }catch(err){
        setStatus(st, `❌ ${err.message || err}`, "err");
      }
      */

      // For now, no-op success so you see the page flow:
      setStatus(st, "(demo) Charge completed.", "ok");
    });

    // ----- Transit actions -----
    $("t_validateBtn")?.addEventListener("click", async ()=>{
      const pid = $("pid").value.trim();
      const fare = parseFloat($("t_fare").value);
      const mode = $("t_mode").value;
      const st = $("t_status");

      if (!pid)  return setStatus(st, "Passport ID required.", "err");
      if (!Number.isFinite(fare) || fare < 0) return setStatus(st, "Enter a valid fare.", "err");

      // Example wiring to your transit API if/when you build it
      // For now, simulate success:
      setStatus(st, `(demo) ${mode} fare deducted: ${fare.toFixed(2)}`, "ok");
    });
  });
})();
