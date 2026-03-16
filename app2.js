var PROXY="https://apollo-proxy.jason-939.workers.dev";
var APOLLO_KEY="4j1OoTcIhPejsI-YMmnaqA";
var COLORS=["#29abe2","#0ea5e9","#0d9488","#7c3aed","#db2777","#ea580c"];
var leads=[],prospects=[],sel=new Set(),activeR=null,cModes={},curPage=1,totalLeads=0;
var titleTags=["CEO","CTO","VP"];

function gc(i){return COLORS[i%COLORS.length];}

// ── TAG INPUT ──────────────────────────────────────────────────────
function renderTitleTags(){
  var w=document.getElementById("titles-tags");
  if(!w)return;
  var h="";
  titleTags.forEach(function(t,i){
    h+='<span style="display:inline-flex;align-items:center;gap:4px;background:#e8f7fd;color:#1da8cc;border:1px solid #cceef9;border-radius:50px;padding:3px 10px;font-size:12px;font-weight:600">';
    h+=t;
    h+='<span onclick="removeTitle('+i+')" style="cursor:pointer;font-size:16px;line-height:1;opacity:.7;margin-left:4px">&times;</span></span>';
  });
  w.innerHTML=h;
}

function removeTitle(i){titleTags.splice(i,1);renderTitleTags();}

function initTitles(){
  renderTitleTags();
  var inp=document.getElementById("titles-inp");
  var box=document.getElementById("titles-box");
  if(!inp)return;
  box.addEventListener("click",function(){inp.focus();});
  inp.addEventListener("keydown",function(e){
    if(e.key==="Enter"||e.key===","){
      e.preventDefault();
      var v=inp.value.trim().replace(/,$/,"");
      if(v&&titleTags.indexOf(v)===-1){titleTags.push(v);renderTitleTags();}
      inp.value="";
    }else if(e.key==="Backspace"&&inp.value===""&&titleTags.length){
      titleTags.pop();renderTitleTags();
    }
  });
  inp.addEventListener("focus",function(){box.style.borderColor="#29abe2";});
  inp.addEventListener("blur",function(){box.style.borderColor="";});
}

// ── APOLLO LISTS ──────────────────────────────────────────────────
async function loadApolloLists(){
  var sel = document.getElementById("f-list");
  if(!sel) return;
  try {
    var res = await fetch(PROXY+"/apollo/labels", {
      headers:{"X-Apollo-Key":APOLLO_KEY}
    });
    var data = await res.json();
    var arr = Array.isArray(data) ? data : Object.values(data);
    sel.innerHTML = '<option value="">— No list filter —</option>';
    arr.forEach(function(l){
      var opt = document.createElement("option");
      opt.value = l._id;
      opt.textContent = l.name + " (" + (l.cached_count||0).toLocaleString() + ")";
      sel.appendChild(opt);
    });
    if(!arr.length){
      sel.innerHTML = '<option value="">No lists found</option>';
    }
  } catch(e) {
    sel.innerHTML = '<option value="">Error loading lists</option>';
    console.log("Lists error:", e.message);
  }
}

// ── APOLLO SEARCH ──────────────────────────────────────────────────
async function runSearch(page){
  curPage=page||1;
  var tbody=document.getElementById("leads-tbody");
  tbody.innerHTML="<tr><td colspan=7><div class=loading-bar><div class=spinner></div>Searching Apollo...</div></td></tr>";
  document.getElementById("leads-error").innerHTML="";
  var loc=document.getElementById("f-location").value;
  var ind=document.getElementById("f-industry").value;
  var listId=document.getElementById("f-list").value;
  var pp=parseInt(document.getElementById("f-perpage").value);
  var sen=Array.from(document.querySelectorAll(".filter-tag.on")).map(function(t){
    return t.textContent.toLowerCase().replace(/-/g,"_").replace("c_level","c_suite");
  });
  var body={
    page:curPage,per_page:pp,
    person_seniorities:sen.length?sen:undefined,
    organization_locations:loc?[loc]:undefined,
    contact_email_status:["verified","guessed","unavailable","bounced","pending_manual_fulfillment"]
  };
  if(titleTags.length)body.person_titles=titleTags;
  if(ind)body.q_organization_keyword_tags=[ind];
  if(listId)body.label_ids=[listId];
  try{
    var res=await fetch(PROXY+"/apollo/mixed_people/search",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Apollo-Key":APOLLO_KEY},
      body:JSON.stringify(body)
    });
    var data=await res.json();
    if(data.error||!data.people){
      document.getElementById("leads-error").innerHTML="<div class=error-box>Apollo error: "+(data.error||data.message||"Unknown")+"</div>";
      tbody.innerHTML="";return;
    }
    leads.length=0;
    data.people.forEach(function(p){
      leads.push({
        id:p.id,
        name:(p.first_name||"")+" "+(p.last_name||""),
        title:p.title||"",
        company:p.organization?p.organization.name:"",
        size:p.organization?fmtSz(p.organization.estimated_num_employees):"",
        location:[p.city,p.state].filter(Boolean).join(", ")||p.country||"",
        email:p.email||"",
        li:p.linkedin_url||"",
        av:((p.first_name||"?")[0]+(p.last_name||"?")[0]).toUpperCase()
      });
    });
    totalLeads=data.pagination?data.pagination.total_entries:leads.length;
    renderLeads();renderPagination(data.pagination,pp);
    toast("Found "+totalLeads.toLocaleString()+" leads from Apollo");
  }catch(e){
    document.getElementById("leads-error").innerHTML="<div class=error-box>Error: "+e.message+"</div>";
    tbody.innerHTML="";
  }
}

function fmtSz(n){
  if(!n)return"Unknown";
  if(n<11)return"1-10 emp";if(n<51)return"11-50 emp";
  if(n<201)return"51-200 emp";if(n<501)return"201-500 emp";return"500+ emp";
}

function renderPagination(pag,pp){
  if(!pag)return;
  var pages=Math.ceil(pag.total_entries/pp);
  var h="Page "+curPage+" of "+pages.toLocaleString()+" &nbsp;";
  if(curPage>1)h+='<a onclick="runSearch('+(curPage-1)+')">&larr; Prev</a> &nbsp;';
  if(curPage<pages)h+='<a onclick="runSearch('+(curPage+1)+')">Next &rarr;</a>';
  document.getElementById("pagination").innerHTML=h;
}

function renderLeads(){
  var tb=document.getElementById("leads-tbody");
  if(!leads.length){
    tb.innerHTML="<tr><td colspan=7><div class=loading-bar>No leads found. Try adjusting filters.</div></td></tr>";
    return;
  }
  var rows="";
  for(var i=0;i<leads.length;i++){
    var l=leads[i];
    var chk='<input type=checkbox '+(sel.has(l.id)?"checked ":"")+'onchange="toggleL(\''+l.id+'\',this.checked)"/>';
    var avatar='<div class=avatar style="background:'+gc(i)+'">'+l.av+"</div>";
    var emailBadge=l.email
      ?'<span style="display:inline-flex;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:700;background:#dcfce7;color:#15803d">'+l.email+"</span>"
      :'<span style="display:inline-flex;padding:3px 9px;border-radius:50px;font-size:11px;font-weight:700;background:#fef9c3;color:#854d0e">Not available</span>';
    var addBtn='<div class="icon-btn add" onclick="addP(\''+l.id+'\')" title="Add to Prospects">'
      +'<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg></div>';
    var ignBtn='<div class="icon-btn ign" onclick="ignOne(\''+l.id+'\')" title="Ignore">'
      +'<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-width="2"/></svg></div>';
    rows+="<tr>"
      +"<td>"+chk+"</td>"
      +'<td><div class=lead-name-cell>'+avatar
        +'<div><div class=lead-name>'+l.name+'</div><div class=lead-sub>'+l.title+"</div></div></div></td>"
      +"<td>"+(l.company||"-")+"</td>"
      +"<td>"+(l.size||"-")+"</td>"
      +"<td>"+(l.location||"-")+"</td>"
      +"<td>"+emailBadge+"</td>"
      +'<td><div class=action-btns>'+addBtn+ignBtn+"</div></td>"
      +"</tr>";
  }
  tb.innerHTML=rows;
  document.getElementById("leads-shown").textContent=leads.length;
  document.getElementById("leads-total").textContent=totalLeads.toLocaleString();
  updateStats();
}

function toggleL(id,on){on?sel.add(id):sel.delete(id);}
function selectAll(cb){leads.forEach(function(l){cb.checked?sel.add(l.id):sel.delete(l.id);});renderLeads();}

function addP(id){
  var l=leads.find(function(x){return x.id===id;});
  if(!l||prospects.find(function(p){return p.id===id;}))return;
  prospects.push(Object.assign({},l,{stage:"new"}));
  leads.splice(leads.indexOf(l),1);
  toast(l.name+" added to Prospects");
  updateStats();renderLeads();renderProspects();renderRL();renderOutreach();
}
function bulkAdd(){if(!sel.size){toast("Select leads first");return;}Array.from(sel).forEach(addP);sel.clear();}
function ignOne(id){leads.splice(leads.findIndex(function(l){return l.id===id;}),1);renderLeads();toast("Lead ignored");}
function bulkIgnore(){sel.forEach(function(id){leads.splice(leads.findIndex(function(l){return l.id===id;}),1);});sel.clear();renderLeads();}
function filterTable(q){document.querySelectorAll("#leads-tbody tr").forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(q.toLowerCase())?"":"none";});}

// ── PROSPECTS ─────────────────────────────────────────────────────
function renderProspects(filter){
  var g=document.getElementById("prospect-grid");
  var list=filter?prospects.filter(function(p){return sName(p.stage)===filter;}):prospects;
  if(!list.length){
    g.innerHTML='<div style="color:var(--text2);grid-column:1/-1;padding:32px;text-align:center">'
      +(prospects.length?"No match for this filter.":"No prospects yet. Add leads from Find Leads.")+"</div>";
    return;
  }
  var html="";
  list.forEach(function(p,i){
    html+='<div class=prospect-card><div class=p-card-hdr>'
      +'<div class=avatar style="background:'+gc(i)+';width:44px;height:44px;font-size:14px;position:relative">'+p.av+"</div>"
      +'<div style=position:relative>'
        +'<div class=p-name>'+p.name+"</div>"
        +'<div class=p-role>'+p.title+"</div>"
        +'<div class=p-co>'+p.company+"</div>"
      +"</div>"
      +'<span class="stage-badge s'+p.stage[0]+'" style="margin-left:auto;position:relative">'+sName(p.stage)+"</span>"
      +"</div>"
      +'<div class=prospect-body>'
        +'<div class=prospect-meta>'
          +'<div class=meta-chip>'+(p.size||"")+"</div>"
          +'<div class=meta-chip>'+(p.location||"")+"</div>"
          +(p.email?'<div class=meta-chip>'+p.email+"</div>":"")
        +"</div>"
        +(p.aiS
          ?'<div class=ai-box><strong>AI: </strong>'+p.aiS+"</div>"
          :'<div class=ai-box style="color:var(--gray3);border-left-color:var(--gray3)">AI research not yet run</div>')
        +'<div class=prospect-actions>'
          +'<button class="btn btn-primary btn-sm" onclick="goR(\''+p.id+'\')">Research</button>'
          +'<button class="btn btn-outline btn-sm" onclick="goO(\''+p.id+'\')">Outreach</button>'
          +'<button class="btn btn-ghost btn-sm" onclick="nextStage(\''+p.id+'\')">Next Stage</button>'
        +"</div>"
      +"</div>"
    +"</div>";
  });
  g.innerHTML=html;
  document.getElementById("stat-prospects").textContent=prospects.length;
}
function filterProspects(val){renderProspects(val);}
function sName(s){return{new:"New",research:"Researching",messaged:"Messaged",replied:"Replied",call:"Call Sched."}[s]||s;}
function nextStage(id){var p=prospects.find(function(x){return x.id===id;});var st=["new","research","messaged","replied","call"];p.stage=st[(st.indexOf(p.stage)+1)%st.length];renderProspects();}
function goR(id){showPage("research");setTimeout(function(){selectR(id);},50);}
function goO(id){showPage("outreach");setTimeout(function(){selectO(id);},50);}

// ── RESEARCH ──────────────────────────────────────────────────────
function renderRL(){
  var html="";
  prospects.forEach(function(p,i){
    html+='<div class="r-item '+(activeR===p.id?"active":"")+'" onclick="selectR(\''+p.id+'\')">'
      +'<div class=avatar style="background:'+gc(i)+';width:34px;height:34px;font-size:12px;flex-shrink:0">'+p.av+"</div>"
      +'<div><div class=r-item-name>'+p.name+(p.aiS?" ✓":"")+"</div>"
      +'<div class=r-item-co>'+p.company+"</div></div></div>";
  });
  document.getElementById("r-list-items").innerHTML=html;
}

function selectR(id){
  activeR=id;renderRL();
  var p=prospects.find(function(x){return x.id===id;});
  if(p.aiS){showRResult(p);return;}
  document.getElementById("r-pane").innerHTML=
    '<div class=r-card><div class=r-card-top>'
    +'<div class=avatar style="background:'+gc(prospects.indexOf(p))+';width:52px;height:52px;font-size:17px;position:relative">'+p.av+"</div>"
    +'<div style=position:relative>'
      +'<div style="font-size:18px;font-weight:800;color:#fff">'+p.name+"</div>"
      +'<div style="font-size:13px;color:#a0b4cc">'+p.title+" at "+p.company+"</div>"
    +"</div></div>"
    +'<div class=r-card-body>'
      +'<div class=ai-load><div class=dot-pulse><span></span><span></span><span></span></div>Ready to research '+p.name+"</div>"
      +'<button class="btn btn-primary" style="margin-top:12px" onclick="runR(\''+p.id+'\')">Run AI Research Now</button>'
    +"</div></div>";
}

function runR(id){
  var p=prospects.find(function(x){return x.id===id;});
  var ld=document.querySelector(".ai-load");
  if(ld)ld.innerHTML='<div class=dot-pulse><span></span><span></span><span></span></div> Analyzing...';
  setTimeout(function(){
    p.aiS=p.company+" is growing and likely has IT infrastructure needs. "+p.name+" is a key decision-maker worth a personalized outreach.";
    p.insights=[
      {t:p.company+" - decision maker with budget authority"},
      {t:"Located in "+(p.location||"your area")+" - local relationship opportunity"},
      {t:p.email?"Email available: "+p.email:"LinkedIn outreach recommended"},
      {t:"Custom intro message generated below"}
    ];
    p.msg="Hi "+p.name.split(" ")[0]+", I noticed "+p.company+" is growing and wanted to reach out. "
      +"We help companies in "+(p.location||"your area")+" keep IT completely off their plate - "
      +"24/7 monitoring, no surprises, local team that picks up the phone. "
      +"Would love to show how we have helped similar businesses. Open to a quick 15-min call?";
    p.stage="research";
    showRResult(p);renderProspects();renderRL();updateStats();
    toast("AI research complete for "+p.name);
  },2000);
}

function showRResult(p){
  var html='<div class=r-card><div class=r-card-top>'
    +'<div class=avatar style="background:'+gc(prospects.indexOf(p))+';width:52px;height:52px;font-size:17px;position:relative">'+p.av+"</div>"
    +'<div style=position:relative>'
      +'<div style="font-size:18px;font-weight:800;color:#fff">'+p.name+"</div>"
      +'<div style="font-size:13px;color:#a0b4cc">'+p.title+" at "+p.company+"</div>"
      +(p.email?'<div style="font-size:12px;color:#29abe2;margin-top:2px">'+p.email+"</div>":"")
    +"</div>"
    +'<button class="btn btn-primary btn-sm" style="margin-left:auto;position:relative" onclick="goO(\''+p.id+'\')">Compose Outreach</button>'
    +"</div>"
    +'<div class=r-card-body>'
      +'<div class=r-section><h3>AI Insights</h3>';
  (p.insights||[]).forEach(function(ins){
    html+='<div class=r-insight><span style="margin-right:6px;color:#29abe2">&#10022;</span><span>'+ins.t+"</span></div>";
  });
  html+="</div>"
    +'<div class=r-section><h3>Suggested LinkedIn Message</h3>'
      +'<div class=msg-box><p>'+p.msg+"</p></div>"
      +'<div style="display:flex;gap:8px;margin-top:10px">'
        +'<button class="btn btn-primary btn-sm" onclick="goO(\''+p.id+'\')">Use This Message</button>'
        +'<button class="btn btn-ghost btn-sm" onclick="regenR(\''+p.id+'\')">Regenerate</button>'
      +"</div>"
    +"</div>"
  +"</div></div>";
  document.getElementById("r-pane").innerHTML=html;
}

function runAllResearch(){
  prospects.filter(function(p){return !p.aiS;}).forEach(function(p){
    selectR(p.id);setTimeout(function(){runR(p.id);},200);
  });
  toast("Running AI research on all prospects...");
}
function regenR(id){var p=prospects.find(function(x){return x.id===id;});p.aiS=null;selectR(id);setTimeout(function(){runR(id);},100);}

// ── OUTREACH ──────────────────────────────────────────────────────
function renderOutreach(){
  var html="";
  prospects.forEach(function(p,i){
    html+='<div class=o-item onclick="selectO(\''+p.id+'\')">'
      +'<div class=avatar style="background:'+gc(i)+';width:36px;height:36px;font-size:12px;flex-shrink:0">'+p.av+"</div>"
      +'<div class=o-item-info>'
        +'<div class=o-item-name>'+p.name+"</div>"
        +'<div class=o-item-prev>'+(p.msg?p.msg.substring(0,50)+"...":"No message yet")+"</div>"
      +"</div></div>";
  });
  document.getElementById("o-items").innerHTML=html;
  document.getElementById("o-count").textContent=prospects.length;
}

function selectO(id){
  var p=prospects.find(function(x){return x.id===id;});
  var mode=cModes[id]||"linkedin";
  var html='<div class=compose-card>'
    +'<div class=c-hdr>'
      +'<div class=c-hdr-title>'
        +'<div class=avatar style="background:'+gc(prospects.indexOf(p))+';width:28px;height:28px;font-size:11px">'+p.av+"</div>"
        +p.name+" - "+p.company
      +"</div>"
      +'<div class=c-tabs>'
        +'<div class="c-tab '+(mode==="linkedin"?"active":"")+'" onclick="setMode(\''+p.id+'\',\'linkedin\')">LinkedIn</div>'
        +'<div class="c-tab '+(mode==="email"?"active":"")+'" onclick="setMode(\''+p.id+'\',\'email\')">Email</div>'
      +"</div>"
    +"</div>"
    +'<div class=c-body>'
      +(mode==="email"?'<input class=filter-input placeholder="Subject..." style="margin-bottom:8px" value="Re: '+p.company+'"/>':"")
      +'<textarea class=c-textarea id="msg-'+p.id+'" oninput="updCC(\''+p.id+'\')">'+(p.msg||"")+"</textarea>"
    +"</div>"
    +'<div class=c-footer>'
      +'<span class=char-count id="cc-'+p.id+'">'+(p.msg||"").length+" chars"+(mode==="linkedin"?" / 300 limit":"")+"</span>"
      +'<div style="display:flex;gap:8px">'
        +'<button class="btn btn-ghost btn-sm" onclick="regenO(\''+p.id+'\')">Regenerate</button>'
        +'<button class="btn btn-primary btn-sm" onclick="sendO(\''+p.id+'\',\''+mode+'\')">'+(mode==="linkedin"?"Open LinkedIn":"Send Email")+"</button>"
      +"</div>"
    +"</div>"
  +"</div>"
  +'<div class=seq-card>'
    +'<div class=c-hdr style="padding:12px 18px">'
      +'<div class=c-hdr-title style="font-size:13px">Follow-up Sequence</div>'
      +'<button class="btn btn-outline btn-sm">+ Add Step</button>'
    +"</div>"
    +'<div class=seq-item><div class=seq-num>1</div><div style=flex:1>LinkedIn intro<br><span style="font-size:11px;color:var(--text2)">Day 1 - Manual</span></div>'
      +'<span class="badge '+(p.stage==="messaged"||p.stage==="replied"?"badge-verified":"badge-pending")+'">'+(p.stage==="messaged"||p.stage==="replied"?"Sent":"Pending")+"</span></div>"
    +'<div class=seq-item><div class=seq-num>2</div><div style=flex:1>Follow-up email<br><span style="font-size:11px;color:var(--text2)">Day 4 - Office 365</span></div><span class="badge badge-pending">Pending</span></div>'
    +'<div class=seq-item><div class=seq-num>3</div><div style=flex:1>Soft close<br><span style="font-size:11px;color:var(--text2)">Day 10 - Office 365</span></div><span class="badge badge-pending">Pending</span></div>'
  +"</div>";
  document.getElementById("o-pane").innerHTML=html;
}

function setMode(id,m){cModes[id]=m;selectO(id);}
function updCC(id){var ta=document.getElementById("msg-"+id);var cc=document.getElementById("cc-"+id);if(ta&&cc)cc.textContent=ta.value.length+" chars";}
function sendO(id,mode){
  var p=prospects.find(function(x){return x.id===id;});
  p.stage="messaged";
  if(mode==="linkedin"&&p.li)window.open(p.li,"_blank");
  renderProspects();renderOutreach();updateStats();
  toast(mode==="linkedin"?"Opening LinkedIn for "+p.name+"...":"Email queued for "+p.name);
}
function regenO(id){
  var p=prospects.find(function(x){return x.id===id;});
  p.msg="Hi "+p.name.split(" ")[0]+", saw your team is growing at "+p.company+". We keep IT off your plate - 24/7, no surprises. Worth a quick call?";
  selectO(id);
}

// ── UTILS ─────────────────────────────────────────────────────────
function updateStats(){
  document.getElementById("stat-leads").textContent=leads.length+prospects.length;
  document.getElementById("stat-prospects").textContent=prospects.length;
  document.getElementById("stat-messaged").textContent=prospects.filter(function(p){return p.stage==="messaged"||p.stage==="replied"||p.stage==="call";}).length;
  document.getElementById("stat-replies").textContent=prospects.filter(function(p){return p.stage==="replied"||p.stage==="call";}).length;
}
function toggleTag(el){el.classList.toggle("on");}
function toggleEl(el){el.classList.toggle("on");}
function showPage(name){
  document.querySelectorAll(".page").forEach(function(p){p.classList.remove("active");});
  document.querySelectorAll(".nav-tab").forEach(function(t){t.classList.remove("active");});
  document.getElementById("page-"+name).classList.add("active");
  var tabs={find:0,prospects:1,research:2,outreach:3,settings:4};
  document.querySelectorAll(".nav-tab")[tabs[name]].classList.add("active");
  if(name==="prospects")renderProspects();
  if(name==="research")renderRL();
  if(name==="outreach")renderOutreach();
}
function toast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._to);t._to=setTimeout(function(){t.classList.remove("show");},3000);}

initTitles();
loadApolloLists();
