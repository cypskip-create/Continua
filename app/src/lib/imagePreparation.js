const MAX_INPUT=20*1024*1024,MAX_UPLOAD=5*1024*1024;
export async function rasterType(blob){
 const bytes=new Uint8Array(await blob.slice(0,32).arrayBuffer()),text=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(text(0,4)==='RIFF'&&text(8,12)==='WEBP')return 'image/webp';
 if(['GIF87a','GIF89a'].includes(text(0,6)))return 'image/gif';
 if(text(4,8)==='ftyp'&&/heic|heix|hevc|hevx|mif1|heif/.test(text(8,32)))return 'image/heic';
 return null;
}
async function decode(blob){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob);}catch{/* Safari may decode through its image element instead. */}}
 const url=URL.createObjectURL(blob),image=new Image();
 try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This photo cannot be read. Choose a JPEG, PNG, WebP or GIF image.'));image.src=url;});return {width:image.naturalWidth,height:image.naturalHeight,image,close(){URL.revokeObjectURL(url);}};}catch(error){URL.revokeObjectURL(url);throw error;}
}
export async function prepareImage(file,{kind='post-images',maximumBytes=MAX_UPLOAD}={}){
 if(!(file instanceof Blob)||file.size<1||file.size>MAX_INPUT)throw Error('Choose a photo smaller than 20 MB.');
 const type=await rasterType(file);if(!type)throw Error('Choose a JPEG, PNG, WebP, GIF or supported HEIC photo.');
 if(type==='image/gif'){if(file.size>maximumBytes)throw Error('GIF images must be smaller than 5 MB.');return new Blob([file],{type});}
 if(type!=='image/heic'&&file.size<=250000&&kind!=='avatars')return new Blob([file],{type});
 let bitmap;
 try{
  bitmap=await decode(new Blob([file],{type}));if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64_000_000)throw Error('Photo dimensions are too large. Choose a smaller image.');
  const canvas=document.createElement('canvas'),avatar=kind==='avatars',width=avatar?Math.min(bitmap.width,bitmap.height):bitmap.width,height=avatar?width:bitmap.height,scale=Math.min(1,(avatar?1024:1600)/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('Photo preparation is unavailable in this browser.');
  context.drawImage(bitmap.image??bitmap,(bitmap.width-width)/2,(bitmap.height-height)/2,width,height,0,0,canvas.width,canvas.height);
  const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));
  if(!(output instanceof Blob)||output.size>maximumBytes)throw Error('Photo is too large after resizing. Choose a smaller image.');
  return output;
 }catch(error){
  if(type!=='image/heic'&&file.size<=maximumBytes&&kind!=='avatars')return new Blob([file],{type});
  throw error;
 }finally{bitmap?.close?.();}
}
