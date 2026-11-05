const CACHE="my-cake-manager-v1";
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/styles.css","/manifest.webmanifest"]))));
self.addEventListener("fetch",e=>{if(e.request.method==="GET"&&new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
