import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicon - Mystic Heros Logo */}
        <link rel="icon" type="image/png" href="/mystic-heros-favicon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/mystic-heros-favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/mystic-heros-favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/mystic-heros-logo.png" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Meta tags */}
        <meta name="theme-color" content="#050811" />
        <meta name="description" content="Akari Mystic Club - Prediction-native market intelligence for crypto markets, memecoins, and launchpads" />
        
        {/* Inline style to hide empty portals immediately - runs before React hydration */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Hide empty portals or portals with zero dimensions - most aggressive rules */
            nextjs-portal:empty,
            nextjs-portal[style*="width: 0"],
            nextjs-portal[style*="width:0"],
            nextjs-portal[style*="width: 0px"],
            nextjs-portal[style*="width:0px"],
            nextjs-portal[style*="height: 0"],
            nextjs-portal[style*="height:0"],
            nextjs-portal[style*="height: 0px"],
            nextjs-portal[style*="height:0px"],
            nextjs-portal[width="0"],
            nextjs-portal[width="0px"],
            nextjs-portal[height="0"],
            nextjs-portal[height="0px"] {
              display: none !important;
              visibility: hidden !important;
              width: 0 !important;
              height: 0 !important;
              overflow: hidden !important;
              position: absolute !important;
              top: -9999px !important;
              left: -9999px !important;
              pointer-events: none !important;
              opacity: 0 !important;
              z-index: -9999 !important;
            }
            
            /* Additional rule: Hide any portal with zero computed dimensions */
            nextjs-portal {
              min-width: 0 !important;
              min-height: 0 !important;
            }
          `
        }} />
      </Head>
      <body>
        <Main />
        <NextScript />
        {/* Script to hide empty portals immediately - runs before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function hideEmptyPortals() {
                  var portals = document.querySelectorAll('nextjs-portal');
                  for (var i = 0; i < portals.length; i++) {
                    var portal = portals[i];
                    var isEmpty = !portal.children.length;
                    var hasZeroWidth = portal.offsetWidth === 0 || portal.clientWidth === 0;
                    var hasZeroHeight = portal.offsetHeight === 0 || portal.clientHeight === 0;
                    var style = window.getComputedStyle(portal);
                    var computedWidth = parseFloat(style.width) || 0;
                    var computedHeight = parseFloat(style.height) || 0;
                    var hasZeroComputed = (computedWidth === 0 && computedHeight === 0);
                    
                    // Hide if empty, has zero dimensions, or has zero computed dimensions
                    if (isEmpty || (hasZeroWidth && hasZeroHeight) || hasZeroComputed) {
                      portal.style.setProperty('display', 'none', 'important');
                      portal.style.setProperty('visibility', 'hidden', 'important');
                      portal.style.setProperty('width', '0', 'important');
                      portal.style.setProperty('height', '0', 'important');
                      portal.style.setProperty('overflow', 'hidden', 'important');
                      portal.style.setProperty('position', 'absolute', 'important');
                      portal.style.setProperty('pointer-events', 'none', 'important');
                      portal.style.setProperty('opacity', '0', 'important');
                      portal.style.setProperty('top', '-9999px', 'important');
                      portal.style.setProperty('left', '-9999px', 'important');
                      portal.style.setProperty('z-index', '-9999', 'important');
                      portal.setAttribute('hidden', '');
                      portal.setAttribute('aria-hidden', 'true');
                    }
                  }
                }
                
                // Run immediately
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', hideEmptyPortals);
                } else {
                  hideEmptyPortals();
                }
                
                // Also watch for new portals
                var observer = new MutationObserver(function(mutations) {
                  var shouldCheck = false;
                  mutations.forEach(function(mutation) {
                    for (var j = 0; j < mutation.addedNodes.length; j++) {
                      var node = mutation.addedNodes[j];
                      if (node.nodeName === 'NEXTJS-PORTAL' || (node.querySelector && node.querySelector('nextjs-portal'))) {
                        shouldCheck = true;
                      }
                    }
                  });
                  if (shouldCheck) {
                    setTimeout(hideEmptyPortals, 10);
                  }
                });
                
                if (document.body) {
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                } else {
                  document.addEventListener('DOMContentLoaded', function() {
                    observer.observe(document.body, {
                      childList: true,
                      subtree: true
                    });
                  });
                }
                
                // Fallback interval
                setInterval(hideEmptyPortals, 500);
              })();
            `,
          }}
        />
      </body>
    </Html>
  );
}

