"use strict";
(() => {
const C = window.CONFIG, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const inr = n => "₹" + Number(n).toLocaleString("en-IN");
const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const hasPrice = p => typeof p.price === "number" && p.price > 0;
let extra = jget("nsa_extra", []), cart = jget("nsa_cart", {}), cat = "all", token = null, busy = false;
const all = () => window.PRODUCTS.concat(extra);
const byId = id => all().find(p => p.id === id);
const catName = id => (window.CATEGORIES.find(c => c.id === id) || {}).name || "";

/* ---------- contact info (from CONFIG) ---------- */
function initContact() {
  ["hPhone", "cPhone"].forEach(i => { const a = $("#" + i); a.textContent = C.phone; a.href = "tel:+91" + C.phone; });
  if (C.email) { ["hEmail", "cEmail"].forEach(i => { const a = $("#" + i); a.textContent = C.email; a.href = "mailto:" + C.email; a.hidden = false; }); $("#cEmailWrap").hidden = false; }
  $("#wa").href = "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent("Hello NSA Mulund Crackers, I have a question.");
  $("#pDelivery").textContent = C.policies.delivery; $("#pCancel").textContent = C.policies.cancellation;
  $("#pRefund").textContent = C.policies.refund; $("#pTerms").textContent = C.policies.terms;
  $("#yr").textContent = new Date().getFullYear();
}

/* ---------- placeholder illustration (clearly not a real photo) ---------- */
function placeholder(p) {
  const ic = (window.CATEGORIES.find(c => c.id === p.cat) || {}).icon || "🎇";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#FFF4D6"/><circle cx="150" cy="130" r="80" fill="#45216D"/><text x="150" y="160" font-size="80" text-anchor="middle">${ic}</text><text x="150" y="265" font-size="16" fill="#45216D" text-anchor="middle" font-family="sans-serif">Illustration · photo coming soon</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ---------- categories & products ---------- */
function renderCats() {
  $("#catGrid").innerHTML = window.CATEGORIES.map(c => `<article class="cat"><div class="ic" aria-hidden="true">${c.icon}</div><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p><button class="btn gold" data-cat="${c.id}">View Products</button></article>`).join("");
  $("#chips").innerHTML = [{ id: "all", name: "All" }, ...window.CATEGORIES].map(c => `<button class="chip" role="tab" data-chip="${c.id}" aria-selected="${c.id === cat}">${esc(c.name)}</button>`).join("");
  $("#aCat").innerHTML = window.CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
}
function cardHTML(p) {
  const ok = hasPrice(p), disc = ok && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  return `<article class="card" data-id="${esc(p.id)}"><img src="${esc(p.img || placeholder(p))}" alt="${esc(p.name)}${p.img ? "" : " (illustration placeholder)"}" loading="lazy" width="300" height="300" onerror="this.onerror=null;this.src='${placeholder(p).replace(/'/g, "%27")}'">
  <div class="cb"><h3>${esc(p.name)}</h3><small>${esc(catName(p.cat))}</small><small>${esc(p.desc)}</small>
  ${ok ? `<div class="price">${disc ? `<s>${inr(p.mrp)}</s> ` : ""}${inr(p.price)}${disc ? `<em>${disc}% off</em>` : ""}</div>` : `<div class="soon">Price coming soon</div>`}
  <div class="buy"><div class="qty"><button data-dec aria-label="Decrease quantity">−</button><input type="number" min="1" max="99" value="1" aria-label="Quantity" data-q><button data-inc aria-label="Increase quantity">+</button></div>
  <button class="add" data-add ${ok ? "" : "disabled"}>${ok ? "Add to Cart" : "Unavailable"}</button></div></div></article>`;
}
function renderGrid() {
  const q = $("#q").value.trim().toLowerCase(), s = $("#sort").value, f = $("#featOnly").checked;
  let list = all().filter(p => (cat === "all" || p.cat === cat) && (!q || p.name.toLowerCase().includes(q)) && (!f || p.featured));
  if (s) list.sort((a, b) => (s === "asc" ? 1 : -1) * ((hasPrice(a) ? a.price : 1e12) - (hasPrice(b) ? b.price : 1e12)));
  let html = list.map(cardHTML).join("");
  if (!list.length) {
    const none = !all().some(p => cat === "all" || p.cat === cat);
    const m = { rockets: "No rocket products added yet. Please check back soon!", fancy: "No fancy fireworks products added yet. Please check back soon!" };
    html = `<p class="empty">${none && !q ? (m[cat] || "No products added yet. Please check back soon!") : "No products match your search or filter."}</p>`;
  }
  $("#grid").innerHTML = html;
  $$("#chips .chip").forEach(b => b.setAttribute("aria-selected", b.dataset.chip === cat));
  const offers = all().filter(p => hasPrice(p) && p.mrp > p.price);
  $("#offerGrid").innerHTML = offers.map(cardHTML).join(""); $("#noOffer").hidden = offers.length > 0;
}

/* ---------- cart ---------- */
const clampQ = n => Math.min(99, Math.max(1, Math.floor(Number(n)) || 1));
function saveCart() { jset("nsa_cart", cart); renderCart(); }
function totals() {
  const lines = []; let changed = false;
  for (const id in cart) {
    const p = byId(id), q = Number(cart[id]);
    if (!p || !hasPrice(p) || !Number.isInteger(q) || q < 1) { delete cart[id]; changed = true; continue; }
    lines.push({ p, q, line: p.price * q });
  }
  if (changed) jset("nsa_cart", cart);
  const items = lines.reduce((a, l) => a + l.q, 0), sub = lines.reduce((a, l) => a + l.line, 0);
  const delivery = sub > 0 ? C.deliveryCharge : 0, discount = 0;
  return { lines, items, sub, delivery, discount, total: sub + delivery - discount };
}
function renderCart() {
  const t = totals(); $("#cartCount").textContent = t.items;
  $("#cartBody").innerHTML = t.lines.length ? t.lines.map(l => `<div class="line" data-id="${esc(l.p.id)}"><div><b>${esc(l.p.name)}</b><br><small>${inr(l.p.price)} each</small></div><div><b>${inr(l.line)}</b></div>
    <div class="qty"><button data-cdec aria-label="Decrease">−</button><span>${l.q}</span><button data-cinc aria-label="Increase">+</button></div><button class="rm" data-crm>Remove</button></div>`).join("")
    : `<p class="empty">Your cart is empty. Let's find some sparkle! ✨</p>`;
  $("#cartFoot").innerHTML = t.lines.length ? `<div class="tot"><span>Total items</span><span>${t.items}</span></div><div class="tot"><span>Subtotal</span><span>${inr(t.sub)}</span></div>
    <div class="tot"><span>Delivery</span><span>${inr(t.delivery)}</span></div><div class="tot big"><span>Grand Total</span><span>${inr(t.total)}</span></div>
    ${C.minOrder && t.sub < C.minOrder ? `<p class="err">Minimum order value is ${inr(C.minOrder)}.</p>` : ""}
    <button class="btn gold" data-checkout>Proceed to Checkout</button><button class="btn ghost" data-close>Continue Shopping</button><button class="rm" data-clear>Clear cart</button>
    <a class="rm" target="_blank" rel="noopener" href="https://wa.me/${C.whatsapp}?text=${encodeURIComponent("Hello NSA Mulund Crackers, I'd like to order:\n" + t.lines.map(l => `${l.p.name} x ${l.q} = ${inr(l.line)}`).join("\n") + "\nTotal: " + inr(t.total))}">Send order summary on WhatsApp (items only)</a>` : `<button class="btn gold" data-close>Continue Shopping</button>`;
}
function open(el) { $("#scrim").hidden = false; el.hidden = false; document.body.style.overflow = "hidden"; const f = el.querySelector("button,input"); f && f.focus(); }
function closeAll() { ["#drawer", "#modal", "#admin", "#scrim"].forEach(s => $(s).hidden = true); document.body.style.overflow = ""; }

/* ---------- checkout ---------- */
const F = ["Name", "Mobile", "House", "Building", "Street", "Landmark", "City", "State", "Pin", "Email", "Notes"];
const val = k => $("#f" + k).value.trim();
function validate() {
  const e = {};
  if (!val("Name")) e.fName = "Please enter your full name.";
  if (!/^[6-9]\d{9}$/.test(val("Mobile"))) e.fMobile = "Enter a valid 10-digit Indian mobile number.";
  [["House", "house/flat number"], ["Building", "building/society name"], ["Street", "street and area"], ["City", "city"], ["State", "state"]].forEach(([k, n]) => { if (!val(k)) e["f" + k] = "Please enter your " + n + "."; });
  if (!/^[1-9]\d{5}$/.test(val("Pin"))) e.fPin = "Enter a valid 6-digit PIN code.";
  if (val("Email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("Email"))) e.fEmail = "Enter a valid email address.";
  if (!$("#fAgree").checked) e.fAgree = "Please confirm to continue.";
  const t = totals(); if (!t.lines.length) e.fAgree = "Your cart is empty."; else if (C.minOrder && t.sub < C.minOrder) e.fAgree = "Minimum order value is " + inr(C.minOrder) + ".";
  $$(".err[data-for]").forEach(s => { s.textContent = e[s.dataset.for] || ""; const i = $("#" + s.dataset.for); i && i.classList.toggle("bad", !!e[s.dataset.for]); });
  const first = Object.keys(e)[0]; if (first) $("#" + first).focus();
  return !Object.keys(e).length;
}
const addr = () => [val("House"), val("Building"), val("Street"), val("Landmark") && "Near " + val("Landmark")].filter(Boolean).join(", ");
function showStep(n) { $("#stepForm").hidden = n !== "Form"; $("#stepReview").hidden = n !== "Review"; $("#stepDone").hidden = n !== "Done"; }
function review() {
  const t = totals();
  $("#stepReview").innerHTML = `<h2>Review Your Order</h2><div class="rev"><p><b>${esc(val("Name"))}</b> · ${esc(val("Mobile"))}${val("Email") ? " · " + esc(val("Email")) : ""}</p><p>${esc(addr())}, ${esc(val("City"))}, ${esc(val("State"))} – ${esc(val("Pin"))}</p>${val("Notes") ? `<p><i>Notes: ${esc(val("Notes"))}</i></p>` : ""}</div>
  <div class="rev">${t.lines.map(l => `<p>${esc(l.p.name)} — ${l.q} × ${inr(l.p.price)} = <b>${inr(l.line)}</b></p>`).join("")}<hr><div class="tot"><span>Subtotal</span><span>${inr(t.sub)}</span></div><div class="tot"><span>Delivery</span><span>${inr(t.delivery)}</span></div><div class="tot big"><span>Grand Total</span><span>${inr(t.total)}</span></div></div>
  <p class="note">The final amount is verified by our server. Payment: to be confirmed by us.</p><p id="subErr" class="err" role="alert"></p>
  <button class="btn gold" id="confirm">Confirm Order</button><button class="btn ghost" id="editD">Edit Details</button>`;
  showStep("Review");
}
async function submit() {
  if (busy) return; busy = true;
  const b = $("#confirm"), er = $("#subErr"); b.disabled = true; b.textContent = "Placing order…"; er.textContent = "";
  token = token || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
  const t = totals();
  const payload = { token, customer: { name: val("Name"), mobile: val("Mobile"), email: val("Email"), house: val("House"), building: val("Building"), street: val("Street"), landmark: val("Landmark"), city: val("City"), state: val("State"), pin: val("Pin"), notes: val("Notes") }, items: t.lines.map(l => ({ id: l.p.id, qty: l.q })), clientTotal: t.total };
  try {
    if (!C.endpoint) throw new Error("Online ordering is not set up yet. Please contact us on WhatsApp or phone.");
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
    // text/plain avoids a CORS preflight, which Google Apps Script does not support.
    const r = await fetch(C.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), signal: ctl.signal });
    clearTimeout(to);
    const d = await r.json();
    if (!d || d.ok !== true || !d.orderId) throw new Error((d && d.error) || "The order could not be saved. Please try again.");
    done(d); token = null; cart = {}; saveCart(); $("#form").reset(); $("#fCity").value = "Mumbai"; $("#fState").value = "Maharashtra";
  } catch (x) {
    er.textContent = x.name === "AbortError" ? "The request timed out. Please check your connection and try again — your cart is safe." : (x instanceof SyntaxError || x instanceof TypeError) ? "Could not reach the server. Please check your connection and try again — your cart is safe." : x.message;
    b.disabled = false; b.textContent = "Confirm Order";
  } finally { busy = false; }
}
function done(d) {
  $("#stepDone").innerHTML = `<div class="thanks"><h2>Thank You for Shopping with NSA Mulund Crackers!</h2><p>Your order has been received.</p><p class="oid">${esc(d.orderId)}</p><p>${esc(d.date)} · ${esc(val("Name"))}</p>
  <div class="rev" style="text-align:left">${(d.items || []).map(i => `<p>${esc(i.name)} × ${i.qty} = <b>${inr(i.line)}</b></p>`).join("")}<hr><div class="tot big"><span>Total</span><span>${inr(d.total)}</span></div></div>
  <p class="note">Receiving your order does not mean payment or delivery has been completed. We will contact you to confirm availability, payment and delivery.</p>
  <a class="btn gold" href="#top" data-close>Back to Home</a><button class="btn ghost" data-close data-go="#shop">Continue Shopping</button></div>`;
  showStep("Done"); if (!matchMedia("(prefers-reduced-motion:reduce)").matches) for (let i = 0; i < 26; i++) { const s = document.createElement("span"); s.className = "spark"; s.textContent = i % 2 ? "✦" : "•"; s.style.left = Math.random() * 100 + "vw"; s.style.top = "-20px"; s.style.animationDelay = Math.random() + "s"; document.body.appendChild(s); setTimeout(() => s.remove(), 3500); }
}

/* ---------- owner product management (browser-local; see README) ---------- */
function renderAdmin() {
  $("#aList").innerHTML = extra.length ? extra.map(p => `<p>${esc(p.name)} (${esc(catName(p.cat))}) ${hasPrice(p) ? inr(p.price) : "no price"} <button class="rm" data-adel="${esc(p.id)}">Delete</button></p>`).join("") : `<p class="note">No products added in this browser yet.</p>`;
}
function resize(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; r.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const s = 500 / Math.max(im.width, im.height, 500), c = document.createElement("canvas"); c.width = im.width * s; c.height = im.height * s; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .8)); }; im.src = r.result; }; r.readAsDataURL(file); });
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const t = e.target, g = s => t.closest(s);
  if (g("[data-cat]")) { cat = g("[data-cat]").dataset.cat; renderGrid(); $("#shop").scrollIntoView(); }
  else if (g("[data-chip]")) { cat = g("[data-chip]").dataset.chip; renderGrid(); }
  else if (g("[data-inc],[data-dec]")) { const i = g(".card").querySelector("[data-q]"); i.value = clampQ(+i.value + (g("[data-inc]") ? 1 : -1)); }
  else if (g("[data-add]")) { const id = g(".card").dataset.id, p = byId(id); if (p && hasPrice(p)) { cart[id] = clampQ((cart[id] || 0) + clampQ(g(".card").querySelector("[data-q]").value)); saveCart(); const b = g("[data-add]"); b.textContent = "Added ✓"; setTimeout(() => b.textContent = "Add to Cart", 900); } }
  else if (g("[data-cinc]")) { const id = g(".line").dataset.id; cart[id] = clampQ(cart[id] + 1); saveCart(); }
  else if (g("[data-cdec]")) { const id = g(".line").dataset.id; cart[id] = clampQ(cart[id] - 1); saveCart(); }
  else if (g("[data-crm]")) { delete cart[g(".line").dataset.id]; saveCart(); }
  else if (g("[data-clear]")) { if (confirm("Remove all items from your cart?")) { cart = {}; saveCart(); } }
  else if (g("[data-checkout]")) { if (C.minOrder && totals().sub < C.minOrder) return; $("#drawer").hidden = true; showStep("Form"); open($("#modal")); }
  else if (g("[data-close]")) { const go = g("[data-close]").dataset.go; closeAll(); if (go) $(go).scrollIntoView(); }
  else if (t.id === "scrim") closeAll();
  else if (t.id === "editD") showStep("Form");
  else if (t.id === "confirm") submit();
  else if (g("#cartBtn")) { renderCart(); open($("#drawer")); }
  else if (g("#burger")) { const n = $("#nav").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", n); }
  else if (g(".nav a")) $("#nav").classList.remove("open");
  else if (g("[data-adel]")) { extra = extra.filter(p => p.id !== g("[data-adel]").dataset.adel); jset("nsa_extra", extra); renderAdmin(); renderGrid(); }
  else if (t.id === "aExport") { const o = $("#aOut"); o.hidden = false; o.value = extra.map(p => "  " + JSON.stringify({ ...p, img: p.img && p.img.startsWith("data:") ? "images/" + p.id + ".jpg" : p.img })).join(",\n"); o.select(); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
$("#cartBody").addEventListener("keydown", () => {});
$("#q").addEventListener("input", renderGrid); $("#sort").addEventListener("change", renderGrid); $("#featOnly").addEventListener("change", renderGrid);
$("#grid").addEventListener("change", e => { if (e.target.matches("[data-q]")) e.target.value = clampQ(e.target.value); });
$("#form").addEventListener("submit", e => { e.preventDefault(); if (validate()) review(); });
$("#aForm").addEventListener("submit", async e => {
  e.preventDefault(); const pr = parseInt($("#aPrice").value, 10), mrp = parseInt($("#aMrp").value, 10); let img = "";
  const f = $("#aImg").files[0]; if (f) { try { img = await resize(f); } catch { alert("Could not read that image."); return; } }
  const name = $("#aName").value.trim(); if (!name) return;
  extra.push({ id: "x-" + Date.now().toString(36), cat: $("#aCat").value, name, price: pr > 0 ? pr : null, mrp: mrp > 0 ? mrp : null, img, desc: $("#aDesc").value.trim() });
  if (!jset("nsa_extra", extra)) { extra.pop(); alert("Browser storage is full. Use a smaller image."); return; }
  e.target.reset(); renderAdmin(); renderGrid();
});
function route() { if (location.hash === "#admin") { renderAdmin(); open($("#admin")); history.replaceState(null, "", location.pathname); } }
addEventListener("hashchange", route);
addEventListener("storage", e => { if (e.key === "nsa_cart") { cart = jget("nsa_cart", {}); renderCart(); } });

/* ---------- fireworks canvas (light, pauses when hidden / reduced motion) ---------- */
function fireworks() {
  const cv = $("#fx"), x = cv.getContext("2d"); if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  let w, h, ps = [], on = true, last = 0, nextB = 0; const cols = ["#FFD166", "#FF8C42", "#D62828", "#FFF4D6", "#2fd18a"];
  const size = () => { w = cv.width = cv.offsetWidth; h = cv.height = cv.offsetHeight; }; size(); addEventListener("resize", size);
  new IntersectionObserver(en => on = en[0].isIntersecting).observe(cv);
  const small = innerWidth < 700;
  (function loop(t) {
    requestAnimationFrame(loop); if (!on || document.hidden || t - last < 33) return; last = t;
    if (t > nextB) { nextB = t + 1100 + Math.random() * 1200; const cx = Math.random() * w, cy = Math.random() * h * .6, c = cols[Math.random() * cols.length | 0], n = small ? 22 : 40; for (let i = 0; i < n; i++) { const a = i / n * 6.283, v = 1.5 + Math.random() * 2; ps.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, c }); } }
    x.fillStyle = "rgba(24,11,45,.22)"; x.fillRect(0, 0, w, h);
    ps = ps.filter(p => p.l > 0); for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += .04; p.vx *= .985; p.l -= .014; x.globalAlpha = Math.max(p.l, 0); x.fillStyle = p.c; x.fillRect(p.x, p.y, 2.5, 2.5); } x.globalAlpha = 1;
  })(0);
}

initContact(); renderCats(); renderGrid(); renderCart(); fireworks(); route();
window.addEventListener("scroll", () => $(".hdr").style.boxShadow = scrollY > 10 ? "0 4px 18px #000a" : "none", { passive: true });
})();
