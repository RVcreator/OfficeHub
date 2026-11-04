/** Resize only the existing public Unsplash source. Never rewrite signed/private URLs. */
export function avatarImage(avatar:string,className:string){
 try{
  const url=new URL(avatar),original=Number(url.searchParams.get('w'));
  const widths=[...className.matchAll(/(?:^|[\s:])w-(\d+(?:\.\d+)?)(?=\s|$)/g)].map(match=>Number(match[1])*4);
  if(url.hostname!=='images.unsplash.com'||url.protocol!=='https:'||!original||url.searchParams.has('h')||!widths.length)return {src:avatar};
  const size=Math.max(...widths),variants=[...new Set([1,2,3].map(scale=>Math.min(original,Math.ceil(size*scale))))];
  const source=(width:number)=>{const copy=new URL(url);copy.searchParams.set('w',String(width));return copy.href;};
  return {src:source(variants[0]),srcSet:variants.map(width=>`${source(width)} ${width}w`).join(', '),sizes:`${size}px`};
 }catch{return {src:avatar};}
}
