import type {Plugin} from 'vite';

/** Keep the exact generated styles, without a separate first-paint network hop. */
export function inlineAppStyles():Plugin {
 return {
  name:'officehub-inline-app-styles',apply:'build',enforce:'post',
  generateBundle(_options,bundle){
   for(const asset of Object.values(bundle)){
    if(asset.type!=='asset'||!asset.fileName.endsWith('.html'))continue;
    const html=typeof asset.source==='string'?asset.source:new TextDecoder().decode(asset.source);
    asset.source=html.replace(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+\.css)["'])[^>]*>/gi,(tag,href:string)=>{
     const name=href.replace(/^\.\//,'').replace(/^\//,'');
     const css=bundle[name];if(!css||css.type!=='asset'||!name.startsWith('assets/'))return tag;
     const source=typeof css.source==='string'?css.source:new TextDecoder().decode(css.source);
     return `<style data-officehub-app-styles>${source.replace(/<\/style/gi,'<\\/style')}</style>`;
    });
   }
  },
 };
}
