/* mergeDocx.js — merge several rendered report .docx (all from the SAME template)
   into one document, in sequence, each pitch starting on a new page.
   Operates on PizZip instances (browser: window.PizZip; node: require('pizzip')).
   Shares styles/numbering/headers/footers from the first doc; only the body XML and
   image media/relationships from later docs are appended (with remapped ids). */
(function(){
  'use strict';
  const PAGE_BREAK='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const IMG_TYPE='http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

  function bodyInner(docXml){
    const open=docXml.indexOf('<w:body>');
    const start=docXml.indexOf('>',open)+1;
    let end=docXml.lastIndexOf('<w:sectPr');           // strip this doc's final section settings
    if(end<start) end=docXml.lastIndexOf('</w:body>');
    return docXml.substring(start,end);
  }
  function imageRels(relsXml){
    const out=[]; const tags=relsXml.match(/<Relationship\b[^>]*\/>/g)||[];
    for(const t of tags){ if(!/Type="[^"]*\/image"/.test(t)) continue;
      const id=(t.match(/Id="([^"]+)"/)||[])[1], target=(t.match(/Target="([^"]+)"/)||[])[1];
      if(id&&target) out.push({id,target}); }
    return out;
  }

  function mergeZips(zips){
    if(!zips||zips.length===0) return null;
    const base=zips[0];
    if(zips.length===1) return base;
    let baseDoc=base.file('word/document.xml').asText();
    let baseRels=base.file('word/_rels/document.xml.rels').asText();
    let newRels=''; let appended=''; let counter=1;

    for(let i=1;i<zips.length;i++){
      const z=zips[i];
      let inner=bodyInner(z.file('word/document.xml').asText());
      const rels=imageRels(z.file('word/_rels/document.xml.rels').asText());
      for(const {id,target} of rels){
        const baseName=target.split('/').pop();
        const newId='rIdM'+i+'x'+(counter++);
        const newTarget='media/m'+i+'_'+baseName;
        inner=inner.split('="'+id+'"').join('="'+newId+'"');     // remap r:embed / r:id refs (exact, quoted)
        newRels+='<Relationship Id="'+newId+'" Type="'+IMG_TYPE+'" Target="'+newTarget+'"/>';
        const srcPath='word/'+target.replace(/^\//,'');
        const f=z.file(srcPath);
        if(f) base.file('word/'+newTarget, f.asUint8Array());
      }
      appended+=PAGE_BREAK+inner;
    }
    baseRels=baseRels.replace('</Relationships>', newRels+'</Relationships>');
    const sect=baseDoc.lastIndexOf('<w:sectPr');
    baseDoc=baseDoc.slice(0,sect)+appended+baseDoc.slice(sect);
    base.file('word/document.xml', baseDoc);
    base.file('word/_rels/document.xml.rels', baseRels);
    return base;
  }

  if(typeof window!=='undefined') window.mergeDocxZips=mergeZips;
  if(typeof module!=='undefined') module.exports={mergeZips};
})();
