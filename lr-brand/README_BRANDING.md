LRRecords branding wrapper for GrooveScribe

What this folder does
- lr-brand/index.html — a branded wrapper page that embeds the GrooveScribe app using an iframe.
- lr-brand/css/lr-brand.css — styling and color variables based on the provided palette.
- lr-brand/assets/lrrecords-logo.png — logo (replace with your supplied PNG/SVG if preferred).

How to use / deploy
Option A — Host on the same site (recommended)
1. Copy the lr-brand folder into your site under /drumming-tutor/ so the wrapper will sit at:
   /drumming-tutor/index.html
2. Ensure the iframe src in lr-brand/index.html points to the app root you want:
   - If you left the app at repo root (index.html), iframe src="../index.html" works when lr-brand is inside a subfolder.
   - If you copy the whole app into lr-brand/app/, set iframe src="./app/index.html".
3. Upload the folder to your host. Visit https://lrrecords.com.au/drumming-tutor to verify.

Option B — Deploy wrapper as a static folder (Netlify/GitHub Pages/Vercel)
1. Deploy lr-brand folder as the root of a static site and use the published URL in EasyFunnels embed widget (iframe).

Embed on EasyFunnels page
- Use the EasyFunnels "embed code" widget (HTML) and paste this minimal iframe:

  <iframe src="https://lrrecords.com.au/drumming-tutor/" style="width:100%;height:900px;border:0;" title="LRRecords Drummer"></iframe>

Customization notes
- Replace lr-brand/assets/lrrecords-logo.png with your preferred PNG/SVG for exact branding.
- If you prefer removing the iframe and applying branding directly inside the GrooveScribe pages, I can update the app's index.html and CSS in-place (replace logos, add the CSS variables to the app's stylesheet, etc.). This requires modifying files across the repo.

Next step
- I have added the wrapper index.html to the branch. I will now add the CSS and README and include the uploaded PNG into lr-brand/assets/lrrecords-logo.png and open the PR.