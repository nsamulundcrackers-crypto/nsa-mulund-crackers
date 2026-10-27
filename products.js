/* ===== OWNER SETTINGS & CATALOGUE — edit this file only ===== */
window.CONFIG = {
  name: "NSA Mulund Crackers",
  phone: "8559797877",          // 10-digit mobile (CONFIRM this is correct)
  whatsapp: "918559797877",     // country code + number, no + or spaces
  email: "",                    // e.g. "yourname@gmail.com" (shown only if filled)
  endpoint: "",                 // paste your Apps Script Web App URL (ends with /exec)
  deliveryCharge: 0,            // ₹ — backend has its own copy (google-apps-script.js)
  minOrder: 0,                  // ₹ minimum order value
  policies: {
    delivery: "EDIT BEFORE LAUNCH: Delivery areas, timings and charges. Delivery only where permitted by local law.",
    cancellation: "EDIT BEFORE LAUNCH: Cancellation rules (e.g. before dispatch only).",
    refund: "EDIT BEFORE LAUNCH: Refund rules (e.g. damaged or wrong items reported within 24 hours).",
    terms: "EDIT BEFORE LAUNCH: Terms and conditions. Orders are subject to confirmation, stock availability and applicable law."
  }
};

window.CATEGORIES = [
  { id: "sparkler", name: "Sparkler", icon: "✨", desc: "Hand-held sparkling sticks for every age." },
  { id: "flowerpot", name: "Flower Pot", icon: "🌸", desc: "Fountains of colourful sparks (Anar)." },
  { id: "chakkar", name: "Ground Chakkars", icon: "🌀", desc: "Spinning wheels of light on the ground." },
  { id: "onesound", name: "One Sound Crackers", icon: "💥", desc: "Classic single-bang crackers." },
  { id: "bombs", name: "Bombs", icon: "🧨", desc: "Loud, festive bombs and shot crackers." },
  { id: "rockets", name: "Rockets", icon: "🚀", desc: "Sky-shooting rockets." },
  { id: "fancy", name: "Fancy Fireworks", icon: "🎆", desc: "Premium shows and special effects." }
];

/* id must be unique & unchanging. price = selling price in ₹ (number). null = "Price coming soon".
   mrp = optional original price (shows discount). img = path like "images/anar-special.jpg" ("" = placeholder).
   featured:true shows in Featured. Names/prices below are from the owner; descriptions are generic.
   IMPORTANT: when you add/change a price here, also change it in google-apps-script.js (PRICES). */
window.PRODUCTS = [
  { id:"sp-9sai", cat:"sparkler", name:"9 CM Sai Baba", price:50, mrp:null, img:"", desc:"Sparkler pack." },
  { id:"sp-12p", cat:"sparkler", name:"12 CM Plain", price:100, mrp:null, img:"", desc:"Sparkler pack." },
  { id:"sp-12c", cat:"sparkler", name:"12 CM Colour", price:120, mrp:null, img:"", desc:"Colour sparkler pack." },
  { id:"sp-15p", cat:"sparkler", name:"15 CM Plain", price:150, mrp:null, img:"", desc:"Sparkler pack.", featured:true },
  { id:"sp-15c", cat:"sparkler", name:"15 CM Colour", price:150, mrp:null, img:"", desc:"Colour sparkler pack." },
  { id:"sp-30p", cat:"sparkler", name:"30 CM Plain", price:170, mrp:null, img:"", desc:"Long sparkler pack." },
  { id:"sp-30c", cat:"sparkler", name:"30 CM Colour", price:170, mrp:null, img:"", desc:"Long colour sparkler pack." },
  { id:"fp-special", cat:"flowerpot", name:"Anar Special Standard", price:200, mrp:null, img:"", desc:"Flower pot (Anar)." },
  { id:"fp-giant", cat:"flowerpot", name:"Anar Giant Standard", price:250, mrp:null, img:"", desc:"Flower pot (Anar).", featured:true },
  { id:"fp-big", cat:"flowerpot", name:"Anar Big Standard", price:300, mrp:null, img:"", desc:"Flower pot (Anar)." },
  { id:"ch-big", cat:"chakkar", name:"Chakkar Big Standard", price:200, mrp:null, img:"", desc:"Ground chakkar." },
  { id:"ch-spbig", cat:"chakkar", name:"Chakkar Special Big", price:250, mrp:null, img:"", desc:"Ground chakkar." },
  { id:"ch-spstd", cat:"chakkar", name:"Chakkar Special Standard", price:300, mrp:null, img:"", desc:"Ground chakkar." },
  { id:"ch-deluxe", cat:"chakkar", name:"Chakkar Deluxe Standard", price:350, mrp:null, img:"", desc:"Ground chakkar." },
  { id:"os-lavangi", cat:"onesound", name:"Lavangi Motha", price:100, mrp:null, img:"", desc:"One sound cracker." },
  { id:"os-taj28m", cat:"onesound", name:"Taj 28 Medium", price:200, mrp:null, img:"", desc:"One sound cracker." },
  { id:"os-taj28g", cat:"onesound", name:"Taj 28 Giant", price:150, mrp:null, img:"", desc:"One sound cracker." },
  { id:"os-taj20", cat:"onesound", name:"Taj 20 Deluxe A", price:170, mrp:null, img:"", desc:"One sound cracker." },
  { id:"os-taj24", cat:"onesound", name:"Taj 24 Deluxe A", price:200, mrp:null, img:"", desc:"One sound cracker." },
  { id:"bm-volcano", cat:"bombs", name:"Volcano Sutli Bomb", price:200, mrp:null, img:"", desc:"Sutli bomb." },
  { id:"bm-laxmi", cat:"bombs", name:"Laxmi Bomb", price:150, mrp:null, img:"", desc:"Laxmi bomb." },
  { id:"bm-two", cat:"bombs", name:"Two Shots", price:150, mrp:null, img:"", desc:"Shot cracker." },
  { id:"bm-three", cat:"bombs", name:"Three Shots", price:200, mrp:null, img:"", desc:"Shot cracker." },
  { id:"bm-twostd", cat:"bombs", name:"Two Shots Standard", price:200, mrp:null, img:"", desc:"Shot cracker." }
  /* Rockets & Fancy Fireworks: add your products here (or via the #admin page). */
];
