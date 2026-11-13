(async () => {
  const root = document.getElementById("opening-filters");
  const el = key => root.querySelector("#of-" + key);
  async function load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load " + url);
    return response;
  }
  const {meta, five, assets} = await (await load("data-58dd697a0fb8.json")).json();
  async function unpack(url) {
    const response = await load(url);
    const decoded = response.body.pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(decoded).arrayBuffer());
  }
  const [baseBytes, extra, gridBytes, fifthBytes] = await Promise.all(
    [assets.base, assets.fourth, assets.grid, assets.fifth].map(unpack)
  );
  const data=JSON.parse(new TextDecoder().decode(baseBytes));
  let offset=0;
  function byteColumn(n) {
    const column=extra.subarray(offset,offset+n);
    offset+=n;
    return column;
  }
  function intColumn(n,width,signed=false) {
    const column=new Int32Array(n);
    for(let j=0;j<width;j++) {
      const plane=byteColumn(n);
      for(let i=0;i<n;i++) column[i]|=plane[i]<<(8*j);
    }
    if(signed) for(let i=0;i<n;i++) column[i]=column[i]<<(32-8*width)>>(32-8*width);
    return column;
  }
  const groups=byteColumn(meta.groups), bestReply=intColumn(meta.groups,2,true);
  const replies=byteColumn(meta.edges), child=intColumn(meta.edges,3);
  const childScore=intColumn(meta.positions,2,true), playedBits=byteColumn(Math.ceil(meta.positions/8));
  const gameCounts=new Uint32Array(meta.orders);
  for(let i=0;i<gameCounts.length;i++) {
    let value=0, factor=1, next;
    do {next=extra[offset++];value+=(next&127)*factor;factor*=128;} while(next&128);
    gameCounts[i]=value;
  }
  if(offset!==extra.length) throw new Error("Incomplete opening data");
  const after = ["1. White","1… Black","2. White","2… Black","3. White"];
  const marks = [0,25,50,75,100];
  const percent = new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  const num = new Intl.NumberFormat("en-US");
  const compact = new Intl.NumberFormat("en-US",{notation:"compact",maximumSignificantDigits:3});
  for(const [ply,orders,total,range] of meta.forecast) {
    const row=document.createElement("tr"), label=document.createElement("th");
    label.scope="row";label.textContent=ply;row.append(label);
    for(const text of [range?compact.format(orders):num.format(orders),percent.format(orders/total),
      range?range.map(n=>compact.format(n)).join(" – "):"Exact"]) {
      const cell=document.createElement("td");cell.className="text-end tabular-nums";cell.textContent=text;row.append(cell);
    }
    el("forecast").append(row);
  }
  el("workload").textContent="Ply 6 reaches "+num.format(meta.six.candidates)+" distinct candidate positions. The repertoire DB covers "+num.format(meta.six.candidates-meta.six.db_missing)+" and local SF19 scores cover another "+num.format(meta.six.local_hits)+".";
  el("rate").textContent="Times use the measured five-worker rate of "+meta.rate.toFixed(1)+" positions per second after the Lichess scan finished, at 100,000 nodes per position. The full ply-5 run averaged "+meta.concurrentRate.toFixed(1)+".";
  const change=meta.changes;
  el("changes").textContent="At the 1.00 caps, "+num.format(change.after)+" ply-4 move orders qualify with Stockfish 19 fills. Of the "+num.format(change.before)+" that qualified with Stockfish 18, "+num.format(change.left)+" dropped out. Another "+num.format(change.entered)+" now qualify.";
  for(const [ply,missing,interval] of meta.fill) {
    const hours=missing/meta.rate/3600, days=hours>=48;
    const time=(days?hours/24:hours).toLocaleString("en-US",{maximumSignificantDigits:2})+(days?" days":" hours");
    const row=el("engine-time").insertRow(),label=document.createElement("th");
    label.scope="row";label.textContent=ply;row.append(label);
    for(const text of [interval?compact.format(missing):num.format(missing),interval?interval.map(n=>compact.format(n)).join(" – "):"Exact",time]) {
      const cell=row.insertCell();cell.className="text-end tabular-nums";cell.textContent=text;
    }
  }
  const pawns = cp => (cp / 100).toFixed(2);
  const signed = cp => (cp >= 0 ? "+" : "−") + pawns(Math.abs(cp));
  const m = 78 / 58;
  const a = ((-142.72052667*m+372.35176398)*m-340.71073572)*m+415.23490212;
  const b = ((5.93832785*m+15.61267078)*m-30.57816876)*m+69.63866711;
  function win(cp) {
    const p = 100 / (1 + Math.exp((a / b) * (1 - cp/100)));
    return p < 0.01 ? "<0.01%" : p.toFixed(p < 1 ? 2 : 1) + "%";
  }
  function tag(name,text,cls) {
    const node = document.createElement(name);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function ticks(id,fn) {
    el(id).replaceChildren(...marks.map(v => tag("span",fn(v))));
  }
  function prepare() {
    const scores = data.cache;
    const rootScore = scores[data.root];
    let previous = null;
    const prepared=data.layers.map((edges,ply) => {
      const sign = ply % 2 ? -1 : 1;
      const cp = edges.map(([, ,id]) => scores[id]);
      const best = new Map();
      edges.forEach(([parent],i) => best.set(parent,Math.max(best.get(parent) ?? -Infinity, sign*cp[i])));
      const moves = edges.map(([parent,san,id,games],i) => {
        const prefix = previous?.[parent];
        const loss = Math.max(prefix?.loss ?? 0, best.get(parent)-sign*cp[i]);
        const band = Math.max(prefix?.band ?? Math.abs(rootScore), Math.abs(cp[i]));
        const pgn = prefix ? prefix.pgn + (ply===2 ? " 2. " : " ") + san : "1. " + san;
        return {san,id,cp:cp[i],loss,band,pgn,games};
      });
      previous = moves;
      return {moves};
    });
    const starts=new Uint32Array(groups.length+1);
    groups.forEach((n,i)=>starts[i+1]=starts[i]+n);
    const moves=[];
    let route=0;
    for(const prefix of previous) {
      if(prefix.loss>meta.cap || prefix.band>meta.cap) continue;
      for(let i=starts[prefix.id];i<starts[prefix.id+1];i++) {
        const id=child[i], cp=childScore[id], san=meta.san[replies[i]];
        moves.push({id,san,cp,loss:Math.max(prefix.loss,cp-bestReply[prefix.id]),
          band:Math.max(prefix.band,Math.abs(cp)),pgn:prefix.pgn+" "+san,games:gameCounts[route++]});
      }
    }
    if(route!==meta.orders) throw new Error("Incomplete move orders");
    prepared.push({moves});
    for(const layer of prepared) {
      layer.moves.slice().sort((a,b)=>alphabetical.compare(a.pgn,b.pgn)).forEach((line,index)=>line.rank=index);
    }
    return prepared;
  }
  const legalTotals = data.layers.map(edges => {
    const played = edges.filter(row => row[3]);
    return {
      orders: edges.length,
      positions: new Set(edges.map(row => row[2])).size,
      playedOrders: played.length,
      playedPositions: new Set(played.map(row => row[2]))
    };
  });
  legalTotals.push({orders:197281,positions:meta.positions,playedOrders:meta.playedOrders,
    playedPositions:{size:meta.playedPositions,has:id=>(playedBits[id>>3] & (1<<(id&7)))!==0}});
  const grid=new Uint32Array(gridBytes.buffer);
  let num5,parent5,games5,moves5,loss5,band5,eval5,ranks5;
  function installRows(packed,n) {
    if(packed.length!==12*n || grid.length!==4*101*101) throw new Error("Incomplete fifth-ply data");
    // Column planes keep repeated prefixes and sparse exact game counts compact.
    num5=n;
    function planes(offset,width,Type) {
      const out=new Type(n);
      for(let byte=0;byte<width;byte++) for(let i=0;i<n;i++) out[i]+=packed[(offset+byte)*n+i]*2**(8*byte);
      return out;
    }
    parent5=planes(0,3,Uint32Array);
    moves5=planes(3,2,Uint16Array);
    loss5=packed.subarray(5*n,6*n);band5=packed.subarray(6*n,7*n);
    eval5=new Int8Array(packed.buffer,packed.byteOffset+7*n,n);
    games5=planes(8,4,Uint32Array);
    ranks5=null;
  }
  installRows(fifthBytes,five.n);
  function fifthRanks() {
    if(!ranks5) {
      const parents=layers[3].moves;
      const sanRanks=Array(five.san.length);
      five.san.map((s,i)=>[s,i]).sort((a,b)=>alphabetical.compare(a[0],b[0]))
        .forEach((entry,rank)=>sanRanks[entry[1]]=rank);
      ranks5=Uint32Array.from(parent5,(p,i)=>parents[p].rank*five.san.length+sanRanks[moves5[i]]);
    }
    return ranks5;
  }
  function fifthLine(i) {
    return {pgn:layers[3].moves[parent5[i]].pgn+" 3. "+five.san[moves5[i]],
      loss:loss5[i],cp:eval5[i],games:games5[i]};
  }
  function makeCountTable(title) {
    const section=tag("section",undefined,"rc-card"), heading=tag("h2",title);
    const table=tag("table",undefined,"rc-table");
    table.setAttribute("aria-label",title);
    table.setAttribute("aria-describedby","of-count-note");
    const row=table.createTHead().insertRow();
    for(const label of ["After","Possible","Meet both filters","Ever played on Lichess","Meet both filters and ever played on Lichess"]) {
      const th=tag("th",label,label==="After" ? undefined : "text-end");
      th.scope="col";
      row.append(th);
    }
    const wrapper=tag("div",undefined,"rc-table-box");
    wrapper.append(table);
    section.append(heading,wrapper);
    el("tables").append(section);
    return table.createTBody();
  }
  const orderTable=makeCountTable("Move orders");
  const positionTable=makeCountTable("Distinct positions");
  function countWithPercent(count,total) {
    const cell=tag("td",num.format(count)+" ","text-end tabular-nums");
    cell.append(tag("span","("+percent.format(count/total)+")","of-pct text-small"));
    return cell;
  }
  function countRow(ply,total,qualifying,everPlayed,qualifyingPlayed) {
    const row=tag("tr"),label=tag("th",after[ply]);
    label.scope="row";
    row.append(label,tag("td",num.format(total),"text-end tabular-nums"),
      countWithPercent(qualifying,total),countWithPercent(everPlayed,total),countWithPercent(qualifyingPlayed,total));
    return row;
  }
  const columns = ["pgn","loss","cp","games"];
  const alphabetical = new Intl.Collator("en",{numeric:true});
  const layers = prepare();
  const bestOpening = Math.max(...layers[0].moves.map(move => move.cp));
  const sortButtons = [...el("sort").querySelectorAll("button")];
  let sortKey="games", descending=true, visibleLines=[], sorted=[], rowHeight=30, startRow=-1;
  let showingFive=false,totalFive=0;
  function spacer(height) {
    const row=tag("tr",undefined,"of-spacer"),cell=tag("td");
    row.setAttribute("aria-hidden","true");
    cell.colSpan=4;cell.style.height=height+"px";row.append(cell);
    return row;
  }
  function drawWindow(force=false) {
    const scroller=el("scroll"),logicalHeight=sorted.length*rowHeight;
    // Keep spacer heights within browser layout limits even for millions of rows.
    const physicalHeight=Math.min(logicalHeight,12000000);
    const viewport=Math.max(1,scroller.clientHeight-el("sort").getBoundingClientRect().height);
    const scale=logicalHeight>physicalHeight?(logicalHeight-viewport)/(physicalHeight-viewport):1;
    const logicalTop=scroller.scrollTop*scale;
    const start=Math.min(Math.max(0,sorted.length-12),Math.max(0,Math.floor(logicalTop/rowHeight)-3));
    if(!force && startRow===start) return;
    startRow=start;
    const end=Math.min(sorted.length,start+12);
    const body=document.createDocumentFragment();
    const top=Math.max(0,Math.min(physicalHeight-(end-start)*rowHeight,scroller.scrollTop-(logicalTop-start*rowHeight)));
    if(top) body.append(spacer(top));
    for(let i=start;i<end;i++) {
      const line=showingFive?fifthLine(sorted[i]):sorted[i],row=tag("tr");
      row.setAttribute("aria-rowindex",String(i+2));
      row.append(tag("td",line.pgn),tag("td",pawns(line.loss),"text-end"),
        tag("td",signed(line.cp),"text-end"),tag("td",num.format(line.games),"text-end tabular-nums"));
      body.append(row);
    }
    if(end<sorted.length) body.append(spacer(Math.max(0,physicalHeight-top-(end-start)*rowHeight)));
    if(!sorted.length) {
      const row=tag("tr"),cell=tag("td","No move orders meet both filters at this ply.");
      cell.colSpan=4;row.append(cell);body.append(row);
    }
    el("lines").replaceChildren(body);
  }
  function sizeLineTable() {
    const first=el("lines").querySelector("tr[aria-rowindex]");
    if(!first) return;
    const head=el("sort").getBoundingClientRect().height;
    const height=first.getBoundingClientRect().height;
    if(!height || !head) return;
    if(rowHeight!==height) {rowHeight=height;drawWindow(true);}
    el("scroll").style.maxHeight=Math.ceil(head+5*rowHeight)+"px";
  }
  function showLines() {
    if(showingFive){
      const ranks=fifthRanks(), values={pgn:ranks,loss:loss5,cp:eval5,games:games5}[sortKey];
      sorted=visibleLines.slice().sort((a,b)=>(descending?values[b]-values[a]:values[a]-values[b]) || ranks[a]-ranks[b]);
    } else sorted=visibleLines.slice().sort((a,b)=>{
      const diff=sortKey==="pgn" ? a.rank-b.rank : a[sortKey]-b[sortKey];
      return (descending ? -diff : diff) || a.rank-b.rank;
    });
    el("lines").closest("table").setAttribute("aria-rowcount",String(sorted.length+1));
    for (const button of sortButtons) {
      const active=button.dataset.sort===sortKey;
      if (active) button.parentElement.setAttribute("aria-sort",descending?"descending":"ascending");
      else button.parentElement.removeAttribute("aria-sort");
      button.querySelector("span").textContent=active ? (descending ? "↓" : "↑") : "↕";
    }
    el("line-total").textContent=
      num.format(sorted.length)+(sorted.length===1?" move order":" move orders");
    el("scroll").scrollTop=0;
    drawWindow(true);
    sizeLineTable();
  }
  function render() {
    const loss = Number(el("loss").value), band = Number(el("band").value);
    el("loss-value").textContent = pawns(loss)+" pawns";
    el("band-value").textContent = "±"+pawns(band)+" pawns";
    for(const id of ["loss","band"]) el(id).setAttribute("aria-valuetext",el(id+"-value").textContent);
    ticks("loss-ticks",pawns); ticks("band-ticks",v=>"±"+pawns(v));
    ticks("loss-odds",v=>win(bestOpening-v)); ticks("band-odds",win);
    el("loss-note").textContent="White win chance at the first-move cutoff · "+win(bestOpening-loss);
    el("band-note").textContent="Favored side’s win chance at the band edge · "+win(band);
    const kept = layers.map(layer=>layer.moves.filter(x=>x.loss<=loss && x.band<=band));
    orderTable.replaceChildren(...kept.map((lines,i)=>
      countRow(i,legalTotals[i].orders,lines.length,legalTotals[i].playedOrders,lines.filter(x=>x.games>0).length)));
    positionTable.replaceChildren(...kept.map((lines,i)=>{
      const ids=new Set(lines.map(x=>x.id));
      const {positions,playedPositions}=legalTotals[i];
      const qualifyingPlayed=[...ids].filter(id=>playedPositions.has(id)).length;
      return countRow(i,positions,ids.size,playedPositions.size,qualifyingPlayed);
    }));
    const index=(loss*101+band)*4;
    totalFive=grid[index];
    orderTable.append(countRow(4,4865609,totalFive,five.playedOrders,grid[index+1]));
    positionTable.append(countRow(4,822518,grid[index+2],five.playedPositions,grid[index+3]));
    const ply=preferredPly;
    el("sample-ply").value=String(ply);
    showingFive=ply===5;
    if(showingFive){
      const matches=new Uint32Array(Math.min(totalFive,num5));
      let n=0;
      for(let i=0;i<num5;i++) if(loss5[i]<=loss && band5[i]<=band) matches[n++]=i;
      if(n!==totalFive) throw new Error("Move-order and filter totals disagree");
      visibleLines=matches.subarray(0,n);
    } else visibleLines=kept[ply-1];
    showLines();
  }
  let preferredPly=5;
  function restore(snapshot) {
    const s=snapshot?.modelContent;
    for (const id of ["loss","band"]) {
      const input=el(id);
      const saved=s?.version===2 ? s[id+"Cp"] : undefined;
      input.value=Number.isInteger(saved) && saved>=0 ? Math.min(saved,meta.cap) : input.defaultValue;
    }
    preferredPly=[1,2,3,4,5].includes(s?.samplePly) ? s.samplePly : 5;
    sortKey=columns.includes(s?.sortKey) ? s.sortKey : "games";
    descending=typeof s?.descending==="boolean" ? s.descending : sortKey==="games";
    render();
  }
  function persist() {
    const state = {version:2,lossCp:Number(el("loss").value),
      bandCp:Number(el("band").value),samplePly:preferredPly,sortKey,descending};
    try {localStorage.setItem("dnield-opening-filters", JSON.stringify(state));} catch {}
  }
  for(const id of ["loss","band"]){
    el(id).addEventListener("input",render);
    el(id).addEventListener("change",persist);
  }
  el("sample-ply").addEventListener("change",()=>{preferredPly=Number(el("sample-ply").value);render();persist();});
  for (const button of sortButtons) button.addEventListener("click",()=>{
    const key=button.dataset.sort;
    descending=key===sortKey ? !descending : key==="games" || key==="cp";
    sortKey=key;
    showLines();
    persist();
  });
  new ResizeObserver(sizeLineTable).observe(el("sort"));
  el("scroll").addEventListener("scroll",()=>drawWindow(),{passive:true});
  let saved;
  try {saved=JSON.parse(localStorage.getItem("dnield-opening-filters"));} catch {}
  restore({modelContent:saved});
  el("status").hidden=true;
})().catch(error=>{
  const message=document.getElementById("of-status");
  if(message) {message.hidden=false;message.setAttribute("role","alert");message.textContent="Opening data could not be loaded. "+error.message;}
});
