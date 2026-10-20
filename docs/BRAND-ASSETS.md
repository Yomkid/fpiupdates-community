# FpiUpdates transparent logos · v0.17.1

Assets in frontend/public:
- brand-logo-color.png: enhanced 1254 × 1254 transparent colour master.
- brand-logo-color.webp: 768 × 768 optimised browser asset used by BrandMark.
- brand-logo-white.png / brand-logo-black.png: matching solid monochrome exports with transparent FPI and Updates cut-out lettering.
- brand-logo-white.svg / brand-logo-black.svg: self-contained monochrome wrappers with embedded alpha artwork; these contain a raster mask, not traced vector outlines.

The colour logo stays in use in both light and dark appearance. No opaque white square is present. BrandMark is shared by desktop/mobile branding and the public landing page. Only the outer arrow region rotates; the centre stays stationary. Reduced-motion preference disables the animation. The old JPEG is retained as the source reference but is no longer requested by the UI.

The built-in image-generation tool enhanced the supplied original. Colour prompt: preserve the green disc, black FPI/Updates words, black outline and two orange orbiting arrows; sharpen/clean the edges and remove all white canvas/gaps to alpha transparency. Monochrome prompt: preserve the logo layout, use solid monochrome ink and cut the words out as transparent holes. The matching white and black exports share the same alpha silhouette, with their ink normalised for consistent colour. No lettering is baked onto a background colour.

Frontend production build and asset alpha/monochrome checks pass. No backend behavior or SQL migrations changed, so the API suite from v0.17.0 was not repeated for this branding patch. A new browser screenshot run was not performed in this environment.

Upgrade from v0.17: stop the apps, extract into a new folder and run upgrade-from-v017.ps1. This preserves the environment, database configuration and default uploads and backs up the database before setup. Keep the previous project and backup until checked. After upgrading, reload the browser to request the new artwork.
