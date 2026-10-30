/**
 * NSA Mulund Crackers — Sheets-backed ordering and inventory API.
 * Deploy as Apps Script Web App. Spreadsheet data is authoritative.
 * Run initializeApplication() manually once before deploying.
 */
const APP = Object.freeze({
  SPREADSHEET_ID: '1BKpfkos7HxZ_ePozbW2D2l6-v_gwmE4119tUl223fjE',
  ORDER_PREFIX: 'NSA-26-',
  PRODUCT_PREFIX: 'NSA-P-',
  LOCK_MS: 30000,
  MAX_LINES: 100,
  MAX_QTY: 99,
  COMBO_DISCOUNT: 0.10,
  SHEETS: {
    PRODUCTS: 'Product Details', ONLINE: 'Orders', ONLINE_ITEMS: 'Order Items',
    OFFLINE: 'Offline Order', OFFLINE_ITEMS: 'Offline Order Items',
    LOG: 'Invoice & Email Log', COMBOS: 'Combos', JOURNAL: 'Order Processing Log'
  }
});

const HEADERS = Object.freeze({
  ONLINE: ['Order ID','Order Date and Time','Customer Name','Mobile Number','Email Address','Full Delivery Address','City','State','PIN Code','Product Details','Total Items','Subtotal','Delivery Charges','Discount','Grand Total','Order Status','Payment Method','Customer Notes','Request Token','Payment Status'],
  ONLINE_ITEMS: ['Order ID','Order Date and Time','Customer Name','Mobile Number','Product ID','Product','Quantity','Unit Price','Line Total','Combo ID','Combo Name','Allocated Discount','Final Line Total','Unit Cost'],
  OFFLINE: ['Order ID','Order Date and Time','Subtotal','Discount','Grand Total','Order Status','Payment Method','Payment Status','Order Source','Request Token'],
  OFFLINE_ITEMS: ['Order ID','Product ID','Product','Quantity','Unit Price','Line Total','Combo ID','Combo Name','Allocated Discount','Final Line Total','Unit Cost'],
  LOG: ['Order ID','Invoice Number','Invoice Date','Invoice Status','Invoice Drive File ID','Invoice URL','Invoice Error','Email Status','Email Attempts','Email Last Attempt','Email Error'],
  COMBOS: ['Combo ID','Combo Name','Product ID','Quantity','Active'],
  JOURNAL: ['Request Token','Order ID','Order Source','Processing Status','Created At','Last Error']
});

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '');
    if (action === 'products') return json_(getProducts_());
    if (action === 'combos') return json_(getCombos_());
    if (action === 'next') return json_({ok:true, orderId:previewOrderId_()});
    if (action === 'report') return json_(getSalesReport_());
    return json_({ok:true, service:'NSA Mulund Crackers API', version:2});
  } catch (err) { return json_({ok:false,error:safeError_(err)}); }
}

function doPost(e) {
  let payload;
  try { payload = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
  catch (_) { return json_({ok:false,error:'Invalid JSON request.'}); }
  const action = String(payload.action || 'onlineOrder');
  if (action === 'offlineOrder') return json_(processOrder_(payload, 'OFFLINE'));
  if (action === 'onlineOrder') return json_(processOrder_(payload, 'ONLINE'));
  return json_({ok:false,error:'Unsupported action.'});
}

/** Safe, repeatable setup. Never clears or overwrites existing data. */
function initializeApplication() {
  const lock = LockService.getScriptLock(); lock.waitLock(APP.LOCK_MS);
  try {
    const ss = ss_();
    const productSheet = ss.getSheetByName(APP.SHEETS.PRODUCTS);
    if (!productSheet || productSheet.getLastRow() < 2) throw new Error('Product Details is missing or contains no product records. Populate it before initialization.');
    const pmap = headerMap_(productSheet);
    ['Sr No','Category','Product Name','Product_Quantity','Product_Price','Remaining_Quantity'].forEach(h => {
      if (!pmap[norm_(h)]) throw new Error('Product Details is missing required column: ' + h);
    });
    ensureColumn_(productSheet, 'Product ID');
    assignMissingProductIds_(productSheet);
    validateProductIds_(productSheet);
    ensureSheetHeaders_(ss, APP.SHEETS.ONLINE, HEADERS.ONLINE, true);
    ensureSheetHeaders_(ss, APP.SHEETS.ONLINE_ITEMS, HEADERS.ONLINE_ITEMS, true);
    ensureSheetHeaders_(ss, APP.SHEETS.OFFLINE, HEADERS.OFFLINE, false);
    ensureSheetHeaders_(ss, APP.SHEETS.OFFLINE_ITEMS, HEADERS.OFFLINE_ITEMS, false);
    ensureSheetHeaders_(ss, APP.SHEETS.LOG, HEADERS.LOG, false);
    ensureSheetHeaders_(ss, APP.SHEETS.JOURNAL, HEADERS.JOURNAL, false);
    const combo = ensureSheetHeaders_(ss, APP.SHEETS.COMBOS, HEADERS.COMBOS, false);
    seedCombosIfEmpty_(combo);
    SpreadsheetApp.flush();
    return {ok:true,message:'Initialization completed without clearing existing records.',productCount:readProducts_().length};
  } finally { lock.releaseLock(); }
}

function getProducts_() {
  const products = readProducts_();
  if (!products.length) throw new Error('No products found in Product Details.');
  return {ok:true, products:products, fetchedAt:new Date().toISOString()};
}
function readProducts_() {
  const sh = ss_().getSheetByName(APP.SHEETS.PRODUCTS);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues(), headers = values[0], ix = indexMap_(headers);
  const required = ['product id','category','product name','product price','remaining quantity'];
  required.forEach(h => { if (ix[h] == null) throw new Error('Product Details is missing required column: ' + h); });
  return values.slice(1).filter(r => String(r[ix['product name']] || '').trim()).map(r => ({
    id:String(r[ix['product id']] || '').trim(), category:String(r[ix.category] || 'Other').trim(),
    name:String(r[ix['product name']] || '').trim(), quantity:number_(r[ix['product quantity']]),
    price:number_(r[ix['product price']]), stock:number_(r[ix['remaining quantity']]),
    description:'', cost: ix['purchase cost'] == null || r[ix['purchase cost']] === '' ? null : number_(r[ix['purchase cost']])
  })).filter(p => p.id);
}

function getCombos_() {
  const products = readProducts_(), byId = Object.fromEntries(products.map(p => [p.id,p]));
  const sh = ss_().getSheetByName(APP.SHEETS.COMBOS);
  if (!sh || sh.getLastRow() < 2) return {ok:true,combos:[]};
  const rows = sh.getDataRange().getValues(), ix = indexMap_(rows[0]), groups = {};
  rows.slice(1).forEach(r => {
    const id = String(r[ix['combo id']] || '').trim(); if (!id || String(r[ix.active]).toLowerCase() === 'false') return;
    const pid = String(r[ix['product id']] || '').trim(), q = Number(r[ix.quantity]);
    if (!byId[pid] || !Number.isInteger(q) || q < 1) return;
    if (!groups[id]) groups[id] = {id:id,name:String(r[ix['combo name']] || id),items:[],originalPrice:0,price:0,discountRate:APP.COMBO_DISCOUNT,available:true};
    const p = byId[pid]; groups[id].items.push({id:pid,name:p.name,qty:q,unitPrice:p.price,stock:p.stock});
    groups[id].originalPrice += p.price*q;
    if (p.stock < q) groups[id].available = false;
  });
  const combos = Object.values(groups).map(c => {
    c.discount = round2_(c.originalPrice*APP.COMBO_DISCOUNT); c.price = round2_(c.originalPrice-c.discount); return c;
  });
  return {ok:true,combos:combos};
}

function processOrder_(payload, source) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(APP.LOCK_MS);
    const token = String(payload.token || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,100}$/.test(token)) throw new Error('A valid unique request token is required.');
    const existing = findByToken_(token);
    if (existing) return Object.assign({ok:true,duplicate:true},existing);
    const products = readProducts_(), byId = Object.fromEntries(products.map(p => [p.id,p]));
    const lines = expandAndValidateLines_(payload, source, byId);
    const extraDiscount = source === 'OFFLINE' ? validateDiscount_(payload.discount, lines.subtotal - lines.comboDiscount) : 0;
    const discount = round2_(lines.comboDiscount + extraDiscount);
    const delivery = 0;
    const grand = round2_(lines.subtotal + delivery - discount);
    if (grand < 0) throw new Error('Discount cannot exceed the order subtotal.');
    const seq = nextSequence_(), orderId = APP.ORDER_PREFIX + String(seq).padStart(3,'0');
    const now = new Date(), dateText = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm:ss');
    const ss = ss_(), orderSheet = ss.getSheetByName(source === 'ONLINE' ? APP.SHEETS.ONLINE : APP.SHEETS.OFFLINE);
    const itemSheet = ss.getSheetByName(source === 'ONLINE' ? APP.SHEETS.ONLINE_ITEMS : APP.SHEETS.OFFLINE_ITEMS);
    const productSheet = ss.getSheetByName(APP.SHEETS.PRODUCTS);
    const productRows = productRowMap_(productSheet);
    const stockBefore = [], demand = {};
    lines.items.forEach(it => { demand[it.id] = (demand[it.id] || 0) + it.qty; });
    Object.keys(demand).forEach(pid => {
      const row = productRows[pid]; if (!row) throw new Error('Product ID no longer exists: '+pid);
      const stockCell = productSheet.getRange(row.row,row.stockCol), old = Number(stockCell.getValue());
      if (!Number.isFinite(old) || old < demand[pid]) throw new Error('Insufficient stock for '+pid+'. Available: '+old+', requested: '+demand[pid]+'.');
      stockBefore.push({cell:stockCell,value:old,qty:demand[pid]});
    });
    const allocated = allocateDiscount_(lines.items, discount);
    const customer = source === 'ONLINE' ? validateCustomer_(payload.customer || {}) : null;
    const orderDetails = lines.items.map(i => i.name+' x '+i.qty+' @ '+i.unitPrice+' = '+i.lineTotal).join(' | ');
    const orderRow = source === 'ONLINE' ? [orderId,dateText,customer.name,customer.mobile,customer.email,customer.address,customer.city,customer.state,customer.pin,orderDetails,lines.totalQty,lines.subtotal,delivery,discount,grand,'Pending Confirmation','To be confirmed',customer.notes,token,'Pending']
      : [orderId,dateText,lines.subtotal,discount,grand,'Completed',String(payload.paymentMethod || 'Cash').slice(0,40),String(payload.paymentStatus || 'Paid').slice(0,30),'Offline',token];
    const itemRows = lines.items.map((it,i) => {
      const a = allocated[i], cost = it.cost == null ? '' : it.cost;
      return source === 'ONLINE'
        ? [orderId,dateText,customer.name,customer.mobile,it.id,it.name,it.qty,it.unitPrice,it.lineTotal,it.comboId || '',it.comboName || '',a,round2_(it.lineTotal-a),cost]
        : [orderId,it.id,it.name,it.qty,it.unitPrice,it.lineTotal,it.comboId || '',it.comboName || '',a,round2_(it.lineTotal-a),cost];
    });
    let orderWritten=false, itemStart=0, itemWritten=false, stockWritten=0;
    try {
      orderSheet.appendRow(orderRow); orderWritten=true;
      itemStart=itemSheet.getLastRow()+1;
      itemSheet.getRange(itemStart,1,itemRows.length,itemRows[0].length).setValues(itemRows); itemWritten=true;
      stockBefore.forEach(s => { s.cell.setValue(s.value - s.qty); stockWritten++; });
      SpreadsheetApp.flush();
      verifySaved_(orderSheet,itemSheet,orderId,itemRows.length);
      PropertiesService.getScriptProperties().setProperty('LAST_ORDER_SEQUENCE',String(seq));
      appendJournal_(token,orderId,source,'COMPLETED','');
      return {ok:true,orderId:orderId,date:dateText,subtotal:lines.subtotal,delivery:delivery,discount:discount,total:grand,items:lines.items.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.unitPrice,line:i.lineTotal,comboName:i.comboName||''}))};
    } catch (err) {
      // Compensating rollback while the script lock is still held.
      // Find rows by Order ID instead of assuming the last row is ours.
      try { stockBefore.forEach(s => s.cell.setValue(s.value)); } catch (_) {}
      try { deleteRowsForOrder_(itemSheet, orderId); } catch (_) {}
      try { deleteRowsForOrder_(orderSheet, orderId); } catch (_) {}
      SpreadsheetApp.flush();
      try { appendJournal_(token,orderId,source,'ROLLED_BACK',safeError_(err)); } catch (_) {}
      throw new Error('Order was not completed; rollback was attempted. ' + safeError_(err));
    }
  } catch (err) { return {ok:false,error:safeError_(err)}; }
  finally { try { lock.releaseLock(); } catch (_) {} }
}

function expandAndValidateLines_(payload, source, byId) {
  if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length>APP.MAX_LINES) throw new Error('Cart is empty or contains too many lines.');
  const comboData = getCombos_().combos, comboMap = Object.fromEntries(comboData.map(c=>[c.id,c]));
  const agg = {}; let comboDiscount = 0;
  payload.items.forEach(raw => {
    const qty=Number(raw.qty); if (!Number.isInteger(qty)||qty<1||qty>APP.MAX_QTY) throw new Error('Every quantity must be a whole number between 1 and '+APP.MAX_QTY+'.');
    if (raw.type === 'combo' || String(raw.id||'').startsWith('NSA-C-')) {
      const combo=comboMap[String(raw.id||raw.comboId||'')]; if (!combo) throw new Error('Invalid or inactive combo.');
      combo.items.forEach(ci=>addLine_(agg,byId[ci.id],ci.qty*qty,combo.id,combo.name));
      comboDiscount += round2_(combo.discount * qty);
    } else {
      const id=String(raw.id||raw.productId||''); if (!byId[id]) throw new Error('Unknown product: '+id);
      addLine_(agg,byId[id],qty,'','');
    }
  });
  const items=Object.values(agg); items.forEach(i=>{i.lineTotal=round2_(i.unitPrice*i.qty);});
  return {items:items,totalQty:items.reduce((a,i)=>a+i.qty,0),subtotal:round2_(items.reduce((a,i)=>a+i.lineTotal,0)),comboDiscount:round2_(comboDiscount)};
}
function addLine_(agg,p,qty,comboId,comboName) {
  if (!p || !p.id) throw new Error('Combo references an unknown product.');
  const k=p.id+'|'+comboId;
  if (!agg[k]) agg[k]={id:p.id,name:p.name,qty:0,unitPrice:p.price,cost:p.cost,comboId:comboId,comboName:comboName};
  agg[k].qty+=qty;
}
function validateDiscount_(d,subtotal) {
  if (d == null || d === '' || (typeof d==='object' && !d.value)) return 0;
  const type=String(d.type||'amount'), value=Number(d.value);
  if (!Number.isFinite(value)||value<0) throw new Error('Discount must be a non-negative number.');
  if (type==='percent') { if (value>100) throw new Error('Percentage discount cannot exceed 100%.'); return round2_(subtotal*value/100); }
  if (type!=='amount') throw new Error('Discount type must be amount or percent.');
  if (value>subtotal) throw new Error('Discount cannot exceed subtotal.'); return round2_(value);
}
function allocateDiscount_(items,totalDiscount) {
  if (!totalDiscount) return items.map(()=>0);
  const subtotal=items.reduce((s,i)=>s+i.lineTotal,0); let used=0;
  return items.map((i,index)=>{const a=index===items.length-1?round2_(totalDiscount-used):round2_(totalDiscount*i.lineTotal/subtotal);used+=a;return a;});
}
function validateCustomer_(c) {
  const name=clean_(c.name,80),mobile=String(c.mobile||'');
  if (!name) throw new Error('Customer name is required.');
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new Error('Invalid customer mobile number.');
  const email=String(c.email||''); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email address.');
  const address=clean_(c.address,400),city=clean_(c.city,60),state=clean_(c.state,60),pin=String(c.pin||'');
  if (!address||!city||!state||!/^[1-9]\d{5}$/.test(pin)) throw new Error('Delivery address, city, state and valid PIN code are required.');
  return {name:name,mobile:mobile,email:email,address:address,city:city,state:state,pin:pin,notes:clean_(c.notes,300)};
}
function productRowMap_(sh) {
  const v=sh.getDataRange().getValues(),ix=indexMap_(v[0]),map={};
  if(ix['product id']==null||ix['remaining quantity']==null)throw new Error('Product ID or Remaining_Quantity column is missing. Run initializeApplication().');
  v.slice(1).forEach((r,i)=>{const id=String(r[ix['product id']]||'').trim();if(id)map[id]={row:i+2,stockCol:ix['remaining quantity']+1};}); return map;
}
function assignMissingProductIds_(sh) {
  const v=sh.getDataRange().getValues(),ix=indexMap_(v[0]),idCol=ix['product id']+1,srCol=ix['sr no'];
  for(let r=1;r<v.length;r++) {
    if(!String(v[r][ix['product name']]||'').trim()||String(v[r][idCol-1]||'').trim())continue;
    const sr=Number(v[r][srCol]); if(!Number.isFinite(sr)||sr<1)throw new Error('Cannot assign Product ID: invalid Sr No at row '+(r+1));
    sh.getRange(r+1,idCol).setValue(APP.PRODUCT_PREFIX+String(Math.floor(sr)).padStart(3,'0'));
  }
}

function validateProductIds_(sh) {
  const values=sh.getDataRange().getValues(), ix=indexMap_(values[0]), ids={}, serials={};
  for(let r=1;r<values.length;r++) {
    if(!String(values[r][ix['product name']]||'').trim()) continue;
    const id=String(values[r][ix['product id']]||'').trim(), sr=String(values[r][ix['sr no']]||'').trim();
    if(!id) throw new Error('Missing Product ID at Product Details row '+(r+1)+'.');
    if(ids[id]) throw new Error('Duplicate Product ID '+id+' at rows '+ids[id]+' and '+(r+1)+'.');
    if(sr && serials[sr]) throw new Error('Duplicate Sr No '+sr+' at rows '+serials[sr]+' and '+(r+1)+'.');
    ids[id]=r+1; if(sr)serials[sr]=r+1;
  }
}

function seedCombosIfEmpty_(sh) {
  if(sh.getLastRow()>1)return;
  // Product IDs follow the existing Sr No in the supplied Product Details workbook.
  // Combo membership is stored by ID; prices are always recalculated from Product Details.
  const defs=[
    ['NSA-C-001','Sparkle Starter',[['NSA-P-003',2],['NSA-P-004',2],['NSA-P-005',2],['NSA-P-006',2]]],
    ['NSA-C-002','Family Lights',[['NSA-P-003',2],['NSA-P-005',2],['NSA-P-031',1],['NSA-P-036',1],['NSA-P-033',1]]],
    ['NSA-C-003','Festive Mix',[['NSA-P-006',2],['NSA-P-009',1],['NSA-P-031',1],['NSA-P-039',1],['NSA-P-041',1]]],
    ['NSA-C-004','Grand Celebration',[['NSA-P-010',1],['NSA-P-032',1],['NSA-P-034',1],['NSA-P-044',1],['NSA-P-063',1]]]
  ];
  const rows=[]; defs.forEach(d=>d[2].forEach(x=>rows.push([d[0],d[1],x[0],x[1],true])));
  sh.getRange(2,1,rows.length,5).setValues(rows);
}
function nextSequence_() {
  const props=Number(PropertiesService.getScriptProperties().getProperty('LAST_ORDER_SEQUENCE'))||0;
  const ss=ss_(); let max=props;
  [APP.SHEETS.ONLINE,APP.SHEETS.OFFLINE].forEach(n=>{const sh=ss.getSheetByName(n);if(!sh||sh.getLastRow()<2)return;const ids=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();ids.forEach(r=>{const m=String(r[0]).match(/^NSA-26-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));});});
  return max+1;
}
function previewOrderId_(){return APP.ORDER_PREFIX+String(nextSequence_()).padStart(3,'0');}
function findByToken_(token) {
  const ss=ss_(); for(const name of [APP.SHEETS.ONLINE,APP.SHEETS.OFFLINE]) {const sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<2)continue;const v=sh.getDataRange().getValues(),ix=indexMap_(v[0]),ti=ix['request token'];if(ti==null)continue;for(let i=1;i<v.length;i++)if(String(v[i][ti])===token){return {orderId:String(v[i][0]),date:v[i][1],total:Number(v[i][name===APP.SHEETS.ONLINE?14:4]),items:[]};}}
  return null;
}
function verifySaved_(os,is,id,count) {
  const last=os.getLastRow(),found=os.getRange(2,1,Math.max(0,last-1),1).getValues().some(r=>String(r[0])===id);
  if(!found)throw new Error('Order header verification failed.');
  const n=is.getLastRow();if(n<count+1)throw new Error('Order item verification failed.');
  const ids=is.getRange(2,1,n-1,1).getValues().filter(r=>String(r[0])===id).length;
  if(ids!==count)throw new Error('Expected '+count+' item rows, found '+ids+'.');
}
function appendJournal_(token,id,source,status,error){const sh=ss_().getSheetByName(APP.SHEETS.JOURNAL);if(sh)sh.appendRow([token,id,source,status,new Date(),String(error||'').slice(0,500)]);}
function getSalesReport_() {
  const ss = ss_();
  const result = {ok:true, onlineOrders:0, offlineOrders:0, onlineSales:0, offlineSales:0,
    discounts:0, netSales:0, quantitySold:{}, costAvailable:false,
    estimatedCogs:null, estimatedGrossProfit:null, notes:[]};
  const acceptedOrderIds = {};
  [[APP.SHEETS.ONLINE,'online'],[APP.SHEETS.OFFLINE,'offline']].forEach(([name,key]) => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const values = sh.getDataRange().getValues();
    const ix = indexMap_(values[0]);
    if (ix['order id'] == null || ix['grand total'] == null) return;
    values.slice(1).forEach(row => {
      const id = String(row[ix['order id']] || '').trim();
      if (!id) return;
      const status = String(ix['order status'] == null ? '' : row[ix['order status']]).toLowerCase().trim();
      if (['cancelled','canceled','failed','rolled back','rejected'].includes(status)) return;
      const total = Number(row[ix['grand total']]);
      const discount = ix.discount == null ? 0 : Number(row[ix.discount] || 0);
      if (!Number.isFinite(total)) return;
      result[key + 'Orders']++;
      result[key + 'Sales'] += total;
      result.discounts += Number.isFinite(discount) ? discount : 0;
      acceptedOrderIds[id] = true;
    });
  });
  let cogs = 0, allCostsPresent = true, soldLineCount = 0;
  [APP.SHEETS.ONLINE_ITEMS,APP.SHEETS.OFFLINE_ITEMS].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const values = sh.getDataRange().getValues();
    const ix = indexMap_(values[0]);
    if (ix['order id'] == null || ix['product id'] == null || ix.quantity == null) return;
    values.slice(1).forEach(row => {
      const orderId = String(row[ix['order id']] || '').trim();
      if (!acceptedOrderIds[orderId]) return;
      const productId = String(row[ix['product id']] || '').trim();
      const qty = Number(row[ix.quantity] || 0);
      if (!productId || !Number.isFinite(qty) || qty <= 0) return;
      result.quantitySold[productId] = (result.quantitySold[productId] || 0) + qty;
      soldLineCount++;
      const cost = ix['unit cost'] == null ? '' : row[ix['unit cost']];
      if (cost === '' || cost == null || !Number.isFinite(Number(cost))) allCostsPresent = false;
      else cogs += Number(cost) * qty;
    });
  });
  result.onlineSales = round2_(result.onlineSales);
  result.offlineSales = round2_(result.offlineSales);
  result.discounts = round2_(result.discounts);
  result.netSales = round2_(result.onlineSales + result.offlineSales);
  result.costAvailable = soldLineCount > 0 && allCostsPresent;
  result.estimatedCogs = result.costAvailable ? round2_(cogs) : null;
  result.estimatedGrossProfit = result.costAvailable ? round2_(result.netSales - result.estimatedCogs) : null;
  if (!result.costAvailable) result.notes.push('Purchase Cost was not supplied and captured for every sold product line; COGS and gross profit are unavailable.');
  result.notes.push('Sales include orders not marked Cancelled, Failed, Rolled Back or Rejected. Payment status is reported separately and is not used as a sales exclusion.');
  return result;
}

/** Delete all rows for one order ID, from bottom to top, without touching other orders. */
function deleteRowsForOrder_(sheet, orderId) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(orderId)) sheet.deleteRow(i + 2);
  }
}

function ensureSheetHeaders_(ss,name,headers,existingMustExist) {
  let sh=ss.getSheetByName(name);if(!sh){if(existingMustExist)throw new Error('Required existing sheet is missing: '+name);sh=ss.insertSheet(name);}
  if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');sh.setFrozenRows(1);return sh;}
  let current=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getValues()[0].map(String),norm=current.map(norm_);
  headers.forEach(h=>{if(norm.indexOf(norm_(h))<0){const col=sh.getLastColumn()+1;sh.getRange(1,col).setValue(h).setFontWeight('bold');norm.push(norm_(h));}});
  return sh;
}
function ensureColumn_(sh,name){const m=headerMap_(sh);if(!m[norm_(name)])sh.getRange(1,sh.getLastColumn()+1).setValue(name).setFontWeight('bold');}
function headerMap_(sh){return Object.fromEntries(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map((v,i)=>[norm_(v),i+1]));}
function indexMap_(headers){return Object.fromEntries(headers.map((v,i)=>[norm_(v),i]));}
function norm_(s){return String(s||'').trim().toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ');}
function ss_(){return SpreadsheetApp.openById(APP.SPREADSHEET_ID);}
function number_(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function round2_(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function clean_(v,max){return String(v==null?'':v).replace(/[\r\n]+/g,' ').trim().slice(0,max);}
function safeError_(e){return String(e&&e.message||e||'Unexpected error').slice(0,500);}
function json_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}


/** Optional alias for users who prefer a shorter setup function name. */
function setupApplication() { return initializeApplication(); }
