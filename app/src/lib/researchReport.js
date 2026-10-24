const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());
const hidden=new Set(['inputHash','hash','governance','modelVersion','configuration','requestId','rawPayload','sourceUrl','sourceUrls']);
function render(value,depth=0){
 if(depth>12)return '<p>Additional details omitted.</p>';
 if(value==null)return '<span class="muted">Unavailable</span>';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value==='number')return Number.isFinite(value)?escape(value.toLocaleString('en-KE',{minimumFractionDigits: 2, maximumFractionDigits: 2})):'Unavailable';
 if(typeof value!=='object')return escape(value);
 if(Array.isArray(value))return value.length?'<ol>'+value.map(item=>'<li>'+render(item,depth+1)+'</li>').join('')+'</ol>':'<p class="muted">None reported</p>';
 return '<dl>'+Object.entries(value).filter(([key])=>!hidden.has(key)).map(([key,item])=>'<div class="field"><dt>'+escape(label(key))+'</dt><dd>'+render(item,depth+1)+'</dd></div>').join('')+'</dl>';
}
export function researchReportHtml(name,data){
 const title=label(name.replace(/^continua[- ]?/i,''));
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continua · '+escape(title)+'</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#242238;max-width:960px;margin:auto;padding:32px}h1{color:#543eb7}dt{font-weight:650}dd{margin:4px 0 16px}dl{margin:0}.field{break-inside:avoid;border-top:1px solid #e8e5ef;padding-top:12px}li{padding:8px 0}.muted,footer{color:#656171}button{padding:10px 18px;cursor:pointer}@media print{button{display:none}body{padding:0;font-size:11pt}h1{font-size:22pt}}</style></head><body><header><p>CONTINUA RESEARCH</p><h1>'+escape(title)+'</h1><p>Prepared '+escape(new Date().toLocaleString('en-KE'))+'</p></header><main>'+render(data)+'</main><footer><p>Research and hypothetical scenarios are not guarantees of future performance. Unavailable values have not been estimated.</p><p>Open this report in a browser to read it, or choose Print → Save as PDF.</p></footer></body></html>';
}
export function researchReportLines(data,heading='',depth=0){
 if(depth>12)return [];
 if(data==null)return [heading+': Unavailable'];
 if(typeof data!=='object')return [(heading?heading+': ':'')+(typeof data==='number'?data.toLocaleString('en-KE',{minimumFractionDigits: 2, maximumFractionDigits: 2}):typeof data==='boolean'?(data?'Yes':'No'):String(data))];
 if(Array.isArray(data))return [heading,...data.slice(0,100).flatMap((row,index)=>researchReportLines(row,'Item '+(index+1),depth+1)),...(data.length>100?['Showing the first 100 of '+data.length+' entries.']:[])];
 return [...(heading?[heading]:[]),...Object.entries(data).filter(([key])=>!hidden.has(key)).flatMap(([key,value])=>researchReportLines(value,label(key),depth+1))];
}
export async function createResearchPdf(name,data){
 // Load only when exporting; the PDF renderer adds nothing to app startup.
 const {jsPDF}=await import('jspdf');
 const pdf=new jsPDF({unit:'mm',format:'a4'});let y=22;
 const title=label(name.replace(/^continua[- ]?/i,''));
 pdf.setProperties({title:'Continua - '+title,author:'Continua'});
 pdf.setFont('helvetica','bold');pdf.setFontSize(19);pdf.setTextColor(80,60,165);
 for(const line of pdf.splitTextToSize(title,174)){pdf.text(line,18,y);y+=9;}
 pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.setTextColor(45,42,55);
 const settings=data?.configuration&&Object.fromEntries(Object.entries(data.configuration).filter(([key,value])=>!hidden.has(key)&&key!=='seed'&&['string','number','boolean'].includes(typeof value)));
 const lines=['Prepared '+new Date().toLocaleString('en-KE'),'',...(settings?researchReportLines(settings,'Your analysis settings'):[]),...researchReportLines(data),'','Research and scenarios are not guarantees of future performance. Unavailable values have not been estimated.'];
 for(const text of lines){for(const line of pdf.splitTextToSize(String(text).replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u00d7/g,' x '),174)){if(y>276){pdf.addPage();y=20;}pdf.text(line,18,y);y+=5.2;}y+=1.5;}
 const pages=pdf.getNumberOfPages();for(let page=1;page<=pages;page++){pdf.setPage(page);pdf.setFontSize(8);pdf.text('Continua research - '+page+' / '+pages,18,289);}
 return pdf;
}

export async function downloadResearchReport(name,data){const pdf=await createResearchPdf(name,data);pdf.save(name.replace(/[^a-z0-9-]/gi,'-')+'.pdf');}
