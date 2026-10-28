/**
 * NSA Mulund Crackers — order backend (Google Apps Script).
 * Paste into script.google.com, set SPREADSHEET_ID, run setup() once, then deploy as Web App.
 * Prices are verified HERE; client-sent prices/totals are ignored.
 */
const SPREADSHEET_ID = "1BKpfkos7HxZ_ePozbW2D2l6-v_gwmE4119tUl223fjE";
const DELIVERY_CHARGE = 0;      // keep equal to CONFIG.deliveryCharge in products.js
const MIN_ORDER = 0;            // keep equal to CONFIG.minOrder
const ORDER_PREFIX = "NSA-26-";   // IDs: NSA-26-001, NSA-26-002, ...
const INITIAL_STATUS = "Pending Confirmation";
const PAYMENT_METHOD = "To be confirmed";

/* id -> [name, price]. Must match products.js. Add Rockets/Fancy items here too. */
const PRICES = {
  "sp-9sai": ["9 CM Sai Baba", 50], "sp-12p": ["12 CM Plain", 100], "sp-12c": ["12 CM Colour", 120],
  "sp-15p": ["15 CM Plain", 150], "sp-15c": ["15 CM Colour", 150], "sp-30p": ["30 CM Plain", 170], "sp-30c": ["30 CM Colour", 170],
  "fp-special": ["Anar Special Standard", 200], "fp-giant": ["Anar Giant Standard", 250], "fp-big": ["Anar Big Standard", 300],
  "ch-big": ["Chakkar Big Standard", 200], "ch-spbig": ["Chakkar Special Big", 250], "ch-spstd": ["Chakkar Special Standard", 300], "ch-deluxe": ["Chakkar Deluxe Standard", 350],
  "os-lavangi": ["Lavangi Motha", 100], "os-taj28m": ["Taj 28 Medium", 200], "os-taj28g": ["Taj 28 Giant", 150], "os-taj20": ["Taj 20 Deluxe A", 170], "os-taj24": ["Taj 24 Deluxe A", 200],
  "bm-volcano": ["Volcano Sutli Bomb", 200], "bm-laxmi": ["Laxmi Bomb", 150], "bm-two": ["Two Shots", 150], "bm-three": ["Three Shots", 200], "bm-twostd": ["Two Shots Standard", 200]
};

const ORDER_HEADERS = ["Order ID", "Order Date and Time", "Customer Name", "Mobile Number", "Email Address", "Full Delivery Address", "City", "State", "PIN Code", "Product Details", "Total Items", "Subtotal", "Delivery Charges", "Discount", "Grand Total", "Order Status", "Payment Method", "Customer Notes", "Request Token"];
const ITEM_HEADERS = ["Order ID", "Order Date and Time", "Customer Name", "Mobile Number", "Product ID", "Product", "Quantity", "Unit Price", "Line Total"];

/** Finds/creates the sheets and writes the header row (only if missing or different). */
function sheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let os = ss.getSheetByName("Orders");
  if (!os) { const first = ss.getSheets()[0]; if (first.getLastRow() === 0) { first.setName("Orders"); os = first; } else os = ss.insertSheet("Orders"); }
  const is = ss.getSheetByName("Order Items") || ss.insertSheet("Order Items");
  head_(os, ORDER_HEADERS); head_(is, ITEM_HEADERS);
  return { os: os, is: is };
}
function head_(sh, h) {
  const r = sh.getRange(1, 1, 1, h.length);
  if (r.getValues()[0].join("|") !== h.join("|")) { r.setValues([h]).setFontWeight("bold").setBackground("#FFD166"); sh.setFrozenRows(1); }
}
/** One-time: run this from the Apps Script editor to create the headers now. */
function setup() { sheets_(); }

function nextSeq_(os) { return (Number(PropertiesService.getScriptProperties().getProperty("ORDER_SEQ")) || Math.max(0, os.getLastRow() - 1)) + 1; }
function idFor_(n) { return ORDER_PREFIX + String(n).padStart(3, "0"); }

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "next") { // preview of the next Order ID (not reserved)
    try { return out({ ok: true, orderId: idFor_(nextSeq_(sheets_().os)) }); } catch (x) { return out({ ok: false }); }
  }
  return out({ ok: true, service: "NSA Mulund Crackers order API" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    let d;
    try { d = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, error: "Invalid request." }); }
    const err = validate(d); if (err) return out({ ok: false, error: err });

    const sh = sheets_(), os = sh.os, is = sh.is; // creates headers automatically if missing

    const token = String(d.token), tCol = ORDER_HEADERS.length, last = os.getLastRow();
    if (last > 1) { // duplicate protection: same token = same order, return the original
      const toks = os.getRange(2, tCol, last - 1, 1).getValues();
      for (let i = 0; i < toks.length; i++) if (toks[i][0] === token) {
        const r = os.getRange(i + 2, 1, 1, tCol).getValues()[0];
        return out({ ok: true, duplicate: true, orderId: r[0], date: r[1], total: r[14], items: itemsFor(is, r[0]) });
      }
    }
    const c = d.customer, now = new Date(), tz = Session.getScriptTimeZone();
    const date = Utilities.formatDate(now, tz, "dd-MMM-yyyy HH:mm:ss");
    const seq = nextSeq_(os), orderId = idFor_(seq);

    let sub = 0, qty = 0; const items = [];
    d.items.forEach(i => { const p = PRICES[i.id], line = p[1] * i.qty; sub += line; qty += i.qty; items.push({ id: i.id, name: p[0], qty: i.qty, price: p[1], line: line }); });
    const total = sub + DELIVERY_CHARGE;
    if (MIN_ORDER && sub < MIN_ORDER) return out({ ok: false, error: "Minimum order value is ₹" + MIN_ORDER + "." });

    const address = String(c.address).replace(/\s*[\r\n]+\s*/g, ", ");
    const details = items.map(i => i.name + " x " + i.qty + " @ ₹" + i.price + " = ₹" + i.line).join(" | ");
    os.appendRow([orderId, date, S(c.name), S(c.mobile), S(c.email), S(address), S(c.city), S(c.state), S(c.pin), S(details), qty, sub, DELIVERY_CHARGE, 0, total, INITIAL_STATUS, PAYMENT_METHOD, S(c.notes), token]);
    items.forEach(i => is.appendRow([orderId, date, S(c.name), S(c.mobile), i.id, i.name, i.qty, i.price, i.line]));
    PropertiesService.getScriptProperties().setProperty("ORDER_SEQ", String(seq));
    SpreadsheetApp.flush();
    return out({ ok: true, orderId: orderId, date: date, subtotal: sub, delivery: DELIVERY_CHARGE, discount: 0, total: total, items: items });
  } catch (x) {
    console.error(x);
    return out({ ok: false, error: "Could not save the order right now. Please try again or contact us." });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function validate(d) {
  if (!d || typeof d !== "object") return "Invalid request.";
  if (!d.token || String(d.token).length < 8 || String(d.token).length > 80) return "Invalid request token.";
  const c = d.customer || {};
  if (!str(c.name, 80)) return "Name is required.";
  if (!/^[6-9]\d{9}$/.test(String(c.mobile || ""))) return "Invalid mobile number.";
  if (!str(c.address, 400) || !str(c.city, 60) || !str(c.state, 60)) return "Address is incomplete.";
  if (!/^[1-9]\d{5}$/.test(String(c.pin || ""))) return "Invalid PIN code.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email || ""))) return "A valid email address is required.";
  if (!Array.isArray(d.items) || !d.items.length || d.items.length > 60) return "Cart is empty.";
  const seen = {};
  for (const i of d.items) {
    if (!i || !PRICES.hasOwnProperty(i.id)) return "An item in your cart is not available for online ordering. Please contact us.";
    if (seen[i.id]) return "Duplicate item in order."; seen[i.id] = 1;
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 99) return "Invalid quantity.";
  }
  return null;
}
const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
/** Neutralise spreadsheet formula injection and trim long text. */
function S(v) { v = String(v == null ? "" : v).slice(0, 500); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; }
function itemsFor(sh, id) {
  const n = sh.getLastRow(); if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, ITEM_HEADERS.length).getValues().filter(r => r[0] === id).map(r => ({ name: r[5], qty: r[6], price: r[7], line: r[8] }));
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
