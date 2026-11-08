'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const readText=file=>fs.readFileSync(file,'utf8').replace(/\r\n?/g,'\n');
let html=readText(path.join(dist,'index.html'));
html=html.replace(/<link rel="stylesheet" href="([^"?]+)(?:\?[^\"]*)?">/g,(_,name)=>{
  assert.equal(path.basename(name),name,'Stylesheet must be a local file');
  return '<style>\n'+readText(path.join(dist,name)).replace(/<\/style/gi,'<\\/style')+'\n</style>';
});
html=html.replace(/<script src="([^"?]+)(?:\?[^\"]*)?"><\/script>/g,(_,name)=>{
  assert.equal(path.basename(name),name,'Script must be a local file');
  return '<script>\n'+readText(path.join(dist,name)).replace(/<\/script/gi,'<\\/script')+'\n</script>';
});
assert.ok(!/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html),'Standalone must embed all application assets');
const sha=crypto.createHash('sha256').update(html).digest('hex');
const output=path.join(root,'game.html');
const manifestPath=path.join(root,'BUILD_INFO.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(process.argv.includes('--check')){
  assert.equal(fs.readFileSync(output,'utf8'),html,'game.html is stale; run node scripts/build-standalone.cjs');
  assert.equal(manifest.standalone_sha256,sha,'Standalone hash does not match BUILD_INFO.json');
  console.log('Standalone parity and SHA-256 passed.');
}else{
  fs.writeFileSync(output,html);
  manifest.standalone_sha256=sha;
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log('Built game.html and updated BUILD_INFO.json SHA-256.');
}
