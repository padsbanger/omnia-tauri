// Deterministic website shared by actual WebView2 and WebKitGTK tests.
export function websiteFixture(req, res) {
  if (req.url === "/fixture-download") {
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Disposition": 'attachment; filename="fixture-download.txt"',
    });
    res.end("native download fixture");
    return;
  }
  if (req.url === "/favicon.png") {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ2kAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    return;
  }
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "http://localhost:7890/forbidden" }).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/html",
    "X-Frame-Options": "DENY",
  });
  res.end(`<!doctype html><title>Fixture</title><link rel="icon" href="/favicon.png"><h1>Omnia native fixture</h1><input aria-label="Identity"><button id="save">Save identity</button><button id="popup">Popup</button><a id="download" href="/fixture-download" download="fixture-download.txt">Download file</a><button id="blob-download">Download blob</button><p id="identity"></p><script>
  const identity=document.querySelector('#identity'); identity.textContent=localStorage.getItem('identity')||'empty';
  document.querySelector('#save').onclick=()=>{const v=document.querySelector('input').value;localStorage.setItem('identity',v);document.cookie='identity='+v+'; Max-Age=86400; SameSite=Lax; Path=/';identity.textContent=v;};
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data==='auth-complete')document.body.dataset.auth='complete';});
  document.querySelector('#popup').onclick=()=>{sessionStorage.setItem('auth_nonce','fixture-nonce');const popup=window.open('about:blank','fixture-popup','width=520,height=600');if(popup)setTimeout(()=>{popup.location.href='/popup';},100);};
  document.querySelector('#blob-download').onclick=()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['native blob fixture'],{type:'text/plain'}));link.download='fixture-blob.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};
  </script>`);
}
